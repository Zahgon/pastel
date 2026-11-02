// Copyright (c) David Peter and pastel contributors.
// SPDX-License-Identifier: MIT OR Apache-2.0
// JavaScript port of src/parser.rs from sharkdp/pastel v0.12.0.

import { fromAnsi8bit } from './ansi.js';
import { Color } from './color.js';
import { NAMED_COLORS } from './named.js';
import { asI64, parseF64, rustTrim, utf8Len } from './rustfmt.js';

// ---------------------------------------------------------------------------
// Adapted from nom 7.1.3 (https://github.com/rust-bakery/nom). Original license:
//
// Copyright (c) 2014-2019 Geoffroy Couprie; ported in sharkdp/pastel
//
// Permission is hereby granted, free of charge, to any person obtaining
// a copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to
// permit persons to whom the Software is furnished to do so, subject to
// the following conditions:
//
// The above copyright notice and this permission notice shall be
// included in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
// EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
// NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
// LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
// OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
// WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
//
// The subset of nom 7.1.3 (complete parsers on `&str`) used by the grammar.
//
// A parser is a function `(input: string) => [rest, output]`, the equivalent of
// nom's `Ok((rest, output))`. Errors are thrown as `NomErr` values, which plays
// the role of `?` in the Rust code: `Err::Error` is recoverable (an `alt` tries
// its next branch, an `opt` yields `None`), `Err::Failure` (produced by `cut`)
// aborts every enclosing `alt`/`opt`.
// ---------------------------------------------------------------------------

/** A nom `Err::Error` (recoverable) or `Err::Failure` (unrecoverable). */
class NomErr extends Error {
  /**
   * @param {boolean} failure
   */
  constructor(failure) {
    super(failure ? 'nom Err::Failure' : 'nom Err::Error');
    this.name = 'NomErr';
    this.failure = failure;
  }
}

// Parse errors carry no information, so two shared instances are thrown (this
// also avoids capturing a stack trace for every failed alternative).
const ERROR = new NomErr(false);
const FAILURE = new NomErr(true);

/**
 * Re-throw anything that is not a recoverable nom error.
 *
 * @param {unknown} e
 */
function rethrowUnlessError(e) {
  if (e !== ERROR) {
    throw e;
  }
}

/**
 * Split `input` after its first `byteCount` UTF-8 bytes (Rust `str::split_at`, which
 * panics if that is not a character boundary; this cannot happen for the ASCII tags of
 * the grammar).
 *
 * @param {string} input
 * @param {number} byteCount
 * @returns {[string, string]} `[rest, prefix]`, like nom's `take_split`
 */
function takeSplit(input, byteCount) {
  let bytes = 0;
  let index = 0;
  while (bytes < byteCount) {
    const cp = input.codePointAt(index);
    bytes += utf8Len(String.fromCodePoint(cp));
    index += cp > 0xffff ? 2 : 1;
  }
  if (bytes !== byteCount) {
    throw new Error(`byte index ${byteCount} is not a char boundary`);
  }
  return [input.slice(index), input.slice(0, index)];
}

/**
 * Number of UTF-16 code units at the start of `input` whose characters satisfy `predicate`.
 *
 * @param {string} input
 * @param {(c: string) => boolean} predicate tested on single ASCII characters
 * @returns {number}
 */
function prefixLength(input, predicate) {
  let i = 0;
  while (i < input.length && predicate(input[i])) {
    i += 1;
  }
  return i;
}

const isSpace = (c) => c === ' ' || c === '\t';
const isAsciiAlphabetic = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
const isAsciiDigit = (c) => c >= '0' && c <= '9';
const isAsciiHexDigit = (c) => isAsciiDigit(c) || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');

/**
 * `split_at_position_complete`: the longest prefix matching `predicate` (possibly empty).
 *
 * @param {(c: string) => boolean} predicate
 */
function takeWhile0(predicate) {
  return (input) => {
    const n = prefixLength(input, predicate);
    return [input.slice(n), input.slice(0, n)];
  };
}

/**
 * `split_at_position1_complete`: like `takeWhile0`, but an empty match is an error.
 *
 * @param {(c: string) => boolean} predicate
 */
function takeWhile1(predicate) {
  return (input) => {
    const n = prefixLength(input, predicate);
    if (n === 0) {
      throw ERROR;
    }
    return [input.slice(n), input.slice(0, n)];
  };
}

