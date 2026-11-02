// Copyright (c) David Peter and pastel contributors.
// SPDX-License-Identifier: MIT OR Apache-2.0
// JavaScript port of src/cli/commands/gray.rs from sharkdp/pastel v0.12.0.

import { Color } from '../../lib/color.js';
import { numberArg } from './io.js';

/** `pastel gray`: creates a gray tone from a lightness value. */
export class GrayCommand {
  /**
   * @param {import('../output.js').Output} out
   * @param {object} matches
   * @param {import('../config.js').Config} config
   */
  run(out, matches, config) {
    const lightness = numberArg(matches, 'lightness');
    const gray = Color.graytone(lightness);
    out.showColor(config, gray);
  }
}
