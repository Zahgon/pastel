// Copyright (c) David Peter and pastel contributors.
// SPDX-License-Identifier: MIT OR Apache-2.0
// JavaScript port of src/ansi.rs from sharkdp/pastel v0.12.0.

import { Color } from './color.js';
import { ciede2000 } from './delta_e.js';
import { asI32 } from './rustfmt.js';

/** Holds `[code, Lab]` for the ANSI codes 16..=255, computed on first use. */
const ansiLabCache = { representations: null };

/**
 * The lazily initialized `ANSI_LAB_REPRESENTATIONS` table.
 *
 * @returns {Array<[number, import('./color.js').Lab]>}
 */
function getAnsiLabRepresentations() {
  if (ansiLabCache.representations === null) {
    ansiLabCache.representations = [];
    for (let code = 16; code <= 255; code += 1) {
      ansiLabCache.representations.push([code, fromAnsi8bit(code).toLab()]);
    }
  }
  return ansiLabCache.representations;
}

/** The terminal color mode. */
export const Mode = Object.freeze({
  Ansi8Bit: 'Ansi8Bit',
  TrueColor: 'TrueColor',
});

/** An unknown color mode string; `value` holds the string. */
export class UnknownColorModeError extends Error {
  /**
   * @param {string} value
   */
  constructor(value) {
    super(`Unknown color mode '${value}'`);
    this.name = 'UnknownColorModeError';
    this.value = value;
  }
}

/**
 * Parse a color mode string (`Mode::from_mode_str`).
 *
 * @param {string} modeStr
 * @returns {string | null} a `Mode` value, or `null` for "off"
 * @throws {UnknownColorModeError} for any other string
 */
export function modeFromModeStr(modeStr) {
  switch (modeStr) {
    case '24bit':
    case 'truecolor':
      return Mode.TrueColor;
    case '8bit':
      return Mode.Ansi8Bit;
    case 'off':
      return null;
    default:
      throw new UnknownColorModeError(modeStr);
  }
}

/**
 * The channel value of a coordinate of the 6 x 6 x 6 color cube.
 *
 * @param {number} code integer in 0..6
 * @returns {number} integer in 0..=255
 */
function cubeTo8bit(code) {
  // The `assert!` of the original; `fromAnsi8bit` only passes valid coordinates.
  if (!(code < 6)) {
    throw new RangeError('assertion failed: code < 6');
  }
  return code === 0 ? 0 : 55 + 40 * code;
}

/**
 * Create a color from an 8-bit ANSI escape code.
 *
 * See: <https://en.wikipedia.org/wiki/ANSI_escape_code>
 *
 * @param {number} code integer in 0..=255
 * @returns {Color}
 */
export function fromAnsi8bit(code) {
  switch (code) {
    case 0:
      return Color.black();
    case 1:
      return Color.maroon();
    case 2:
      return Color.green();
    case 3:
      return Color.olive();
    case 4:
      return Color.navy();
    case 5:
      return Color.purple();
    case 6:
      return Color.teal();
    case 7:
      return Color.silver();
    case 8:
      return Color.gray();
    case 9:
      return Color.red();
    case 10:
      return Color.lime();
    case 11:
      return Color.yellow();
    case 12:
      return Color.blue();
    case 13:
      return Color.fuchsia();
    case 14:
      return Color.aqua();
    case 15:
      return Color.white();
    default:
      break;
  }

  if (code <= 231) {
    // 6 x 6 x 6 cube of 216 colors. We need to decode from
    //
    //    code = 16 + 36 × r + 6 × g + b

    const codeRgb = code - 16;
    const blue = codeRgb % 6;

    const codeRg = (codeRgb - blue) / 6;
    const green = codeRg % 6;

    const red = (codeRg - green) / 6;

    return Color.fromRgb(cubeTo8bit(red), cubeTo8bit(green), cubeTo8bit(blue));
  }

  // grayscale from (almost) black to (almost) white in 24 steps

  const grayValue = 10 * (code - 232) + 8;
  return Color.fromRgb(grayValue, grayValue, grayValue);
}

/**
 * Approximate a color by its closest 8-bit ANSI color (as measured by the perceived
 * color distance). Only the codes 16..=255 are considered; on ties the lowest code wins.
 *
 * See: <https://en.wikipedia.org/wiki/ANSI_escape_code>
 *
 * @param {Color} color
 * @returns {number} the ANSI code
 */
export function toAnsi8bit(color) {
  const selfLab = color.toLab();
  let best = null;
  let bestKey = 0;
  for (const [code, lab] of getAnsiLabRepresentations()) {
    const key = asI32(ciede2000(selfLab, lab));
    if (best === null || key < bestKey) {
      best = code;
      bestKey = key;
    }
  }
  return best;
}

/**
 * The SGR parameters that select `color` as foreground (`base` 38) or background
 * (`base` 48) color: `base;5;CODE` in 8-bit mode, `base;2;R;G;B` in 24-bit mode.
 *
 * @param {number} base
 * @param {Color} color
 * @param {string} mode a `Mode` value
 * @returns {number[]}
 */
function colorCodes(base, color, mode) {
  switch (mode) {
    case Mode.Ansi8Bit:
      return [base, 5, toAnsi8bit(color)];
    case Mode.TrueColor: {
      const rgb = color.toRgba();
      return [base, 2, rgb.r, rgb.g, rgb.b];
    }
    default:
      throw new TypeError(`invalid mode: ${mode}`);
  }
}

