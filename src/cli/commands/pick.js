// Copyright (c) David Peter and pastel contributors.
// SPDX-License-Identifier: MIT OR Apache-2.0
// JavaScript port of src/cli/commands/pick.rs from sharkdp/pastel v0.12.0.

import { parseUsize } from '../../lib/rustfmt.js';
import { printColorspectrum, runExternalColorpicker } from '../colorpicker.js';
import { PastelError } from '../error.js';
import { ColorArgIterator, PrintSpectrum } from './io.js';

/** `pastel pick`: picks colors from the screen with an external color picker tool. */
export class PickCommand {
  /**
   * @param {import('../output.js').Output} out
   * @param {object} matches
   * @param {import('../config.js').Config} config
   */
  run(out, matches, config) {
    const countArg = matches.getOne('count');
    const count = parseUsize(countArg);
    if (count === null) {
      throw PastelError.couldNotParseNumber(countArg);
    }

    printColorspectrum(config);

    const colorStrings = [];
    for (let i = 0; i < count; i++) {
      colorStrings.push(runExternalColorpicker(config.colorpicker));
    }

    const printSpectrum = { value: PrintSpectrum.No };

    for (const colorStr of colorStrings) {
      const color = ColorArgIterator.fromColorArg(config, colorStr, printSpectrum);
      out.showColor(config, color);
    }
  }
}
