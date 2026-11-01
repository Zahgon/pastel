// Copyright (c) David Peter and pastel contributors.
// SPDX-License-Identifier: MIT OR Apache-2.0
// Part of the JavaScript port of sharkdp/pastel v0.12.0.

/**
 * Rust standard-library number semantics that the original program gets implicitly from the
 * language: float formatting (`{}` and `{:.N}`), `f64::round`, saturating `as` casts,
 * `f64::max`/`f64::min`, `f64::powi`, `str::parse::<f64>()` / `str::parse::<usize>()` and
 * `char::is_whitespace` based trimming.
 *
 * @module rustfmt
 */

const F64_VIEW = new DataView(new ArrayBuffer(8));

/**
 * Split a finite, non-zero double into an integer mantissa and a binary exponent such that
 * `|x| = mantissa * 2^exponent` exactly.
 *
 * @param {number} x
 * @returns {{ mantissa: bigint, exponent: number }}
 */
function decompose(x) {
  F64_VIEW.setFloat64(0, x);
  const hi = F64_VIEW.getUint32(0);
  const lo = F64_VIEW.getUint32(4);
  const biasedExponent = (hi >>> 20) & 0x7ff;
  let mantissa = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  let exponent;
  if (biasedExponent === 0) {
    exponent = -1074;
  } else {
    mantissa |= 1n << 52n;
    exponent = biasedExponent - 1075;
  }
  return { mantissa, exponent };
}

/**
 * Format a float like Rust's `format!("{:.prec$}", x)`: the exact binary value is rounded to
 * `prec` fractional digits, ties to even, and the sign of negative values (including `-0.0`
 * and values that round to zero) is kept.
 *
 * @param {number} x
 * @param {number} prec number of digits after the decimal point
 * @returns {string}
 */
export function formatFixed(x, prec) {
  if (Number.isNaN(x)) {
    return 'NaN';
  }
  const negative = x < 0 || Object.is(x, -0);
  const sign = negative ? '-' : '';
  if (!Number.isFinite(x)) {
    return `${sign}inf`;
  }

  let scaled = 0n;
  if (x !== 0) {
    const { mantissa, exponent } = decompose(x);
    const pow10 = 10n ** BigInt(prec);
    if (exponent >= 0) {
      scaled = (mantissa << BigInt(exponent)) * pow10;
    } else {
      const numerator = mantissa * pow10;
      const denominator = 1n << BigInt(-exponent);
      scaled = numerator / denominator;
      const twiceRemainder = (numerator % denominator) * 2n;
      if (twiceRemainder > denominator || (twiceRemainder === denominator && (scaled & 1n) === 1n)) {
        scaled += 1n;
      }
    }
  }

  const digits = scaled.toString().padStart(prec + 1, '0');
  if (prec === 0) {
    return sign + digits;
  }
  const point = digits.length - prec;
  return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
}

/**
 * Format a float like Rust's `format!("{}", x)` (`Display` for `f64`): the shortest digits that
 * round-trip, written without exponent notation and without a trailing `.0`.
 *
 * @param {number} x
 * @returns {string}
 */
export function formatDisplay(x) {
  if (Number.isNaN(x)) {
    return 'NaN';
  }
  const negative = x < 0 || Object.is(x, -0);
  const sign = negative ? '-' : '';
  if (!Number.isFinite(x)) {
    return `${sign}inf`;
  }
  if (x === 0) {
    return `${sign}0`;
  }

  const [mantissa, exponentText] = Math.abs(x).toExponential().split('e');
  let digits = mantissa.replace('.', '');
  let point = Number(exponentText) + 1;
  // JavaScript picks the even candidate when two shortest digit strings are equally close to the
  // value; Rust rounds such a tie up. Switch to the upper neighbour when the value is exactly the
  // midpoint between the JavaScript digits and the next digit string of the same length.
  if (isMidpointAbove(Math.abs(x), BigInt(digits), point - digits.length)) {
    const bumped = (BigInt(digits) + 1n).toString();
    if (bumped.length > digits.length) {
      point += 1;
    }
    digits = bumped.slice(0, digits.length).replace(/0+$/, '') || '0';
  }
  let body;
  if (point <= 0) {
    body = `0.${'0'.repeat(-point)}${digits}`;
  } else if (point >= digits.length) {
    body = digits + '0'.repeat(point - digits.length);
  } else {
    body = `${digits.slice(0, point)}.${digits.slice(point)}`;
  }
  return sign + body;
}

