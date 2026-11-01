// Copyright (c) David Peter and pastel contributors.
// SPDX-License-Identifier: MIT OR Apache-2.0
// JavaScript port of src/cli/colorspace.rs from sharkdp/pastel v0.12.0.

import { HSLA, LCh, Lab, OkLCh, OkLab, RGBA } from '../lib/color.js';
import { Panic } from './error.js';

/**
 * Returns the function that mixes two colors in the color space with the given (case-insensitive)
 * name.
 * @param {string} colorspaceName
 * @returns {(c1: import('../lib/color.js').Color, c2: import('../lib/color.js').Color,
 *   f: import('../lib/helper.js').Fraction) => import('../lib/color.js').Color}
 */
export function getMixingFunction(colorspaceName) {
  switch (colorspaceName.toLowerCase()) {
    case 'rgb':
      return (c1, c2, f) => c1.mix(RGBA, c2, f);
    case 'hsl':
      return (c1, c2, f) => c1.mix(HSLA, c2, f);
    case 'lab':
      return (c1, c2, f) => c1.mix(Lab, c2, f);
    case 'lch':
      return (c1, c2, f) => c1.mix(LCh, c2, f);
    case 'oklab':
      return (c1, c2, f) => c1.mix(OkLab, c2, f);
    case 'oklch':
      return (c1, c2, f) => c1.mix(OkLCh, c2, f);
    default:
      throw new Panic(
        'internal error: entered unreachable code: Unknown color space',
        'src/cli/colorspace.rs:15:14',
      );
  }
}
