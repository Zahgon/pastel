// Copyright (c) David Peter and pastel contributors.
// SPDX-License-Identifier: MIT OR Apache-2.0
// JavaScript port of src/cli/config.rs from sharkdp/pastel v0.12.0.

/** Settings shared by all commands. */
export class Config {
  /**
   * @param {object} options
   * @param {number} options.padding Margin around the terminal graphics (in canvas pixels).
   * @param {number} options.colorpickerWidth Width of the color spectrum shown by `pick`.
   * @param {number} options.colorcheckWidth Width of each color panel shown by `colorcheck`.
   * @param {string|null} options.colorpicker Name of the color picker tool chosen with `--color-picker`.
   * @param {boolean} options.interactiveMode `true` if stdout is a terminal.
   * @param {Record<string, string | undefined>} options.env The environment passed to `main`.
   * @param {import('../lib/ansi.js').Brush} options.brush Brush for colored output on stdout.
   */
  constructor({ padding, colorpickerWidth, colorcheckWidth, colorpicker, interactiveMode, env, brush }) {
    this.padding = padding;
    this.colorpickerWidth = colorpickerWidth;
    this.colorcheckWidth = colorcheckWidth;
    this.colorpicker = colorpicker;
    this.interactiveMode = interactiveMode;
    this.env = env;
    this.brush = brush;
  }
}