/**
 * Whether the positive double `x` is exactly `(digits + 1/2) * 10^power`.
 *
 * @param {number} x
 * @param {bigint} digits
 * @param {number} power
 * @returns {boolean}
 */
function isMidpointAbove(x, digits, power) {
  const { mantissa, exponent } = decompose(x);
  // Compare 2 * mantissa * 2^exponent with (2 * digits + 1) * 10^power using integers only.
  let left = 2n * mantissa;
  let right = 2n * digits + 1n;
  if (exponent >= 0) {
    left <<= BigInt(exponent);
  } else {
    right <<= BigInt(-exponent);
  }
  if (power >= 0) {
    right *= 10n ** BigInt(power);
  } else {
    left *= 10n ** BigInt(-power);
  }
  return left === right;
}

/**
 * Rust's `f64::round`: round half away from zero.
 *
 * @param {number} x
 * @returns {number}
 */
export function round(x) {
  return x < 0 ? -Math.round(-x) : Math.round(x);
}

/**
 * Rust's `x as u8` for an `f64`: truncate toward zero, saturate at 0 and 255, NaN becomes 0.
 *
 * @param {number} x
 * @returns {number}
 */
export function asU8(x) {
  if (!(x > 0)) {
    return 0;
  }
  if (x >= 255) {
    return 255;
  }
  return Math.trunc(x);
}

/**
 * Rust's `x as i32` for an `f64`: truncate toward zero, saturate, NaN becomes 0.
 *
 * @param {number} x
 * @returns {number}
 */
export function asI32(x) {
  if (Number.isNaN(x)) {
    return 0;
  }
  if (x >= 2147483647) {
    return 2147483647;
  }
  if (x <= -2147483648) {
    return -2147483648;
  }
  return Math.trunc(x) || 0;
}

/**
 * Rust's `x as i64` for an `f64`: truncate toward zero, saturate, NaN becomes 0. The result is a
 * `number`, so values beyond 2^53 are approximate (only used for range checks).
 *
 * @param {number} x
 * @returns {number}
 */
export function asI64(x) {
  if (Number.isNaN(x)) {
    return 0;
  }
  const limit = 9223372036854775807;
  if (x >= limit) {
    return limit;
  }
  if (x <= -limit) {
    return -limit;
  }
  return Math.trunc(x) || 0;
}

/**
 * Rust's `f64::max`: if one argument is NaN the other one is returned.
 *
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
export function fmax(a, b) {
  if (Number.isNaN(a)) {
    return b;
  }
  if (Number.isNaN(b)) {
    return a;
  }
  if (a === 0 && b === 0) {
    return Object.is(a, -0) && Object.is(b, -0) ? -0 : 0;
  }
  return a > b ? a : b;
}

/**
 * Rust's `f64::min`: if one argument is NaN the other one is returned.
 *
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
export function fmin(a, b) {
  if (Number.isNaN(a)) {
    return b;
  }
  if (Number.isNaN(b)) {
    return a;
  }
  if (a === 0 && b === 0) {
    return Object.is(a, 0) && Object.is(b, 0) ? 0 : -0;
  }
  return a < b ? a : b;
}

/**
 * `f64::max(f64::min(upper, x), lower)`, the clamp used throughout pastel. A NaN input yields
 * `upper`.
 *
 * @param {number} lower
 * @param {number} upper
 * @param {number} x
 * @returns {number}
 */
export function clampF64(lower, upper, x) {
  return fmax(fmin(upper, x), lower);
}

/**
 * Rust's `f64::powi` with a constant exponent, as LLVM expands it: binary powering with one
 * rounding per multiplication (`powi(x, 3) = x * (x * x)`).
 *
 * @param {number} x
 * @param {number} n non-negative integer exponent
 * @returns {number}
 */