/** `character::complete::space0`: zero or more spaces and tabs. */
const space0 = takeWhile0(isSpace);
/** `character::complete::space1`: one or more spaces and tabs. */
const space1 = takeWhile1(isSpace);
/** `character::complete::alpha1`: one or more ASCII letters. */
const alpha1 = takeWhile1(isAsciiAlphabetic);
/** `character::complete::digit1`: one or more ASCII digits. */
const digit1 = takeWhile1(isAsciiDigit);
/** `character::complete::hex_digit1`: one or more ASCII hexadecimal digits. */
const hexDigit1 = takeWhile1(isAsciiHexDigit);

/**
 * `character::complete::char`: matches the (ASCII) character `c`.
 *
 * @param {string} c
 */
function char(c) {
  return (input) => {
    if (input.length === 0 || input[0] !== c) {
      throw ERROR;
    }
    return [input.slice(1), c];
  };
}

/**
 * `bytes::complete::tag`: matches `t` exactly.
 *
 * @param {string} t
 */
function tag(t) {
  return (input) => {
    if (!input.startsWith(t)) {
      throw ERROR;
    }
    return [input.slice(t.length), t];
  };
}

/**
 * Rust `char::to_lowercase` for one character, as a string.
 *
 * @param {number} cp
 * @returns {string}
 */
function charToLowercase(cp) {
  return String.fromCodePoint(cp).toLowerCase();
}

/**
 * `bytes::complete::tag_no_case` on `&str`. Like nom's `Compare::compare_no_case`, this
 * compares the characters of the input and the tag pairwise after lowercasing them, and then
 * splits the input after as many BYTES as the tag has, which is not necessarily the matched
 * prefix (e.g. for the KELVIN SIGN, which lowercases to 'k' but takes three bytes).
 *
 * @param {string} t
 */
function tagNoCase(t) {
  const tagChars = Array.from(t, (c) => c.codePointAt(0));
  const tagLen = utf8Len(t);
  return (input) => {
    let i = 0;
    for (const c of input) {
      if (i === tagChars.length) {
        break;
      }
      if (charToLowercase(c.codePointAt(0)) !== charToLowercase(tagChars[i])) {
        throw ERROR;
      }
      i += 1;
    }
    if (utf8Len(input) < tagLen) {
      throw ERROR;
    }
    return takeSplit(input, tagLen);
  };
}

/**
 * `branch::alt`: the result of the first parser that does not return an `Err::Error`.
 *
 * @param {...Function} parsers
 */
function alt(...parsers) {
  return (input) => {
    for (const parser of parsers) {
      try {
        return parser(input);
      } catch (e) {
        rethrowUnlessError(e);
      }
    }
    throw ERROR;
  };
}

/**
 * `combinator::opt`: `null` (nom's `None`) if the parser returns an `Err::Error`.
 *
 * @param {Function} parser
 */
function opt(parser) {
  return (input) => {
    try {
      return parser(input);
    } catch (e) {
      rethrowUnlessError(e);
      return [input, null];
    }
  };
}

/**
 * `combinator::cond`: runs the parser only if `b` is true, else returns `null`.
 *
 * @param {boolean} b
 * @param {Function} parser
 */
function cond(b, parser) {
  return (input) => (b ? parser(input) : [input, null]);
}

/**
 * `combinator::verify`: an `Err::Error` if the output does not satisfy `predicate`.
 *
 * @param {Function} parser
 * @param {(output: any) => boolean} predicate
 */
function verify(parser, predicate) {
  return (input) => {
    const [rest, output] = parser(input);
    if (!predicate(output)) {
      throw ERROR;
    }
    return [rest, output];
  };
}

/**
 * `combinator::all_consuming`: an `Err::Error` if the parser leaves input behind.
 *
 * @param {Function} parser
 */
function allConsuming(parser) {
  return (input) => {
    const [rest, output] = parser(input);
    if (rest.length !== 0) {
      throw ERROR;
    }
    return [rest, output];
  };
}

/**
 * `combinator::cut`: turns an `Err::Error` into an `Err::Failure`.
 *
 * @param {Function} parser
 */
function cut(parser) {
  return (input) => {
    try {
      return parser(input);
    } catch (e) {
      rethrowUnlessError(e);
      throw FAILURE;
    }
  };
}

/**
 * `combinator::recognize` of a sequence (`tuple`): runs the parsers one after another and
 * returns the consumed input.
 *
 * @param {...Function} parsers
 */
function recognize(...parsers) {
  return (input) => {
    let rest = input;
    for (const parser of parsers) {
      [rest] = parser(rest);
    }
    return [rest, input.slice(0, input.length - rest.length)];
  };
}

const optSign = opt(alt(char('+'), char('-')));

/**
 * `number::complete::recognize_float`:
 * `[+-]? (digits ('.' digits?)? | '.' digits) ([eE] [+-]? cut(digits))?`
 */
