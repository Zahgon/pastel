// Copyright (c) Individual contributors (clap).
// SPDX-License-Identifier: MIT OR Apache-2.0
// Reimplements clap_lex 0.7.4 src/lib.rs (RawArgs, ArgCursor, ParsedArg, ShortFlags) for the
// JavaScript port of sharkdp/pastel v0.12.0. An `OsStr` is a JavaScript string if it is valid
// UTF-8 and an {@link InvalidOsStr} otherwise.

import { Buffer, isUtf8 } from 'node:buffer';
import { readFileSync } from 'node:fs';

const MINUS = 0x2d;
const EQUALS = 0x3d;
const REPLACEMENT_CHARACTER = '�';

/**
 * An OS string that is not valid UTF-8.
 */
export class InvalidOsStr {
  /**
   * @param {Buffer} bytes
   */
  constructor(bytes) {
    this.bytes = bytes;
  }

  /** @returns {string} the text with invalid sequences replaced (`to_string_lossy`) */
  toStringLossy() {
    return this.bytes.toString('utf8');
  }

  /** @returns {boolean} */
  startsWithDoubleDash() {
    return this.bytes[0] === MINUS && this.bytes[1] === MINUS;
  }

  /** @returns {boolean} */
  startsWithDash() {
    return this.bytes[0] === MINUS;
  }
}

/**
 * @param {Buffer} bytes
 * @returns {string | InvalidOsStr}
 */
function osStrFromBytes(bytes) {
  return isUtf8(bytes) ? bytes.toString('utf8') : new InvalidOsStr(bytes);
}

/**
 * `OsStr::to_string_lossy`.
 *
 * @param {string | InvalidOsStr} os
 * @returns {string}
 */
export function osStrDisplay(os) {
  return os instanceof InvalidOsStr ? os.toStringLossy() : os;
}

/**
 * Length of the longest valid UTF-8 prefix (`Utf8Error::valid_up_to`).
 *
 * @param {Buffer} bytes
 * @returns {number}
 */
function validUpTo(bytes) {
  const lossy = bytes.toString('utf8');
  let offset = 0;
  let last = 0;
  for (let i = lossy.indexOf(REPLACEMENT_CHARACTER); i >= 0; i = lossy.indexOf(REPLACEMENT_CHARACTER, i + 1)) {
    offset += Buffer.byteLength(lossy.slice(last, i));
    last = i;
    const isLiteral = bytes[offset] === 0xef && bytes[offset + 1] === 0xbf && bytes[offset + 2] === 0xbd;
    if (!isLiteral) {
      return offset;
    }
  }
  return bytes.length;
}

/**
 * Recovers the raw bytes of the arguments. Node.js only offers lossily decoded arguments, so if
 * any of them may have lost something, the original bytes are taken from `/proc/self/cmdline`.
 * Without `/proc`, or if it does not agree with `args`, the arguments stay as they are.
 *
 * @param {string[]} args
 * @returns {Array<string | InvalidOsStr>}
 */
export function restoreInvalidUtf8(args) {
  if (!args.some((arg) => arg.includes(REPLACEMENT_CHARACTER))) {
    return args;
  }
  let cmdline;
  try {
    cmdline = readFileSync('/proc/self/cmdline');
  } catch {
    return args;
  }
  const entries = [];
  let start = 0;
  for (let end = cmdline.indexOf(0); end >= 0; end = cmdline.indexOf(0, start)) {
    entries.push(cmdline.subarray(start, end));
    start = end + 1;
  }
  const tail = entries.slice(-args.length);
  if (tail.length !== args.length || tail.some((bytes, i) => bytes.toString('utf8') !== args[i])) {
    return args;
  }
  return tail.map(osStrFromBytes);
}

/**
 * Position within {@link RawArgs}.
 */
export class ArgCursor {
  constructor() {
    this.cursor = 0;
  }
}

/**
 * Command-line arguments.
 */
export class RawArgs {
  /**
   * @param {Array<string | InvalidOsStr>} items
   */
  constructor(items) {
    this.items = [...items];
  }

  /** @returns {ArgCursor} a cursor at the start */
  cursor() {
    return new ArgCursor();
  }

  /**
   * Advances the cursor, returning the next argument.
   *
   * @param {ArgCursor} cursor
   * @returns {ParsedArg | null}
   */
  next(cursor) {
    const raw = this.nextOs(cursor);
    return raw === null ? null : new ParsedArg(raw);
  }

  /**
   * Advances the cursor, returning the raw next argument.
   *
   * @param {ArgCursor} cursor
   * @returns {string | InvalidOsStr | null}
   */
  nextOs(cursor) {
    const next = cursor.cursor < this.items.length ? this.items[cursor.cursor] : null;
    cursor.cursor += 1;
    return next;
  }

  /**
   * Returns all remaining raw arguments, advancing the cursor to the end.
   *
   * @param {ArgCursor} cursor
   * @returns {Array<string | InvalidOsStr>}
   */
  remaining(cursor) {
    const rest = this.items.slice(Math.min(cursor.cursor, this.items.length));
    cursor.cursor = this.items.length;
    return rest;
  }
}

/**
 * Does `arg` look like an integer or a float (`clap_lex::is_number`)?
 *
 * @param {string} arg
 * @returns {boolean}
 */
function isNumber(arg) {
  let seenDot = false;
  let positionOfE = null;
  for (let i = 0; i < arg.length; i++) {
    const c = arg[i];
    if (c >= '0' && c <= '9') {
      continue;
    }
    if (c === '.' && !seenDot && positionOfE === null && i > 0) {
      seenDot = true;
    } else if ((c === 'e' || c === 'E') && positionOfE === null && i > 0) {
      positionOfE = i;
    } else {
      return false;
    }
  }
  return positionOfE === null ? true : positionOfE !== arg.length - 1;
}

