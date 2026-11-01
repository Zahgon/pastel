// Copyright (c) David Peter and pastel contributors.
// SPDX-License-Identifier: MIT OR Apache-2.0
// JavaScript port of src/cli/commands/random.rs from sharkdp/pastel v0.12.0.

import { strategies } from '../../lib/random.js';
import { parseUsize } from '../../lib/rustfmt.js';
import { Panic, PastelError } from '../error.js';

/** `pastel random`: generates random colors with the given strategy. */
export class RandomCommand {
  /**
   * @param {import('../output.js').Output} out
   * @param {object} matches
   * @param {import('../config.js').Config} config
   */
  run(out, matches, config) {
    const strategyArg = matches.getOne('strategy');

    const countArg = matches.getOne('number');
    const count = parseUsize(countArg);
    if (count === null) {
      throw PastelError.couldNotParseNumber(countArg);
    }

    let strategy;
    switch (strategyArg) {
      case 'vivid':
        strategy = new strategies.Vivid();
        break;
      case 'rgb':
        strategy = new strategies.UniformRGB();
        break;
      case 'gray':
        strategy = new strategies.UniformGray();
        break;
      case 'lch_hue':
        strategy = new strategies.UniformHueLCh();
        break;
      default:
        throw new Panic(
          'internal error: entered unreachable code: Unknown randomization strategy',
          'src/cli/commands/random.rs:26:18',
        );
    }

    for (let i = 0; i < count; i++) {
      out.showColor(config, strategy.generate());
    }
  }
}
