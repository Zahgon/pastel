// Copyright (c) David Peter and pastel contributors.
// SPDX-License-Identifier: MIT OR Apache-2.0
// JavaScript port of src/cli/commands/io.rs from sharkdp/pastel v0.12.0.
// Also contains the synchronous stand-in for Rust's buffered `std::io::stdin()`.

import fs from 'node:fs';
import tty from 'node:tty';

import { parseColor } from '../../lib/parser.js';
import { parseF64, rustTrim } from '../../lib/rustfmt.js';
import { printColorspectrum, runExternalColorpicker } from '../colorpicker.js';
import { ErrorKind, IoError, PastelError } from '../error.js';
import { STRICT_UTF8 } from '../output.js';

/** Capacity of the buffer of Rust's `std::io::stdin()`. */
const STDIN_BUF_SIZE = 8 * 1024;

/**
 * One `read(2)` call on a file descriptor with the error handling of Rust's raw stdin: `EINTR` is
 * retried, `EBADF` (closed stdin) reads as end of file. Other errors, including `EAGAIN` on a
 * non-blocking descriptor without data, are thrown as `IoError`.
 * @param {number} fd
 * @param {Uint8Array} buffer
 * @returns {number} number of bytes read, 0 at end of file
 */
function readRaw(fd, buffer) {
  for (;;) {
    try {
      return fs.readSync(fd, buffer, 0, buffer.length, null);
    } catch (err) {
      if (err.code === 'EINTR') {
        continue;
      }
      if (err.code === 'EBADF') {
        return 0;
      }
      if (err.code === 'EOF') {
        return 0;
      }
      throw IoError.fromNodeError(err);
    }
  }
}

/**
 * Buffered, synchronous reader for standard input with the semantics of Rust's `StdinLock`
 * (`BufRead::read_line` and `Read::read_to_string`). All reads share one buffer, so a line read
 * with `-` and a following read of the remaining input see consecutive data.
 */
class StdinReader {
  /** @param {number} fd */
  constructor(fd) {
    this.fd = fd;
    this.buffer = new Uint8Array(STDIN_BUF_SIZE);
    this.position = 0;
    this.filled = 0;
  }

  /**
   * `BufRead::fill_buf`: returns the buffered bytes, reading from the descriptor if none are left.
   * @returns {Uint8Array}
   */
  fillBuf() {
    if (this.position >= this.filled) {
      this.filled = readRaw(this.fd, this.buffer);
      this.position = 0;
    }
    return this.buffer.subarray(this.position, this.filled);
  }

  /** @param {number} amount */
  consume(amount) {
    this.position = Math.min(this.position + amount, this.filled);
  }

  /**
   * `BufRead::read_line`: reads up to and including the next `\n` (or to the end of the input).
   * Returns an empty string at end of file. Throws an `IoError` if reading fails or the line is not
   * valid UTF-8 (the bytes of the line are consumed either way).
   * @returns {string}
   */
  readLine() {
    const chunks = [];
    for (;;) {
      const available = this.fillBuf();
      const newline = available.indexOf(0x0a);
      if (newline !== -1) {
        chunks.push(available.slice(0, newline + 1));
        this.consume(newline + 1);
        break;
      }
      if (available.length === 0) {
        break;
      }
      chunks.push(available.slice());
      this.consume(available.length);
    }
    return decodeUtf8(Buffer.concat(chunks));
  }

  /**
   * `Read::read_to_string`: reads everything up to the end of the input. Throws an `IoError` if
   * reading fails or the data is not valid UTF-8.
   * @returns {string}
   */
  readToString() {
    const chunks = [this.buffer.slice(this.position, this.filled)];
    this.position = this.filled;
    for (;;) {
      const chunk = new Uint8Array(STDIN_BUF_SIZE * 4);
      const n = readRaw(this.fd, chunk);
      if (n === 0) {
        break;
      }
      chunks.push(chunk.subarray(0, n));
    }
    return decodeUtf8(Buffer.concat(chunks));
  }
}

/**
 * Decodes UTF-8 like `str::from_utf8` (a byte order mark is kept).
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function decodeUtf8(bytes) {
  try {
    return STRICT_UTF8.decode(bytes);
  } catch {
    throw IoError.invalidUtf8();
  }
}

/** The process' standard input. */
export const STDIN = new StdinReader(0);

/** `io::stdin().is_terminal()`. */
function stdinIsTerminal() {
  return tty.isatty(0);
}

/**
 * Parses a numerical argument with Rust's `str::parse::<f64>` grammar.
 * @param {import('../clap/arg_matcher.js').ArgMatches} matches
 * @param {string} name
 * @returns {number}
 */