/**
 * One command-line argument.
 */
export class ParsedArg {
  /**
   * @param {string | InvalidOsStr} inner
   */
  constructor(inner) {
    this.inner = inner;
  }

  /** @returns {boolean} the argument is `-` */
  isStdio() {
    return this.inner === '-';
  }

  /** @returns {boolean} the argument is `--` */
  isEscape() {
    return this.inner === '--';
  }

  /** @returns {boolean} looks like `-3`, `-0.3` or `-33.03` */
  isNegativeNumber() {
    return typeof this.inner === 'string' && this.inner.startsWith('-') && isNumber(this.inner.slice(1));
  }

  /**
   * Treats the argument as a long flag.
   *
   * @returns {[string | InvalidOsStr, string | InvalidOsStr | null] | null} the flag name and the
   *   value after `=`, if any
   */
  toLong() {
    if (this.inner instanceof InvalidOsStr) {
      if (!this.inner.startsWithDoubleDash()) {
        return null;
      }
      const remainder = this.inner.bytes.subarray(2);
      const eq = remainder.indexOf(EQUALS);
      if (eq >= 0) {
        return [osStrFromBytes(remainder.subarray(0, eq)), osStrFromBytes(remainder.subarray(eq + 1))];
      }
      return [osStrFromBytes(remainder), null];
    }
    if (!this.inner.startsWith('--')) {
      return null;
    }
    const remainder = this.inner.slice(2);
    if (remainder === '') {
      return null;
    }
    const eq = remainder.indexOf('=');
    if (eq >= 0) {
      return [remainder.slice(0, eq), remainder.slice(eq + 1)];
    }
    return [remainder, null];
  }

  /** @returns {boolean} can be treated as a long flag */
  isLong() {
    if (this.inner instanceof InvalidOsStr) {
      return this.inner.startsWithDoubleDash();
    }
    return this.inner.startsWith('--') && !this.isEscape();
  }

  /**
   * Treats the argument as a group of short flags.
   *
   * @returns {ShortFlags | null}
   */
  toShort() {
    if (this.inner instanceof InvalidOsStr) {
      if (!this.inner.startsWithDash() || this.inner.startsWithDoubleDash()) {
        return null;
      }
      const remainder = this.inner.bytes.subarray(1);
      const validLength = validUpTo(remainder);
      return new ShortFlags(remainder.toString('utf8', 0, validLength), 0, remainder.subarray(validLength));
    }
    if (!this.inner.startsWith('-')) {
      return null;
    }
    const remainder = this.inner.slice(1);
    if (remainder.startsWith('-') || remainder === '') {
      return null;
    }
    return new ShortFlags(remainder);
  }

  /** @returns {boolean} can be treated as a short flag */
  isShort() {
    if (this.inner instanceof InvalidOsStr) {
      return this.inner.startsWithDash() && !this.inner.startsWithDoubleDash();
    }
    return this.inner.startsWith('-') && !this.isStdio() && !this.inner.startsWith('--');
  }

  /** @returns {string | InvalidOsStr} the raw value */
  toValue() {
    return this.inner;
  }

  /** @returns {string} the value with invalid sequences replaced (`display`) */
  display() {
    return osStrDisplay(this.inner);
  }
}

/**
 * Walks through the short flags within one argument (`-abc`).
 */
class ShortFlags {
  /**
   * @param {string} inner the valid UTF-8 prefix of the argument without its leading `-`
   * @param {number} [pos] index (in UTF-16 units) of the next flag
   * @param {Buffer | null} [invalidSuffix] the rest of the argument, starting at its first invalid
   *   UTF-8 sequence
   */
  constructor(inner, pos = 0, invalidSuffix = null) {
    this.inner = inner;
    this.pos = pos;
    this.invalidSuffix = invalidSuffix;
  }

  /** @returns {ShortFlags} an independent copy of the iterator */
  clone() {
    return new ShortFlags(this.inner, this.pos, this.invalidSuffix);
  }

  /** @returns {boolean} no short flags left */
  isEmpty() {
    return this.invalidSuffix === null && this.pos >= this.inner.length;
  }

  /** @returns {boolean} the remaining flags look like a number */
  isNegativeNumber() {
    return this.invalidSuffix === null && isNumber(this.inner.slice(this.pos));
  }

  /**
   * Advances the iterator, returning the next flag character. The rest of the argument comes as
   * one {@link InvalidOsStr} after the flags of the valid prefix.
   *
   * @returns {string | InvalidOsStr | null}
   */
  nextFlag() {
    if (this.pos >= this.inner.length) {
      return this.takeInvalidSuffix();
    }
    const cp = this.inner.codePointAt(this.pos);
    const ch = String.fromCodePoint(cp);
    this.pos += ch.length;
    return ch;
  }

  /**
   * Advances the iterator, returning everything left as a value.
   *
   * @returns {string | InvalidOsStr | null}
   */
  nextValueOs() {
    if (this.pos >= this.inner.length) {
      return this.takeInvalidSuffix();
    }
    const rest = this.inner.slice(this.pos);
    this.pos = this.inner.length;
    const suffix = this.takeInvalidSuffix();
    return suffix === null ? rest : new InvalidOsStr(Buffer.concat([Buffer.from(rest), suffix.bytes]));
  }

  takeInvalidSuffix() {
    if (this.invalidSuffix === null) {
      return null;
    }
    const suffix = new InvalidOsStr(this.invalidSuffix);
    this.invalidSuffix = null;
    return suffix;
  }
}
