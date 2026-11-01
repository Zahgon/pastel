// Copyright (c) David Peter and pastel contributors.
// SPDX-License-Identifier: MIT OR Apache-2.0
// JavaScript port of src/cli/commands/colorcheck.rs from sharkdp/pastel v0.12.0.

import { Brush, Mode } from '../../lib/ansi.js';
import { Color } from '../../lib/color.js';
import { Canvas } from '../hdcanvas.js';

/**
 * Prints three color panels in the given color mode.
 * @param {import('../output.js').Output} out
 * @param {import('../config.js').Config} config
 * @param {string} mode
 */
function printBoard(out, config, mode) {
  // These colors have been chosen/computed such that the perceived color difference (CIE delta-E
  // 2000) to the closest ANSI 8-bit color is maximal.
  const c1 = Color.fromRgb(73, 39, 50);
  const c2 = Color.fromRgb(16, 51, 30);
  const c3 = Color.fromRgb(29, 54, 90);

  const width = config.colorcheckWidth;

  const canvas = new Canvas(width + 2 * config.padding, 3 * width + 3 * config.padding, Brush.fromMode(mode));

  canvas.drawRect(config.padding, config.padding, width, width, c1);

  canvas.drawRect(config.padding, 2 * config.padding + width, width, width, c2);

  canvas.drawRect(config.padding, 3 * config.padding + 2 * width, width, width, c3);

  canvas.print(out.handle);
}

/** `pastel colorcheck`: checks whether the terminal supports 24-bit colors. */
export class ColorCheckCommand {
  /**
   * @param {import('../output.js').Output} out
   * @param {object} _matches
   * @param {import('../config.js').Config} config
   */
  run(out, _matches, config) {
    out.handle.write('\n8-bit mode:\n');
    printBoard(out, config, Mode.Ansi8Bit);

    out.handle.write('24-bit mode:\n');
    printBoard(out, config, Mode.TrueColor);

    out.handle.write(
      'If your terminal emulator supports 24-bit colors, you should see three square color ' +
        'panels in the lower row and the colors should look similar (but slightly different ' +
        'from) the colors in the top row panels.\nThe panels in the lower row should look ' +
        'like squares that are filled with a uniform color (no stripes or other artifacts).\n' +
        '\n' +
        'You can also open https://github.com/sharkdp/pastel/blob/master/doc/colorcheck.md in ' +
        'a browser to compare how the output should look like.\n',
    );
  }
}
