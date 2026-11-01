// Copyright (c) David Peter and pastel contributors.
// SPDX-License-Identifier: MIT OR Apache-2.0
// JavaScript port of src/cli/output.rs from sharkdp/pastel v0.12.0.
// Also contains the synchronous writers that stand in for Rust's `std::io::stdout()` (a
// line-buffered `LineWriter`) and `std::io::stderr()` (unbuffered).

import fs from 'node:fs';
import tty from 'node:tty';

import { Brush, UnknownColorModeError } from '../lib/ansi.js';
import { Color, Format } from '../lib/color.js';
import { IoError, PastelError } from './error.js';
import { Canvas } from './hdcanvas.js';
import { similarColors } from './utility.js';

/**
 * A text sink such as `STDOUT` or `STDERR` (the port's counterpart of `&mut dyn Write`).
 * `write` throws a `PastelError` if writing fails.
 * @typedef {{write(text: string): void}} Writer
 */

const ENCODER = new TextEncoder();

/** Decodes UTF-8 as strictly as `str::from_utf8`: invalid bytes throw, a byte order mark is kept. */
export const STRICT_UTF8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

const SLEEP_CELL = new Int32Array(new SharedArrayBuffer(4));

/** Capacity of the buffer of Rust's `std::io::stdout()`. */
const STDOUT_BUF_SIZE = 1024;

/**
 * Whether `EFBIG` comes from a file size limit (`ulimit -f`), for which the kernel also raises
 * `SIGXFSZ`, rather than from the maximum file size of the file system.
 * @returns {boolean}
 */
function fileSizeIsLimited() {
  try {
    return !/^Max file size\s+unlimited\b/m.test(fs.readFileSync('/proc/self/limits', 'latin1'));
  } catch {
    // Unreadable limits: assume a limit, the usual cause of `EFBIG`. The original needs no such
    // guess, as the kernel only raises `SIGXFSZ`, which ends it, if a limit was exceeded.
    return true;
  }
}

/**
 * Ends the process through the default action of `SIGXFSZ`, the fate of a Rust program that
 * exceeds the file size limit. Node.js ignores this signal at startup; removing the last listener
 * makes libuv restore the default action.
 * @returns {never}
 */
function dieOfSigxfsz() {
  const listener = () => {};
  process.on('SIGXFSZ', listener);
  process.removeListener('SIGXFSZ', listener);
  process.kill(process.pid, 'SIGXFSZ');
  Atomics.wait(SLEEP_CELL, 0, 0);
  throw new Error('SIGXFSZ did not end the process');
}

/**
 * One `write(2)` call with the error handling of Rust's raw stdio handles: `EINTR` is retried and
 * `EBADF` (the stream was closed before pastel started) counts as success, so that output to a
 * closed stream is silently discarded like Rust does. `EAGAIN` is an error like any other, except
 * on a terminal, which Node.js itself makes non-blocking when the stream object used for the
 * terminal width is created. Other errors are thrown as `PastelError` (a broken pipe becomes
 * `StdoutClosed`).
 * @param {number} fd
 * @param {Uint8Array} bytes
 * @param {number} offset
 * @returns {number} number of bytes written
 */
function writeRaw(fd, bytes, offset) {
  for (;;) {
    try {
      return fs.writeSync(fd, bytes, offset, bytes.length - offset);
    } catch (err) {
      if (err.code === 'EINTR') {
        continue;
      }
      if (err.code === 'EAGAIN' && tty.isatty(fd)) {
        Atomics.wait(SLEEP_CELL, 0, 0, 1);
        continue;
      }
      if (err.code === 'EBADF') {
        return bytes.length - offset;
      }
      if (err.code === 'EFBIG' && fileSizeIsLimited()) {
        dieOfSigxfsz();
      }
      throw PastelError.fromIoError(IoError.fromNodeError(err));
    }
  }
}

/**
 * `Write::write_all` on a raw file descriptor.
 * @param {number} fd
 * @param {Uint8Array} bytes
 */
function writeAllRaw(fd, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    const n = writeRaw(fd, bytes, offset);
    if (n === 0) {
      throw PastelError.fromIoError(IoError.writeZero());
    }
    offset += n;
  }
}

/** Unbuffered writer on a file descriptor (Rust's `std::io::stderr()`). */
class RawWriter {
  /** @param {number} fd */
  constructor(fd) {
    this.fd = fd;
  }

  /**
   * Writes the whole text, throwing a `PastelError` on failure.
   * @param {string} text
   */
  write(text) {
    writeAllRaw(this.fd, ENCODER.encode(text));
  }
}

/**
 * Line-buffered writer (Rust's `LineWriter` around stdout): complete lines are written
 * immediately, an incomplete last line stays buffered until a later newline, a full buffer or the
 * final flush at exit.
 */
class LineWriter {
  #fd;
  #buffer = new Uint8Array(STDOUT_BUF_SIZE);
  #length = 0;

  /** @param {number} fd */
  constructor(fd) {
    this.#fd = fd;
  }

  /**
   * Writes the text, throwing a `PastelError` on failure. Like `writeln!`, this hands a final
   * newline to `write_all` on its own: the rest of the line goes to the buffer first, which decides
   * what a failing write reports and what is left for the final flush.
   * @param {string} text
   */
  write(text) {
    const bytes = ENCODER.encode(text);
    const last = bytes.length - 1;
    if (last > 0 && bytes[last] === 0x0a) {
      this.#writeAll(bytes.subarray(0, last));
      this.#writeAll(bytes.subarray(last));
    } else {
      this.#writeAll(bytes);
    }
  }

