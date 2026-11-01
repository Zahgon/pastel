// Copyright (c) David Peter and pastel contributors.
// SPDX-License-Identifier: MIT OR Apache-2.0
// JavaScript port of src/cli/commands/paint.rs from sharkdp/pastel v0.12.0.

import { Style } from '../../lib/ansi.js';
import { parseColor } from '../../lib/parser.js';
import { rustTrim } from '../../lib/rustfmt.js';
import { IoError, PastelError } from '../error.js';
import { ColorArgIterator, PrintSpectrum, STDIN } from './io.js';

/** `pastel paint`: prints text with the given foreground/background colors and font style. */
export class PaintCommand {
  /**
   * @param {import('../output.js').Output} out
   * @param {object} matches
   * @param {import('../config.js').Config} config
   */
  run(out, matches, config) {
    const fgArg = matches.getOne('color');
    let fg = null;
    if (rustTrim(fgArg) !== 'default') {
      const printSpectrum = { value: PrintSpectrum.Yes };
      fg = ColorArgIterator.fromColorArg(config, fgArg, printSpectrum);
    }

    let bg = null;
    const bgArg = matches.getOne('on');
    if (bgArg !== undefined) {
      bg = parseColor(bgArg);
      if (bg === null) {
        throw PastelError.colorParseError(bgArg);
      }
    }

    let text;
    const values = matches.getMany('text');
    if (values !== undefined) {
      text = values.join(' ');
    } else {
      try {
        text = STDIN.readToString();
      } catch (err) {
        if (err instanceof IoError) {
          throw PastelError.fromIoError(err);
        }
        throw err;
      }
    }

    const style = new Style();

    if (fg !== null) {
      style.foreground(fg);
    }

    if (bg !== null) {
      style.on(bg);
    }

    style.bold(matches.getFlag('bold'));
    style.italic(matches.getFlag('italic'));
    style.underline(matches.getFlag('underline'));

    out.handle.write(`${config.brush.paint(text, style)}${matches.getFlag('no-newline') ? '' : '\n'}`);
  }
}
