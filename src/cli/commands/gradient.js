// Copyright (c) David Peter and pastel contributors.
// SPDX-License-Identifier: MIT OR Apache-2.0
// JavaScript port of src/cli/commands/gradient.rs from sharkdp/pastel v0.12.0.

import { ColorScale } from '../../lib/color.js';
import { Fraction } from '../../lib/helper.js';
import { parseUsize } from '../../lib/rustfmt.js';
import { getMixingFunction } from '../colorspace.js';
import { Panic, PastelError } from '../error.js';
import { ColorArgIterator, PrintSpectrum } from './io.js';

/** `pastel gradient`: interpolates between the given color stops. */
export class GradientCommand {
  /**
   * @param {import('../output.js').Output} out
   * @param {object} matches
   * @param {import('../config.js').Config} config
   */
  run(out, matches, config) {
    const countArg = matches.getOne('number');
    const count = parseUsize(countArg);
    if (count === null) {
      throw PastelError.couldNotParseNumber(countArg);
    }
    if (count < 2) {
      throw PastelError.gradientNumberMustBeLargerThanOne();
    }

    const printSpectrum = { value: PrintSpectrum.Yes };

    const mix = getMixingFunction(matches.getOne('colorspace'));

    const colorArgs = matches.getMany('color');

    const colorCount = colorArgs.length;
    if (colorCount < 2) {
      throw PastelError.gradientColorCountMustBeLargerThanOne();
    }

    const colorScale = ColorScale.empty();

    for (const [i, colorArg] of colorArgs.entries()) {
      const color = ColorArgIterator.fromColorArg(config, colorArg, printSpectrum);
      const position = Fraction.from(i / (colorCount - 1.0));

      colorScale.addStop(color, position);
    }

    for (let i = 0; i < count; i++) {
      const position = Fraction.from(i / (count - 1.0));

      const color = colorScale.sample(position, mix);
      if (color === null) {
        throw new Panic('gradient color', 'src/cli/commands/gradient.rs:50:60');
      }

      out.showColor(config, color);
    }
  }
}