  /**
   * `LineWriterShim::write_all`.
   * @param {Uint8Array} bytes
   */
  #writeAll(bytes) {
    const newlineIndex = bytes.lastIndexOf(0x0a);
    if (newlineIndex === -1) {
      if (this.#length > 0 && this.#buffer[this.#length - 1] === 0x0a) {
        this.#flushBuf();
      }
      this.#bufferWriteAll(bytes);
      return;
    }
    const lines = bytes.subarray(0, newlineIndex + 1);
    const tail = bytes.subarray(newlineIndex + 1);
    if (this.#length === 0) {
      writeAllRaw(this.#fd, lines);
    } else {
      this.#bufferWriteAll(lines);
      this.#flushBuf();
    }
    this.#bufferWriteAll(tail);
  }

  /** Writes out everything that is buffered, throwing a `PastelError` on failure. */
  flush() {
    this.#flushBuf();
  }

  /** `BufWriter::flush_buf`: bytes that could not be written stay in the buffer. */
  #flushBuf() {
    const pending = this.#buffer.subarray(0, this.#length);
    let written = 0;
    try {
      while (written < pending.length) {
        const n = writeRaw(this.#fd, pending, written);
        if (n === 0) {
          throw PastelError.fromIoError(IoError.writeZeroBuffered());
        }
        written += n;
      }
    } finally {
      this.#buffer.copyWithin(0, written, this.#length);
      this.#length -= written;
    }
  }

  /**
   * `BufWriter::write_all`: buffers the bytes, writing them directly if they do not fit into the
   * (flushed) buffer.
   * @param {Uint8Array} bytes
   */
  #bufferWriteAll(bytes) {
    if (bytes.length > this.#buffer.length - this.#length) {
      this.#flushBuf();
    }
    if (bytes.length >= this.#buffer.length) {
      writeAllRaw(this.#fd, bytes);
    } else {
      this.#buffer.set(bytes, this.#length);
      this.#length += bytes.length;
    }
  }
}

/** The process' standard output (line buffered, like Rust's `std::io::stdout()`). */
export const STDOUT = new LineWriter(1);

/** The process' standard error (unbuffered, like Rust's `std::io::stderr()`). */
export const STDERR = new RawWriter(2);

/**
 * `Brush::from_environment(&stream)?` for a standard stream: colors only if the stream is a
 * terminal; an invalid `PASTEL_COLOR_MODE` becomes a `PastelError`.
 * @param {number} fd
 * @param {Record<string, string | undefined>} env
 * @returns {Brush}
 */
export function environmentBrush(fd, env) {
  try {
    return Brush.fromEnvironment(tty.isatty(fd), env);
  } catch (err) {
    if (err instanceof UnknownColorModeError) {
      throw PastelError.fromUnknownColorModeError(err);
    }
    throw err;
  }
}

/**
 * Writes colors to the output handle, either as text or as a terminal graphic. Write errors
 * propagate to the caller as `PastelError` (Rust's `?`).
 */
export class Output {
  /** @param {Writer} handle */
  constructor(handle) {
    this.handle = handle;
    this.colorsShown = 0;
  }

  /**
   * Draws a checkerboard with the color panel, its hex/RGB/HSL representations and the most
   * similar named colors.
   * @param {import('./config.js').Config} config
   * @param {Color} color
   */
  showColorTty(config, color) {
    const checkerboardSize = 16;
    const colorPanelSize = 12;

    const checkerboardPositionY = 0;
    const checkerboardPositionX = config.padding;
    const colorPanelPositionY = checkerboardPositionY + Math.trunc((checkerboardSize - colorPanelSize) / 2);
    const colorPanelPositionX = config.padding + Math.trunc((checkerboardSize - colorPanelSize) / 2);
    const textPositionX = checkerboardSize + 2 * config.padding;
    const textPositionY = 0;

    const canvas = new Canvas(checkerboardSize, 60, config.brush);
    canvas.drawCheckerboard(
      checkerboardPositionY,
      checkerboardPositionX,
      checkerboardSize,
      checkerboardSize,
      Color.graytone(0.94),
      Color.graytone(0.71),
    );
    canvas.drawRect(colorPanelPositionY, colorPanelPositionX, colorPanelSize, colorPanelSize, color);

    let textYOffset = 0;
    const similar = similarColors(color);

    for (const [i, nc] of similar.slice(0, 3).entries()) {
      if (nc.color.equals(color)) {
        canvas.drawText(textPositionY, textPositionX, `Name: ${nc.name}`);
        textYOffset = 2;
        continue;
      }

      canvas.drawText(textPositionY + 10 + 2 * i, textPositionX + 7, nc.name);
      canvas.drawRect(textPositionY + 10 + 2 * i, textPositionX + 1, 2, 5, nc.color);
    }

    canvas.drawText(textPositionY + 0 + textYOffset, textPositionX, `Hex: ${color.toRgbHexString(true)}`);
    canvas.drawText(textPositionY + 2 + textYOffset, textPositionX, `RGB: ${color.toRgbString(Format.Spaces)}`);
    canvas.drawText(textPositionY + 4 + textYOffset, textPositionX, `HSL: ${color.toHslString(Format.Spaces)}`);

    canvas.drawText(textPositionY + 8 + textYOffset, textPositionX, 'Most similar:');

    canvas.print(this.handle);
  }

  /**
   * Shows a color: as a terminal graphic in interactive mode, otherwise as `hsl(...)` text line.
   * @param {import('./config.js').Config} config
   * @param {Color} color
   */
  showColor(config, color) {
    if (config.interactiveMode) {
      if (this.colorsShown < 1) {
        this.handle.write('\n');
      }
      this.showColorTty(config, color);
      this.handle.write('\n');
    } else {
      this.handle.write(`${color.toHslString(Format.NoSpaces)}\n`);
    }
    this.colorsShown += 1;
  }
}
