// Copyright (c) Individual contributors (clap).
// SPDX-License-Identifier: MIT OR Apache-2.0
// Reimplements clap_builder 4.5.56 src/builder/styled_str.rs (with the `color`, `help` and
// `wrap_help` features) for the JavaScript port of sharkdp/pastel v0.12.0.

import { rustTrim, rustTrimEnd } from '../../lib/rustfmt.js';
import { stripStr, stripStrRanges } from './strip.js';
import { displayWidth, findWordsAsciiSpace, LineWrapper, splitInclusiveNewline } from './textwrap.js';

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

/**
 * Terminal-styling container: text with embedded ANSI escape codes.
 */
export class StyledStr {
  /**
   * @param {string} [text]
   */
  constructor(text = '') {
    this.text = text;
  }

  /** @returns {StyledStr} */
  clone() {
    return new StyledStr(this.text);
  }

  /**
   * Appends plain (possibly pre-styled) text.
   *
   * @param {string} msg
   * @returns {StyledStr} this
   */
  pushStr(msg) {
    this.text += msg;
    return this;
  }

  /**
   * Appends another styled string.
   *
   * @param {StyledStr} other
   * @returns {StyledStr} this
   */
  pushStyled(other) {
    this.text += other.text;
    return this;
  }

  /** Removes a leading line that only contains whitespace (`trim_start_lines`). */
  trimStartLines() {
    const pos = this.text.indexOf('\n');
    if (pos >= 0 && rustTrim(this.text.slice(0, pos + 1)) === '') {
      this.text = this.text.slice(pos + 1);
    }
  }

  /** Rust `trim_end` of the whole buffer. */
  trimEnd() {
    this.text = rustTrimEnd(this.text);
  }

  /** Replaces the `{n}` placeholder with a newline. */
  replaceNewlineVar() {
    this.text = this.text.split('{n}').join('\n');
  }

  /**
   * Prefixes the text with `initial` and every following line with `trailing`.
   *
   * @param {string} initial
   * @param {string} trailing
   */
  indent(initial, trailing) {
    this.text = (initial + this.text).split('\n').join('\n' + trailing);
  }

  /**
   * Wraps the printable text at `hardWidth` columns, preserving the escape codes in between.
   *
   * @param {number} hardWidth
   */
  wrap(hardWidth) {
    const bytes = ENCODER.encode(this.text);
    let out = '';
    let last = 0;
    const wrapper = new LineWrapper(hardWidth);
    for (const [start, end] of stripStrRanges(bytes)) {
      if (last !== start) {
        out += DECODER.decode(bytes.subarray(last, start));
      }
      last = end;
      const content = DECODER.decode(bytes.subarray(start, end));
      splitInclusiveNewline(content).forEach((line, i) => {
        if (i > 0) {
          wrapper.reset();
        }
        out += wrapper.wrap(findWordsAsciiSpace(line)).join('');
      });
    }
    if (last !== bytes.length) {
      out += DECODER.decode(bytes.subarray(last));
    }
    this.text = rustTrimEnd(out);
  }

  /** @returns {number} the display width of the printable text */
  displayWidth() {
    let width = 0;
    for (const chunk of stripStr(this.text)) {
      width += displayWidth(chunk);
    }
    return width;
  }

  /** @returns {boolean} */
  isEmpty() {
    return this.text === '';
  }

  /** @returns {string} the text including ANSI escape codes */
  ansi() {
    return this.text;
  }

  /** @returns {string} the printable text without escape codes (Rust `Display`) */
  toString() {
    return stripStr(this.text).join('');
  }
}
