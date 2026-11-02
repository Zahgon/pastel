// Copyright (c) Individual contributors (clap); ported in sharkdp/pastel.
// SPDX-License-Identifier: MIT OR Apache-2.0
// Reimplements clap_builder 4.5.56 src/output/textwrap/{core,word_separators,wrap_algorithms}.rs
// (clap's fork of textwrap, without the `unicode` feature) for the JavaScript port of
// sharkdp/pastel v0.12.0.

import { rustTrim, rustTrimEnd, utf8Len } from '../../lib/rustfmt.js';

/**
 * Display width of `text` (`display_width`): every char counts 1, except ANSI-like control
 * sequences, which start at an ASCII control character and end at the next `m`.
 *
 * @param {string} text
 * @returns {number}
 */
export function displayWidth(text) {
  let width = 0;
  let controlSequence = false;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp < 0x20 || cp === 0x7f) {
      controlSequence = true;
    } else if (controlSequence && ch === 'm') {
      controlSequence = false;
      continue;
    }
    if (!controlSequence) {
      width += 1;
    }
  }
  return width;
}

/**
 * Splits a line into words, each keeping its trailing ASCII spaces (`find_words_ascii_space`).
 *
 * @param {string} line
 * @returns {string[]}
 */
export function findWordsAsciiSpace(line) {
  const words = [];
  let start = 0;
  let inWhitespace = false;
  for (let idx = 0; idx < line.length; ) {
    const cp = line.codePointAt(idx);
    const nextWhitespace = cp === 0x20;
    if (inWhitespace && !nextWhitespace) {
      words.push(line.slice(start, idx));
      start = idx;
    }
    inWhitespace = nextWhitespace;
    idx += cp > 0xffff ? 2 : 1;
  }
  if (start < line.length) {
    words.push(line.slice(start));
  }
  return words;
}

/**
 * Incremental greedy line wrapper (`LineWrapper`).
 */
export class LineWrapper {
  /**
   * @param {number} hardWidth
   */
  constructor(hardWidth) {
    this.hardWidth = hardWidth;
    this.lineWidth = 0;
    this.indentation = null;
  }

  /** Starts a new line of input. */
  reset() {
    this.lineWidth = 0;
    this.indentation = null;
  }

  /**
   * Inserts line breaks between `words` where the line would exceed the hard width.
   *
   * @param {string[]} words
   * @returns {string[]}
   */
  wrap(words) {
    let firstWord = false;
    if (this.indentation === null) {
      firstWord = true;
      if (words.length > 0) {
        this.indentation = rustTrim(words[0]) === '' ? words[0] : '';
      }
    }

    let i = 0;
    while (i < words.length) {
      const word = words[i];
      const trimmed = rustTrimEnd(word);
      const wordWidth = displayWidth(trimmed);
      const trimmedDelta = utf8Len(word) - utf8Len(trimmed);
      if (firstWord && wordWidth > 0) {
        firstWord = false;
      } else if (this.hardWidth < this.lineWidth + wordWidth) {
        if (i > 0) {
          words[i - 1] = rustTrimEnd(words[i - 1]);
        }
        this.lineWidth = 0;
        words.splice(i, 0, '\n');
        i += 1;
        if (this.indentation !== null) {
          words.splice(i, 0, this.indentation);
          this.lineWidth += utf8Len(this.indentation);
          i += 1;
        }
      }
      this.lineWidth += wordWidth + trimmedDelta;
      i += 1;
    }
    return words;
  }
}

/**
 * Rust `str::split_inclusive('\n')`.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function splitInclusiveNewline(text) {
  const parts = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') {
      parts.push(text.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (start < text.length) {
    parts.push(text.slice(start));
  }
  return parts;
}
