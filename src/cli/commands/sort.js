// Copyright (c) David Peter and pastel contributors.
// SPDX-License-Identifier: MIT OR Apache-2.0
// JavaScript port of src/cli/commands/sort.rs from sharkdp/pastel v0.12.0.

import { randomBytes } from 'node:crypto';

import { asI32 } from '../../lib/rustfmt.js';
import { Panic } from '../error.js';
import { dedupBy, sortByKey } from '../utility.js';
import { ColorArgIterator } from './io.js';

/**
 * The integer sort key of a color for the given sort order (`as i32` truncation of the scaled
 * property; a random `i32` for "random").
 * @param {string} sortOrder
 * @param {import('../../lib/color.js').Color} color
 * @returns {number}
 */
export function keyFunction(sortOrder, color) {
  switch (sortOrder) {
    case 'brightness':
      return asI32(color.brightness() * 1000.0);
    case 'luminance':
      return asI32(color.luminance() * 1000.0);
    case 'hue':
      return asI32(color.toLch().h * 1000.0);
    case 'chroma':
      return asI32(color.toLch().c * 1000.0);
    case 'random':
      return randomBytes(4).readInt32LE(0);
    default:
      throw new Panic(
        'internal error: entered unreachable code: Unknown sort order',
        'src/cli/commands/sort.rs:12:14',
      );
  }
}

/** `pastel sort-by`: sorts colors by the given property. */
export class SortCommand {
  /**
   * @param {import('../output.js').Output} out
   * @param {object} matches
   * @param {import('../config.js').Config} config
   */
  run(out, matches, config) {
    const sortOrder = matches.getOne('sort-order');

    let colors = [];
    for (const color of ColorArgIterator.fromArgs(config, matches.getMany('color'))) {
      colors.push(color);
    }

    if (matches.getFlag('unique')) {
      colors = sortByKey(colors, (c) => c.toU32());
      colors = dedupBy(colors, (a, b) => a.toU32() === b.toU32());
    }

    colors = sortByKey(colors, (c) => keyFunction(sortOrder, c));

    if (matches.getFlag('reverse')) {
      colors.reverse();
    }

    for (const color of colors) {
      out.showColor(config, color);
    }
  }
}