const recognizeFloat = recognize(
  optSign,
  alt(recognize(digit1, opt(recognize(char('.'), opt(digit1)))), recognize(char('.'), digit1)),
  opt(recognize(alt(char('e'), char('E')), optSign, cut(digit1))),
);

/**
 * `number::complete::recognize_float_or_exceptions`: a float or one of the case-insensitive
 * words "nan", "inf" and "infinity" (tried in that order, so "infinity" only ever matches "inf").
 * A `Failure` of `recognize_float` (an exponent without digits) is passed on unchanged; the
 * errors of the `tag_no_case` branches are all plain `Err::Error`s.
 */
const recognizeFloatOrExceptions = alt(
  recognizeFloat,
  tagNoCase('nan'),
  tagNoCase('inf'),
  tagNoCase('infinity'),
);

/**
 * `number::complete::double`: the recognized text, parsed with Rust's `str::parse::<f64>`.
 *
 * @param {string} input
 * @returns {[string, number]}
 */
function double(input) {
  const [rest, s] = recognizeFloatOrExceptions(input);
  const f = parseF64(s);
  if (f === null) {
    throw ERROR;
  }
  return [rest, f];
}

// ---------------------------------------------------------------------------
// The pastel color grammar.
// ---------------------------------------------------------------------------

// Each `parse*` function below is a nom parser: `(input) => [rest, output]`.

/**
 * The value of a string of (already validated) hexadecimal digits.
 *
 * @param {string} num
 * @returns {number}
 */
function hexToU8Unsafe(num) {
  return Number.parseInt(num, 16);
}

/**
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {Color}
 */
function rgb(r, g, b) {
  return Color.fromRgb(r, g, b);
}

/**
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @param {number} a
 * @returns {Color}
 */
function rgba(r, g, b, a) {
  return Color.fromRgba(r, g, b, a);
}

/** A comma, optionally surrounded by spaces. */
function commaSeparated(input) {
  [input] = space0(input);
  [input] = char(',')(input);
  return space0(input);
}

/** A comma or at least one space between two components. */
function parseSeparator(input) {
  return alt(commaSeparated, space1)(input);
}

/** An optional `#`. */
function optHashChar(s) {
  return opt(char('#'))(s);
}

/** `<number>%`, as a fraction (`50%` is 0.5). */
function parsePercentage(input) {
  let percent;
  [input, percent] = double(input);
  [input] = char('%')(input);
  return [input, percent / 100.0];
}

/** `<number>`, `<number>°` or `<number>deg`, in degrees. */
function parseDegrees(input) {
  let d;
  [input, d] = double(input);
  [input] = alt(tag('°'), tag('deg'), tag(''))(input);
  return [input, d];
}

/** `<number>rad`, converted to degrees. */
function parseRads(input) {
  let rads;
  [input, rads] = double(input);
  [input] = tag('rad')(input);
  return [input, (rads * 180.0) / Math.PI];
}

/** `<number>grad`, converted to degrees. */
function parseGrads(input) {
  let grads;
  [input, grads] = double(input);
  [input] = tag('grad')(input);
  return [input, (grads * 360.0) / 400.0];
}

/** `<number>turn`, converted to degrees. */
function parseTurns(input) {
  let turns;
  [input, turns] = double(input);
  [input] = tag('turn')(input);
  return [input, turns * 360.0];
}

/** An angle in any of the supported units, in degrees. */
function parseAngle(input) {
  return alt(parseTurns, parseGrads, parseRads, parseDegrees)(input);
}

/** An optional alpha component (a number or a percentage after a separator), default 1. */
function parseAlpha(input) {
  let alpha;
  [input, alpha] = opt((i) => {
    [i] = parseSeparator(i);
    return alt(parsePercentage, double)(i);
  })(input);
  return [input, alpha === null ? 1.0 : alpha];
}