export function powi(x, n) {
  let result = null;
  let square = x;
  let remaining = n;
  while (remaining > 0) {
    if (remaining & 1) {
      result = result === null ? square : result * square;
    }
    square *= square;
    remaining >>>= 1;
  }
  return result === null ? 1 : result;
}

const DECIMAL_FLOAT = /^([0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE]([+-]?)([0-9]+))?$/;
const SPECIAL_FLOAT = /^(?:inf|infinity|nan)$/i;

/**
 * The value of the digits of an explicit exponent as Rust's `dec2flt` reads them: digits stop
 * being accumulated once the value has reached 0x10000 and the remaining ones are skipped, so
 * `e655360` means `e65536` and `e1000000` means `e100000`. This is visible when a mantissa with
 * that many digits brings the number back into the range of a double.
 *
 * @param {string} digits
 * @returns {number}
 */
function dec2fltExponent(digits) {
  let exponent = 0;
  for (let i = 0; i < digits.length && exponent < 0x10000; i += 1) {
    exponent = exponent * 10 + (digits.charCodeAt(i) - 48);
  }
  return exponent;
}

/**
 * Rust's `str::parse::<f64>()`: an optional sign followed by a decimal number with optional
 * fraction and exponent, or `inf`, `infinity` or `nan` in any case. No surrounding whitespace.
 *
 * @param {string} s
 * @returns {number | null} the parsed value, or `null` when Rust would return an error
 */
export function parseF64(s) {
  let body = s;
  let negative = false;
  if (body.startsWith('+') || body.startsWith('-')) {
    negative = body.startsWith('-');
    body = body.slice(1);
  }
  const decimal = DECIMAL_FLOAT.exec(body);
  if (decimal !== null) {
    const [, mantissa, exponentSign = '', exponentDigits = '0'] = decimal;
    const value = Number(`${mantissa}e${exponentSign}${dec2fltExponent(exponentDigits)}`);
    return negative ? -value : value;
  }
  if (SPECIAL_FLOAT.test(body)) {
    if (body.toLowerCase() === 'nan') {
      return Number.NaN;
    }
    return negative ? -Infinity : Infinity;
  }
  return null;
}

const USIZE_MAX = (1n << 64n) - 1n;

/**
 * Rust's `str::parse::<usize>()` on a 64-bit target: an optional `+` followed by ASCII digits,
 * at most `u64::MAX`.
 *
 * @param {string} s
 * @returns {number | null} the parsed value, or `null` when Rust would return an error
 */
export function parseUsize(s) {
  const digits = s.startsWith('+') ? s.slice(1) : s;
  if (!/^[0-9]+$/.test(digits)) {
    return null;
  }
  const value = BigInt(digits);
  return value > USIZE_MAX ? null : Number(value);
}

const RUST_WHITESPACE = new Set([
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0x85, 0xa0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004,
  0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
]);

/**
 * Rust's `char::is_whitespace` (the Unicode `White_Space` property).
 *
 * @param {number} codePoint
 * @returns {boolean}
 */
export function isRustWhitespace(codePoint) {
  return RUST_WHITESPACE.has(codePoint);
}

/**
 * Rust's `str::trim_start`.
 *
 * @param {string} s
 * @returns {string}
 */
export function rustTrimStart(s) {
  let start = 0;
  while (start < s.length && isRustWhitespace(s.charCodeAt(start))) {
    start += 1;
  }
  return s.slice(start);
}

/**
 * Rust's `str::trim_end`.
 *
 * @param {string} s
 * @returns {string}
 */
export function rustTrimEnd(s) {
  let end = s.length;
  while (end > 0 && isRustWhitespace(s.charCodeAt(end - 1))) {
    end -= 1;
  }
  return s.slice(0, end);
}

/**
 * Rust's `str::trim`.
 *
 * @param {string} s
 * @returns {string}
 */
export function rustTrim(s) {
  return rustTrimEnd(rustTrimStart(s));
}

const UTF8 = new TextEncoder();

/**
 * Length of a string in UTF-8 bytes (Rust's `str::len`).
 *
 * @param {string} s
 * @returns {number}
 */
export function utf8Len(s) {
  return UTF8.encode(s).length;
}