export function numberArg(matches, name) {
  const valueStr = matches.getOne(name);
  const value = parseF64(valueStr);
  if (value === null) {
    throw PastelError.couldNotParseNumber(valueStr);
  }
  return value;
}

/** Whether the color spectrum still needs to be shown before running a color picker. */
export const PrintSpectrum = Object.freeze({ Yes: 'Yes', No: 'No' });

/**
 * Iterator over the input colors of a command: the positional color arguments or, if there are
 * none, one color per line of standard input. Errors are thrown from `next()`.
 */
export class ColorArgIterator {
  /**
   * @param {'FromPositionalArguments'|'FromStdin'} variant
   * @param {import('../config.js').Config|null} config
   * @param {string[]} args
   * @param {{value: string}} printSpectrum
   */
  constructor(variant, config, args, printSpectrum) {
    this.variant = variant;
    this.config = config;
    this.args = args;
    this.index = 0;
    this.printSpectrum = printSpectrum;
  }

  /**
   * Iterates over the given positional color arguments.
   * @param {import('../config.js').Config} config
   * @param {string[]} positionals
   * @param {string} printSpectrum One of `PrintSpectrum`.
   * @returns {ColorArgIterator}
   */
  static fromPositionalArguments(config, positionals, printSpectrum) {
    return new ColorArgIterator('FromPositionalArguments', config, positionals, { value: printSpectrum });
  }

  /**
   * Iterates over the lines of standard input.
   * @returns {ColorArgIterator}
   */
  static fromStdin() {
    return new ColorArgIterator('FromStdin', null, [], { value: PrintSpectrum.No });
  }

  /**
   * Chooses the color source: the positional arguments if present, else standard input (which
   * must not be a terminal).
   * @param {import('../config.js').Config} config
   * @param {string[]|undefined} args
   * @returns {ColorArgIterator}
   */
  static fromArgs(config, args) {
    if (args !== undefined && args !== null) {
      return ColorArgIterator.fromPositionalArguments(config, args, PrintSpectrum.Yes);
    }
    if (stdinIsTerminal()) {
      throw PastelError.colorArgRequired();
    }
    return ColorArgIterator.fromStdin();
  }

  /**
   * Reads one line from standard input and parses it as a color.
   * @returns {import('../../lib/color.js').Color}
   */
  static colorFromStdin() {
    let line;
    try {
      line = STDIN.readLine();
    } catch (err) {
      if (err instanceof IoError) {
        throw PastelError.colorInvalidUtf8();
      }
      throw err;
    }

    if (line.length === 0) {
      throw PastelError.couldNotReadFromStdin();
    }

    const trimmed = rustTrim(line);

    const color = parseColor(trimmed);
    if (color === null) {
      throw PastelError.colorParseError(trimmed);
    }
    return color;
  }

  /**
   * Converts a color argument: `-` reads a color from standard input, `pick` runs the external
   * color picker (showing the spectrum first if `printSpectrum.value` is `Yes`), anything else is
   * parsed as a color.
   * @param {import('../config.js').Config} config
   * @param {string} arg
   * @param {{value: string}} printSpectrum
   * @returns {import('../../lib/color.js').Color}
   */
  static fromColorArg(config, arg, printSpectrum) {
    switch (arg) {
      case '-':
        return ColorArgIterator.colorFromStdin();
      case 'pick': {
        if (printSpectrum.value === PrintSpectrum.Yes) {
          printColorspectrum(config);
          printSpectrum.value = PrintSpectrum.No;
        }
        const colorStr = runExternalColorpicker(config.colorpicker);
        return ColorArgIterator.fromColorArg(config, colorStr, printSpectrum);
      }
      default: {
        const color = parseColor(arg);
        if (color === null) {
          throw PastelError.colorParseError(arg);
        }
        return color;
      }
    }
  }

  /**
   * @returns {IteratorResult<import('../../lib/color.js').Color>}
   */
  next() {
    if (this.variant === 'FromPositionalArguments') {
      if (this.index >= this.args.length) {
        return { done: true, value: undefined };
      }
      const colorArg = this.args[this.index];
      this.index += 1;
      return { done: false, value: ColorArgIterator.fromColorArg(this.config, colorArg, this.printSpectrum) };
    }

    try {
      return { done: false, value: ColorArgIterator.colorFromStdin() };
    } catch (err) {
      if (err instanceof PastelError && err.kind === ErrorKind.CouldNotReadFromStdin) {
        return { done: true, value: undefined };
      }
      throw err;
    }
  }

  [Symbol.iterator]() {
    return this;
  }
}
