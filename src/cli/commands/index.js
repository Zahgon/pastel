// Copyright (c) David Peter and pastel contributors.
// SPDX-License-Identifier: MIT OR Apache-2.0
// JavaScript port of src/cli/commands/mod.rs from sharkdp/pastel v0.12.0.

import { Panic } from '../error.js';
import { Output, STDOUT } from '../output.js';
import {
  ColorblindCommand,
  ComplementCommand,
  DarkenCommand,
  DesaturateCommand,
  LightenCommand,
  MixCommand,
  RotateCommand,
  SaturateCommand,
  SetCommand,
  TextColorCommand,
  ToGrayCommand,
} from './color_commands.js';
import { ColorCheckCommand } from './colorcheck.js';
import { DistinctCommand } from './distinct.js';
import { FormatCommand } from './format.js';
import { GradientCommand } from './gradient.js';
import { GrayCommand } from './gray.js';
import { ColorArgIterator } from './io.js';
import { ListCommand } from './list.js';
import { PaintCommand } from './paint.js';
import { PickCommand } from './pick.js';
import { RandomCommand } from './random.js';
import { ShowCommand } from './show.js';
import { SortCommand } from './sort.js';

/**
 * A subcommand: either one that runs once per input color (`WithColor`) or one that handles its
 * arguments itself (`Generic`).
 */
export class Command {
  /**
   * @param {'WithColor'|'Generic'} variant
   * @param {{run: Function}} command
   */
  constructor(variant, command) {
    this.variant = variant;
    this.command = command;
  }

  /**
   * The command for a subcommand name as returned by the argument parser.
   * @param {string} command
   * @returns {Command}
   */
  static fromString(command) {
    switch (command) {
      case 'color':
        return new Command('WithColor', new ShowCommand());
      case 'saturate':
        return new Command('WithColor', new SaturateCommand());
      case 'desaturate':
        return new Command('WithColor', new DesaturateCommand());
      case 'lighten':
        return new Command('WithColor', new LightenCommand());
      case 'darken':
        return new Command('WithColor', new DarkenCommand());
      case 'rotate':
        return new Command('WithColor', new RotateCommand());
      case 'colorblind':
        return new Command('WithColor', new ColorblindCommand());
      case 'set':
        return new Command('WithColor', new SetCommand());
      case 'complement':
        return new Command('WithColor', new ComplementCommand());
      case 'mix':
        return new Command('WithColor', new MixCommand());
      case 'to-gray':
        return new Command('WithColor', new ToGrayCommand());
      case 'textcolor':
        return new Command('WithColor', new TextColorCommand());
      case 'pick':
        return new Command('Generic', new PickCommand());
      case 'gray':
        return new Command('Generic', new GrayCommand());
      case 'list':
        return new Command('Generic', new ListCommand());
      case 'sort-by':
        return new Command('Generic', new SortCommand());
      case 'random':
        return new Command('Generic', new RandomCommand());
      case 'distinct':
        return new Command('Generic', new DistinctCommand());
      case 'gradient':
        return new Command('Generic', new GradientCommand());
      case 'paint':
        return new Command('Generic', new PaintCommand());
      case 'format':
        return new Command('WithColor', new FormatCommand());
      case 'colorcheck':
        return new Command('Generic', new ColorCheckCommand());
      default:
        throw new Panic(
          'internal error: entered unreachable code: Unknown subcommand',
          'src/cli/commands/mod.rs:67:18',
        );
    }
  }

  /**
   * Runs the command, writing to standard output. Errors are thrown as `PastelError`.
   * @param {object} matches The `ArgMatches` of the subcommand.
   * @param {import('../config.js').Config} config
   */
  execute(matches, config) {
    const out = new Output(STDOUT);

    if (this.variant === 'Generic') {
      this.command.run(out, matches, config);
      return;
    }

    for (const color of ColorArgIterator.fromArgs(config, matches.getMany('color'))) {
      this.command.run(out, matches, config, color);
    }
  }
}