/** `#RGB`, `#RGBA`, `#RRGGBB` or `#RRGGBBAA`, with an optional `#`. */
function parseHex(input) {
  let hexChars;
  [input] = optHashChar(input);
  [input, hexChars] = hexDigit1(input);
  switch (hexChars.length) {
    // RRGGBB
    case 6: {
      const r = hexToU8Unsafe(hexChars.slice(0, 2));
      const g = hexToU8Unsafe(hexChars.slice(2, 4));
      const b = hexToU8Unsafe(hexChars.slice(4, 6));
      return [input, rgb(r, g, b)];
    }
    // RGB
    case 3: {
      let r = hexToU8Unsafe(hexChars.slice(0, 1));
      let g = hexToU8Unsafe(hexChars.slice(1, 2));
      let b = hexToU8Unsafe(hexChars.slice(2, 3));
      r = r * 16 + r;
      g = g * 16 + g;
      b = b * 16 + b;
      return [input, rgb(r, g, b)];
    }
    // RRGGBBAA
    case 8: {
      const r = hexToU8Unsafe(hexChars.slice(0, 2));
      const g = hexToU8Unsafe(hexChars.slice(2, 4));
      const b = hexToU8Unsafe(hexChars.slice(4, 6));
      const a = hexToU8Unsafe(hexChars.slice(6, 8)) / 255.0;
      return [input, rgba(r, g, b, a)];
    }
    // RGBA
    case 4: {
      let r = hexToU8Unsafe(hexChars.slice(0, 1));
      let g = hexToU8Unsafe(hexChars.slice(1, 2));
      let b = hexToU8Unsafe(hexChars.slice(2, 3));
      const a = hexToU8Unsafe(hexChars.slice(3, 4));
      r = r * 16 + r;
      g = g * 16 + g;
      b = b * 16 + b;
      return [input, rgba(r, g, b, (a * 16 + a) / 255.0)];
    }
    // "Expected hex string of 3 or 6 characters length"
    default:
      throw ERROR;
  }
}

/** `rgb(r, g, b[, alpha])`, `rgba(...)` or a bare `r, g, b[, alpha]`, on the 0..255 scale. */
function parseNumericRgb(input) {
  let prefixed, r, g, b, alpha;
  [input, prefixed] = opt(alt(tag('rgb('), tag('rgba(')))(input);
  const isPrefixed = prefixed !== null;
  [input] = space0(input);
  [input, r] = double(input);
  [input] = parseSeparator(input);
  [input, g] = double(input);
  [input] = parseSeparator(input);
  [input, b] = double(input);
  [input, alpha] = parseAlpha(input);
  [input] = space0(input);
  [input] = cond(isPrefixed, char(')'))(input);

  r = r / 255.0;
  g = g / 255.0;
  b = b / 255.0;
  const c = Color.fromRgbaFloat(r, g, b, alpha);

  return [input, c];
}

/** Like `parseNumericRgb`, but with percentages. */
function parsePercentageRgb(input) {
  let prefixed, r, g, b, alpha;
  [input, prefixed] = opt(alt(tag('rgb('), tag('rgba(')))(input);
  const isPrefixed = prefixed !== null;
  [input] = space0(input);
  [input, r] = parsePercentage(input);
  [input] = parseSeparator(input);
  [input, g] = parsePercentage(input);
  [input] = parseSeparator(input);
  [input, b] = parsePercentage(input);
  [input, alpha] = parseAlpha(input);
  [input] = space0(input);
  [input] = cond(isPrefixed, char(')'))(input);

  const c = Color.fromRgbaFloat(r, g, b, alpha);

  return [input, c];
}

/** `hsl(angle, s%, l%[, alpha])` / `hsla(...)`. */
function parseHsl(input) {
  let h, s, l, alpha;
  [input] = alt(tag('hsl('), tag('hsla('))(input);
  [input] = space0(input);
  [input, h] = parseAngle(input);
  [input] = parseSeparator(input);
  [input, s] = parsePercentage(input);
  [input] = parseSeparator(input);
  [input, l] = parsePercentage(input);
  [input, alpha] = parseAlpha(input);
  [input] = space0(input);
  [input] = char(')')(input);

  const c = Color.fromHsla(h, s, l, alpha);

  return [input, c];
}

/** `hsv(angle, s%, v%[, alpha])` / `hsva(...)`. */
function parseHsv(input) {
  let h, s, v, alpha;
  [input] = alt(tag('hsv('), tag('hsva('))(input);
  [input] = space0(input);
  [input, h] = parseAngle(input);
  [input] = parseSeparator(input);
  [input, s] = parsePercentage(input);
  [input] = parseSeparator(input);
  [input, v] = parsePercentage(input);
  [input, alpha] = parseAlpha(input);
  [input] = space0(input);
  [input] = char(')')(input);

  const c = Color.fromHsva(h, s, v, alpha);

  return [input, c];
}

/** `gray(value)` with a non-negative number or percentage. */
function parseGray(input) {
  let g;
  [input] = tag('gray(')(input);
  [input] = space0(input);
  [input, g] = verify(alt(parsePercentage, double), (d) => d >= 0.0)(input);
  [input] = space0(input);
  [input] = char(')')(input);

  const c = Color.fromRgbFloat(g, g, g);

  return [input, c];
}

