// Copyright (c) David Peter and pastel contributors.
// SPDX-License-Identifier: MIT OR Apache-2.0
// JavaScript port of src/cli/commands/format.rs from sharkdp/pastel v0.12.0.

import { ansiStyle, Mode, toAnsi8bit, toAnsiSequence } from '../../lib/ansi.js';
import { Format } from '../../lib/color.js';
import { formatFixed } from '../../lib/rustfmt.js';
import { Panic } from '../error.js';
import { similarColors } from '../utility.js';

/**
 * Makes an escape sequence printable.
 * @param {string} code
 * @returns {string}
 */
function replaceEscape(code) {
  return code.replaceAll('\x1b', '\\x1b');
}

/**
 * The textual representation of a color in the given (lower-case) format.
 * @param {string} formatType
 * @param {import('../../lib/color.js').Color} color
 * @returns {string}
 */
function formatColor(formatType, color) {
  switch (formatType) {
    case 'rgb':
      return color.toRgbString(Format.Spaces);
    case 'rgb-float':
      return color.toRgbFloatString(Format.Spaces);
    case 'rgb-r':
      return String(color.toRgba().r);
    case 'rgb-g':
      return String(color.toRgba().g);
    case 'rgb-b':
      return String(color.toRgba().b);
    case 'hex':
      return color.toRgbHexString(true);
    case 'hsl':
      return color.toHslString(Format.Spaces);
    case 'hsl-hue':
      return formatFixed(color.toHsla().h, 0);
    case 'hsl-saturation':
      return formatFixed(color.toHsla().s, 4);
    case 'hsl-lightness':
      return formatFixed(color.toHsla().l, 4);
    case 'hsv':
      return color.toHsvString(Format.Spaces);
    case 'hsv-hue':
      return formatFixed(color.toHsva().h, 0);
    case 'hsv-saturation':
      return formatFixed(color.toHsva().s, 4);
    case 'hsv-value':
      return formatFixed(color.toHsva().v, 4);
    case 'lch':
      return color.toLchString(Format.Spaces);
    case 'lch-lightness':
      return formatFixed(color.toLch().l, 2);
    case 'lch-chroma':
      return formatFixed(color.toLch().c, 2);
    case 'lch-hue':
      return formatFixed(color.toLch().h, 2);
    case 'lab':
      return color.toLabString(Format.Spaces);
    case 'lab-a':
      return formatFixed(color.toLab().a, 2);
    case 'lab-b':
      return formatFixed(color.toLab().b, 2);
    case 'oklch':
      return color.toOklchString(Format.Spaces);
    case 'oklch-lightness':
      return formatFixed(color.toOklch().l, 4);
    case 'oklch-chroma':
      return formatFixed(color.toOklch().c, 4);
    case 'oklch-hue':
      return formatFixed(color.toOklch().h, 4);
    case 'oklab':
      return color.toOklabString(Format.Spaces);
    case 'oklab-l':
      return formatFixed(color.toOklab().l, 4);
    case 'oklab-a':
      return formatFixed(color.toOklab().a, 4);
    case 'oklab-b':
      return formatFixed(color.toOklab().b, 4);
    case 'luminance':
      return formatFixed(color.luminance(), 3);
    case 'brightness':
      return formatFixed(color.brightness(), 3);
    case 'ansi-8bit':
      return replaceEscape(toAnsiSequence(color, Mode.Ansi8Bit));
    case 'ansi-24bit':
      return replaceEscape(toAnsiSequence(color, Mode.TrueColor));
    case 'ansi-8bit-value':
      return `${toAnsi8bit(color)}\n`;
    case 'ansi-8bit-escapecode':
      return toAnsiSequence(color, Mode.Ansi8Bit);
    case 'ansi-24bit-escapecode':
      return toAnsiSequence(color, Mode.TrueColor);
    case 'cmyk':
      return color.toCmykString(Format.Spaces);
    case 'name':
      return similarColors(color)[0].name;
    default:
      throw new Panic(
        'internal error: entered unreachable code: Unknown format type',
        'src/cli/commands/format.rs:64:17',
      );
  }
}

/** `pastel format`: converts colors to the given format. */
export class FormatCommand {
  /**
   * @param {import('../output.js').Output} out
   * @param {object} matches
   * @param {import('../config.js').Config} config
   * @param {import('../../lib/color.js').Color} color
   */
  run(out, matches, config, color) {
    const formatType = matches.getOne('type').toLowerCase();

    const output = formatColor(formatType, color);

    const writeColoredLine = !['ansi-8bit-escapecode', 'ansi-24bit-escapecode', 'ansi-8bit-value'].includes(
      formatType,
    );

    if (writeColoredLine) {
      out.handle.write(`${config.brush.paint(output, ansiStyle(color.textColor()).on(color))}\n`);
    } else {
      out.handle.write(output);
    }
  }
}
