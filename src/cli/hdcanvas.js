// Copyright (c) David Peter and pastel contributors.
// SPDX-License-Identifier: MIT OR Apache-2.0
// JavaScript port of src/cli/hdcanvas.rs from sharkdp/pastel v0.12.0.

import { ansiStyle } from '../lib/ansi.js';
import { Panic } from './error.js';

/**
 * Lines of the `assert!`s in src/cli/hdcanvas.rs, reported in the panic messages: the
 * constructor, `draw_text` and the row/column bounds checks of the four cell accessors.
 */
const ASSERT_LINES = Object.freeze({
  new: 18,
  drawText: 71,
  pixel: [123, 124],
  pixelMut: [129, 130],
  char: [135, 136],
  charMut: [141, 142],
});

/**
 * Rust `assert!`: panics with "assertion failed: <expression>" at the given source line.
 * @param {boolean} condition
 * @param {string} expression
 * @param {number} line Line of the assertion in src/cli/hdcanvas.rs.
 */
function assert(condition, expression, line) {
  if (!condition) {
    throw new Panic(`assertion failed: ${expression}`, `src/cli/hdcanvas.rs:${line}:9`);
  }
}

/**
 * A character canvas with twice the vertical resolution of the terminal: every text row shows two
 * pixel rows by means of the half-block characters.
 */
export class Canvas {
  /**
   * @param {number} height Height in pixels (must be even).
   * @param {number} width
   * @param {import('../lib/ansi.js').Brush} brush
   */
  constructor(height, width, brush) {
    assert(height % 2 === 0, 'height % 2 == 0', ASSERT_LINES.new);

    this.height = height;
    this.width = width;
    /** @type {(import('../lib/color.js').Color | null)[]} */
    this.pixels = new Array(height * width).fill(null);
    /** @type {(string | null)[]} */
    this.chars = new Array((height / 2) * width).fill(null);
    this.brush = brush;
  }

  /**
   * Paints a rectangle, compositing the color over pixels that are already set.
   * @param {number} row
   * @param {number} col
   * @param {number} height
   * @param {number} width
   * @param {import('../lib/color.js').Color} color
   */
  drawRect(row, col, height, width, color) {
    for (let i = 0; i < height; i++) {
      for (let j = 0; j < width; j++) {
        const index = this.#pixelIndex(row + i, col + j, ASSERT_LINES.pixelMut);
        const backdrop = this.pixels[index];
        this.pixels[index] = backdrop !== null ? backdrop.composite(color) : color.clone();
      }
    }
  }

  /**
   * Paints a checkerboard pattern of single pixels.
   * @param {number} row
   * @param {number} col
   * @param {number} height
   * @param {number} width
   * @param {import('../lib/color.js').Color} dark
   * @param {import('../lib/color.js').Color} light
   */
  drawCheckerboard(row, col, height, width, dark, light) {
    for (let i = 0; i < height; i++) {
      for (let j = 0; j < width; j++) {
        const color = (i + j) % 2 === 0 ? dark : light;
        this.pixels[this.#pixelIndex(row + i, col + j, ASSERT_LINES.pixelMut)] = color.clone();
      }
    }
  }

  /**
   * Places text at a pixel row (must be even) and column, one character per column.
   * @param {number} row
   * @param {number} col
   * @param {string} text
   */
  drawText(row, col, text) {
    assert(row % 2 === 0, 'row % 2 == 0', ASSERT_LINES.drawText);

    let j = 0;
    for (const c of text) {
      this.chars[this.#charIndex(row / 2, col + j, ASSERT_LINES.charMut)] = c;
      j += 1;
    }
  }

  /**
   * Writes the canvas to the output handle, one line per pair of pixel rows. Write errors
   * propagate as `PastelError`.
   * @param {import('./output.js').Writer} out
   */
  print(out) {
    for (let iDiv2 = 0; iDiv2 < this.height / 2; iDiv2++) {
      let line = '';
      for (let j = 0; j < this.width; j++) {
        const c = this.chars[this.#charIndex(iDiv2, j, ASSERT_LINES.char)];
        if (c !== null) {
          line += c;
          continue;
        }

        const top = this.pixels[this.#pixelIndex(2 * iDiv2, j, ASSERT_LINES.pixel)];
        const bottom = this.pixels[this.#pixelIndex(2 * iDiv2 + 1, j, ASSERT_LINES.pixel)];

        if (top !== null && bottom !== null) {
          const symbol = top.equals(bottom) ? ' ' : '▀';
          line += this.brush.paint(symbol, ansiStyle(top).on(bottom));
        } else if (top !== null) {
          line += this.brush.paint('▀', ansiStyle(top));
        } else if (bottom !== null) {
          line += this.brush.paint('▄', ansiStyle(bottom));
        } else {
          line += ' ';
        }
      }
      out.write(`${line}\n`);
    }
  }

  /**
   * Index of a pixel, with the bounds checks of the Rust accessors.
   * @param {number} i
   * @param {number} j
   * @param {readonly number[]} assertLines Source lines of the row and column assertions.
   * @returns {number}
   */
  #pixelIndex(i, j, [rowLine, colLine]) {
    assert(i < this.height, 'i < self.height', rowLine);
    assert(j < this.width, 'j < self.width', colLine);
    return i * this.width + j;
  }

  /**
   * Index of a character cell, with the bounds checks of the Rust accessors.
   * @param {number} i
   * @param {number} j
   * @param {readonly number[]} assertLines Source lines of the row and column assertions.
   * @returns {number}
   */
  #charIndex(i, j, [rowLine, colLine]) {
    assert(i < this.height / 2, 'i < self.height / 2', rowLine);
    assert(j < this.width, 'j < self.width', colLine);
    return i * this.width + j;
  }
}