/**
 * Return an ANSI escape sequence in 8-bit or 24-bit representation:
 * * 8-bit: `ESC[38;5;CODEm`, where CODE represents the color.
 * * 24-bit: `ESC[38;2;R;G;Bm`, where R, G, B represent 8-bit RGB values
 *
 * @param {Color} color
 * @param {string} mode a `Mode` value
 * @returns {string}
 */
export function toAnsiSequence(color, mode) {
  return `\x1b[${colorCodes(38, color, mode).join(';')}m`;
}

/** A terminal text style: foreground and background colors, bold, italic, underline. */
export class Style {
  #foreground = null;
  #background = null;
  #bold = false;
  #italic = false;
  #underline = false;

  /**
   * A style with the given foreground color (`From<Color> for Style`).
   *
   * @param {Color} color
   * @returns {Style}
   */
  static fromColor(color) {
    return new Style().foreground(color);
  }

  /**
   * Convert a `Style` (copied) or a `Color` (used as foreground) into a style
   * (`impl Into<Style>`).
   *
   * @param {Style | Color} styleOrColor
   * @returns {Style}
   */
  static from(styleOrColor) {
    return styleOrColor instanceof Style ? styleOrColor.clone() : Style.fromColor(styleOrColor);
  }

  /**
   * Set the foreground color.
   *
   * @param {Color} color
   * @returns {this}
   */
  foreground(color) {
    this.#foreground = color.clone();
    return this;
  }

  /**
   * Set the background color.
   *
   * @param {Color} color
   * @returns {this}
   */
  on(color) {
    this.#background = color.clone();
    return this;
  }

  /**
   * Enable or disable bold text.
   *
   * @param {boolean} on
   * @returns {this}
   */
  bold(on) {
    this.#bold = on;
    return this;
  }

  /**
   * Enable or disable italic text.
   *
   * @param {boolean} on
   * @returns {this}
   */
  italic(on) {
    this.#italic = on;
    return this;
  }

  /**
   * Enable or disable underlined text.
   *
   * @param {boolean} on
   * @returns {this}
   */
  underline(on) {
    this.#underline = on;
    return this;
  }

  /**
   * @returns {Style} an independent copy of this style
   */
  clone() {
    const style = new Style();
    style.#foreground = this.#foreground;
    style.#background = this.#background;
    style.#bold = this.#bold;
    style.#italic = this.#italic;
    style.#underline = this.#underline;
    return style;
  }

  /**
   * The SGR escape sequence (`ESC[...m`) that switches to this style.
   *
   * @param {string} mode a `Mode` value
   * @returns {string}
   */
  escapeSequence(mode) {
    const codes = [];

    if (this.#foreground !== null) {
      codes.push(...colorCodes(38, this.#foreground, mode));
    }
    if (this.#background !== null) {
      codes.push(...colorCodes(48, this.#background, mode));
    }

    if (this.#bold) {
      codes.push(1);
    }

    if (this.#italic) {
      codes.push(3);
    }

    if (this.#underline) {
      codes.push(4);
    }

    if (codes.length === 0) {
      codes.push(0);
    }

    return `\x1b[${codes.join(';')}m`;
  }
}

/**
 * The style with `color` as foreground (`ToAnsiStyle::ansi_style`).
 *
 * @param {Color} color
 * @returns {Style}
 */
export function ansiStyle(color) {
  return Style.fromColor(color);
}

/**
 * The color mode supported by the terminal according to the environment: `null` if
 * `NO_COLOR` is set, else 24-bit if `COLORTERM` is "truecolor" or "24bit" (always on
 * Windows), else 8-bit.
 *
 * @param {Record<string, string | undefined>} [env]
 * @returns {string | null} a `Mode` value or `null`
 */
export function getColormode(env = process.env) {
  if (env.NO_COLOR !== undefined) {
    return null;
  }

  if (process.platform === 'win32') {
    // Assume 24bit support on Windows
    return Mode.TrueColor;
  }

  const envColorterm = env.COLORTERM;
  if (envColorterm === 'truecolor' || envColorterm === '24bit') {
    return Mode.TrueColor;
  }
  return Mode.Ansi8Bit;
}

/** Paints text with ANSI styles, or leaves it alone if no color mode is set. */
export class Brush {
  #mode;

  /**
   * @param {string | null} [mode] a `Mode` value, or `null` for no colors
   */
  constructor(mode = null) {
    this.#mode = mode;
  }

  /**
   * A brush for the given color mode.
   *
   * @param {string | null} mode a `Mode` value, or `null` for no colors
   * @returns {Brush}
   */
  static fromMode(mode) {
    return new Brush(mode);
  }

  /**
   * A brush for a stream: no colors unless the stream is a terminal, in which case the mode
   * comes from `PASTEL_COLOR_MODE` if set, else from `getColormode`.
   *
   * @param {boolean} isTerminal whether the stream is a terminal
   * @param {Record<string, string | undefined>} [env]
   * @returns {Brush}
   * @throws {UnknownColorModeError} if `PASTEL_COLOR_MODE` is invalid
   */
  static fromEnvironment(isTerminal, env = process.env) {
    let mode = null;
    if (isTerminal) {
      const envColorMode = env.PASTEL_COLOR_MODE;
      mode = envColorMode !== undefined ? modeFromModeStr(envColorMode) : getColormode(env);
    }
    return new Brush(mode);
  }

  /**
   * Paint text with a style (or a foreground color).
   *
   * @param {string} text
   * @param {Style | Color} style
   * @returns {string} the text wrapped in escape sequences, or the plain text without a mode
   */
  paint(text, style) {
    if (this.#mode !== null) {
      return `${Style.from(style).escapeSequence(this.#mode)}${text}\x1b[0m`;
    }
    return String(text);
  }
}