/** `[cie]lab(l, a, b[, alpha])`, case-insensitive prefix. */
function parseLab(input) {
  let l, a, b, alpha;
  [input] = opt(tagNoCase('cie'))(input);
  [input] = tagNoCase('lab(')(input);
  [input] = space0(input);
  [input, l] = double(input);
  [input] = parseSeparator(input);
  [input, a] = double(input);
  [input] = parseSeparator(input);
  [input, b] = double(input);
  [input, alpha] = parseAlpha(input);
  [input] = space0(input);
  [input] = char(')')(input);

  const c = Color.fromLab(l, a, b, alpha);

  return [input, c];
}

/** `oklab(l, a, b[, alpha])`, case-insensitive prefix. */
function parseOklab(input) {
  let l, a, b, alpha;
  [input] = tagNoCase('oklab(')(input);
  [input] = space0(input);
  [input, l] = double(input);
  [input] = parseSeparator(input);
  [input, a] = double(input);
  [input] = parseSeparator(input);
  [input, b] = double(input);
  [input, alpha] = parseAlpha(input);
  [input] = space0(input);
  [input] = char(')')(input);

  const c = Color.fromOklab(l, a, b, alpha);

  return [input, c];
}

/** `[cie]lch(l, c, angle[, alpha])`, case-insensitive prefix. */
function parseLch(input) {
  let l, c, h, alpha;
  [input] = opt(tagNoCase('cie'))(input);
  [input] = tagNoCase('lch(')(input);
  [input] = space0(input);
  [input, l] = double(input);
  [input] = parseSeparator(input);
  [input, c] = double(input);
  [input] = parseSeparator(input);
  [input, h] = parseAngle(input);
  [input, alpha] = parseAlpha(input);
  [input] = space0(input);
  [input] = char(')')(input);

  return [input, Color.fromLch(l, c, h, alpha)];
}

/** `oklch(l, c, angle[, alpha])`, case-insensitive prefix. */
function parseOklch(input) {
  let l, c, h, alpha;
  [input] = tagNoCase('oklch(')(input);
  [input] = space0(input);
  [input, l] = double(input);
  [input] = parseSeparator(input);
  [input, c] = double(input);
  [input] = parseSeparator(input);
  [input, h] = parseAngle(input);
  [input, alpha] = parseAlpha(input);
  [input] = space0(input);
  [input] = char(')')(input);

  return [input, Color.fromOklch(l, c, h, alpha)];
}

/** `ansi_8bit(code)` with a code in 0..=255, case-insensitive prefix. */
function parseAnsi8bit(input) {
  let value;
  [input] = tagNoCase('ansi_8bit(')(input);
  [input] = space0(input);
  [input, value] = double(input);
  [input] = space0(input);
  [input] = char(')')(input);

  // `code as i64` in the original: truncating and saturating, NaN becomes 0.
  const code = asI64(value);
  if (!(code >= 0 && code <= 255)) {
    // "ANSI 8-bit code must be between 0 and 255"
    throw ERROR;
  }

  return [input, fromAnsi8bit(code)];
}

/** A CSS color name (ASCII letters, case-insensitive). */
function parseNamed(input) {
  let color;
  [input, color] = allConsuming(alpha1)(input);
  const lowercase = color.toLowerCase();
  const nc = NAMED_COLORS.find((nc) => lowercase === nc.name);

  if (nc === undefined) {
    // "Couldn't find matching named color"
    throw ERROR;
  }
  return [input, nc.color.clone()];
}

/**
 * Parse a color string in any of the supported notations (hex, `rgb(...)`, `hsl(...)`,
 * `hsv(...)`, `gray(...)`, `lab(...)`, `oklab(...)`, `lch(...)`, `oklch(...)`,
 * `ansi_8bit(...)`, plain "r, g, b" and CSS color names). Leading and trailing
 * whitespace (Rust `str::trim`) is ignored.
 *
 * @param {string} input
 * @returns {Color | null} the color, or `null` if the input is not a valid color
 */
export function parseColor(input) {
  try {
    const [, c] = alt(
      alt(
        allConsuming(parseHex),
        allConsuming(parseNumericRgb),
        allConsuming(parsePercentageRgb),
        allConsuming(parseHsl),
        allConsuming(parseHsv),
        allConsuming(parseGray),
      ),
      alt(
        allConsuming(parseLab),
        allConsuming(parseOklab),
        allConsuming(parseLch),
        allConsuming(parseOklch),
        allConsuming(parseAnsi8bit),
        allConsuming(parseNamed),
      ),
    )(rustTrim(input));
    return c;
  } catch (e) {
    if (e instanceof NomErr) {
      return null;
    }
    throw e;
  }
}
