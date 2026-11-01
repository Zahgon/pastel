// Copyright (c) David Peter and pastel contributors.
// SPDX-License-Identifier: MIT OR Apache-2.0
// JavaScript port of src/cli/commands/list.rs from sharkdp/pastel v0.12.0.

import { ansiStyle } from '../../lib/ansi.js';
import { NAMED_COLORS } from '../../lib/named.js';
import { PastelError } from '../error.js';
import { dedupBy, sortByKey } from '../utility.js';
import { keyFunction } from './sort.js';

/** `pastel list`: shows the named colors. */
export class ListCommand {
  /**
   * @param {import('../output.js').Output} out
   * @param {object} matches
   * @param {import('../config.js').Config} config
   */
  run(out, matches, config) {
    const sortOrder = matches.getOne('sort-order');

    let colors = sortByKey([...NAMED_COLORS], (nc) => keyFunction(sortOrder, nc.color));
    colors = dedupBy(colors, (n1, n2) => n1.color.equals(n2.color));

    if (config.interactiveMode) {
      for (const nc of colors) {
        const bg = nc.color;
        const fg = bg.textColor();
        out.handle.write(`${config.brush.paint(` ${nc.name.padEnd(24)}`, ansiStyle(fg).on(bg))}\n`);
      }
    } else {
      for (const nc of colors) {
        try {
          out.handle.write(`${nc.name}\n`);
        } catch (err) {
          if (err instanceof PastelError) {
            break;
          }
          throw err;
        }
      }
    }
  }
}
