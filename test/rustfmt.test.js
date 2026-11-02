// Copyright (c) David Peter and pastel contributors.
// SPDX-License-Identifier: MIT OR Apache-2.0
// Tests for src/lib/rustfmt.js (the Rust standard-library number semantics used by the
// JavaScript port of sharkdp/pastel v0.12.0).

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  asI32,
  asI64,
  asU8,
  clampF64,
  fmax,
  fmin,
  formatDisplay,
  formatFixed,
  isRustWhitespace,
  parseF64,
  parseUsize,
  powi,
  round,
  rustTrim,
  rustTrimEnd,
  rustTrimStart,
  utf8Len,
} from '../src/lib/rustfmt.js';

test('format_fixed_rounds_ties_to_even', () => {
  assert.equal(formatFixed(0.5, 0), '0');
  assert.equal(formatFixed(1.5, 0), '2');
  assert.equal(formatFixed(2.5, 0), '2');
  assert.equal(formatFixed(9.5, 0), '10');
  assert.equal(formatFixed(10.5, 0), '10');
  assert.equal(formatFixed(22.5, 0), '22');
  assert.equal(formatFixed(23.5, 0), '24');
  assert.equal(formatFixed(99.5, 0), '100');
  assert.equal(formatFixed(-1.5, 0), '-2');
  assert.equal(formatFixed(-2.5, 0), '-2');
  // exact binary ties at higher precision
  assert.equal(formatFixed(0.125, 2), '0.12');
  assert.equal(formatFixed(0.375, 2), '0.38');
  assert.equal(formatFixed(0.25, 1), '0.2');
});

test('format_fixed_uses_the_exact_binary_value', () => {
  // 1.005 is 1.00499999999999989..., 2.675 is 2.67499999999999982...
  assert.equal(formatFixed(1.005, 2), '1.00');
  assert.equal(formatFixed(2.675, 2), '2.67');
  assert.equal(formatFixed(9.995, 2), '9.99');
  assert.equal(formatFixed(0.1, 20), '0.10000000000000000555');
  assert.equal(formatFixed(123.456, 1), '123.5');
  assert.equal(formatFixed(0.5, 1), '0.5');
  assert.equal(formatFixed(255, 3), '255.000');
  assert.equal(formatFixed(0, 3), '0.000');
  assert.equal(formatFixed(5e-324, 3), '0.000');
  assert.equal(formatFixed(1e21, 0), '1000000000000000000000');
  assert.equal(formatFixed(1e21, 1), '1000000000000000000000.0');
});

test('format_fixed_keeps_the_sign_of_negative_values', () => {
  assert.equal(formatFixed(-0.0, 0), '-0');
  assert.equal(formatFixed(-0.0, 2), '-0.00');
  assert.equal(formatFixed(-0.3, 0), '-0');
  assert.equal(formatFixed(-0.5, 0), '-0');
  assert.equal(formatFixed(-0.001, 2), '-0.00');
  assert.equal(formatFixed(-0.0004, 3), '-0.000');
  assert.equal(formatFixed(-93.4, 0), '-93');
});

test('format_fixed_nan_and_infinity', () => {
  assert.equal(formatFixed(NaN, 0), 'NaN');
  assert.equal(formatFixed(NaN, 3), 'NaN');
  assert.equal(formatFixed(Infinity, 0), 'inf');
  assert.equal(formatFixed(Infinity, 2), 'inf');
  assert.equal(formatFixed(-Infinity, 0), '-inf');
  assert.equal(formatFixed(-Infinity, 3), '-inf');
});

test('format_display_never_uses_exponent_notation', () => {
  assert.equal(formatDisplay(1e21), '1000000000000000000000');
  assert.equal(formatDisplay(1.5e22), '15000000000000000000000');
  assert.equal(formatDisplay(1e-7), '0.0000001');
  assert.equal(formatDisplay(-1.25e-8), '-0.0000000125');
  assert.equal(formatDisplay(5e-324), `0.${'0'.repeat(323)}5`);
  assert.equal(formatDisplay(Number.MAX_VALUE), `17976931348623157${'0'.repeat(292)}`);
});

test('format_display_shortest_round_trip_digits', () => {
  assert.equal(formatDisplay(0.1), '0.1');
  assert.equal(formatDisplay(0.5), '0.5');
  assert.equal(formatDisplay(0.512), '0.512');
  assert.equal(formatDisplay(0.1 + 0.2), '0.30000000000000004');
  assert.equal(formatDisplay(1 / 3), '0.3333333333333333');
  assert.equal(formatDisplay(123456789.125), '123456789.125');
  assert.equal(formatDisplay(-93.5), '-93.5');
});

test('format_display_integral_values_and_zero', () => {
  assert.equal(formatDisplay(1), '1');
  assert.equal(formatDisplay(-1), '-1');
  assert.equal(formatDisplay(100), '100');
  assert.equal(formatDisplay(255), '255');
  assert.equal(formatDisplay(0), '0');
  assert.equal(formatDisplay(-0), '-0');
});

test('format_display_nan_and_infinity', () => {
  assert.equal(formatDisplay(NaN), 'NaN');
  assert.equal(formatDisplay(Infinity), 'inf');
  assert.equal(formatDisplay(-Infinity), '-inf');
});

test('round_half_away_from_zero', () => {
  assert.equal(round(0.5), 1);
  assert.equal(round(1.5), 2);
  assert.equal(round(2.5), 3);
  assert.equal(round(-0.5), -1);
  assert.equal(round(-1.5), -2);
  assert.equal(round(-2.5), -3);
  assert.equal(round(0.49999999999999994), 0);
  assert.equal(round(1.4), 1);
  assert.equal(round(-1.4), -1);
  assert.equal(round(4503599627370497), 4503599627370497);
  assert.equal(round(-0.3), -0);
  assert.equal(round(-0.0), -0);
  assert.equal(round(0.3), 0);
  assert.equal(round(NaN), NaN);
  assert.equal(round(Infinity), Infinity);
  assert.equal(round(-Infinity), -Infinity);
});

test('as_u8_saturates', () => {
  assert.equal(asU8(NaN), 0);
  assert.equal(asU8(-1), 0);
  assert.equal(asU8(-0.5), 0);
  assert.equal(asU8(-Infinity), 0);
  assert.equal(asU8(0.99), 0);
  assert.equal(asU8(12.7), 12);
  assert.equal(asU8(254.999), 254);
  assert.equal(asU8(255), 255);
  assert.equal(asU8(255.5), 255);
  assert.equal(asU8(256), 255);
  assert.equal(asU8(1e10), 255);
  assert.equal(asU8(Infinity), 255);
});

test('as_i32_saturates', () => {
  assert.equal(asI32(NaN), 0);
  assert.equal(asI32(1.9), 1);
  assert.equal(asI32(-1.9), -1);
  assert.equal(asI32(-0.5), 0);
  assert.equal(asI32(123456.789), 123456);
  assert.equal(asI32(2147483647.9), 2147483647);
  assert.equal(asI32(2147483648), 2147483647);
  assert.equal(asI32(3e9), 2147483647);
  assert.equal(asI32(Infinity), 2147483647);
  assert.equal(asI32(-2147483648.5), -2147483648);
  assert.equal(asI32(-3e9), -2147483648);
  assert.equal(asI32(-Infinity), -2147483648);
});

test('as_i64_saturates', () => {
  assert.equal(asI64(NaN), 0);
  assert.equal(asI64(300.7), 300);
  assert.equal(asI64(-1.5), -1);
  assert.equal(asI64(-0.5), 0);
  assert.equal(asI64(1e19), 2 ** 63);
  assert.equal(asI64(Infinity), 2 ** 63);
  assert.equal(asI64(-1e19), -(2 ** 63));
  assert.equal(asI64(-Infinity), -(2 ** 63));
});

test('fmax_fmin_ignore_nan', () => {
  assert.equal(fmax(NaN, 1), 1);
  assert.equal(fmax(1, NaN), 1);
  assert.equal(fmax(NaN, NaN), NaN);
  assert.equal(fmax(1, 2), 2);
  assert.equal(fmax(2, 1), 2);
  assert.equal(fmax(-Infinity, -1), -1);

  assert.equal(fmin(NaN, 1), 1);
  assert.equal(fmin(1, NaN), 1);
  assert.equal(fmin(NaN, NaN), NaN);
  assert.equal(fmin(1, 2), 1);
  assert.equal(fmin(2, 1), 1);
  assert.equal(fmin(Infinity, 1), 1);
});

test('clamp_f64_nan_gives_upper', () => {
  assert.equal(clampF64(0, 1, NaN), 1);
  assert.equal(clampF64(0, 1, -0.5), 0);
  assert.equal(clampF64(0, 1, 1.5), 1);
  assert.equal(clampF64(0, 1, 0.25), 0.25);
  assert.equal(clampF64(0, 1, Infinity), 1);
  assert.equal(clampF64(0, 1, -Infinity), 0);
  assert.equal(clampF64(0, 255, 300), 255);
});

test('powi_is_a_multiplication_chain', () => {
  for (const x of [1.1, 0.7, 1.0000001, 3.3, -2.5, 0.20689655172413793, 1e-5]) {
    assert.equal(powi(x, 0), 1);
    assert.equal(powi(x, 1), x);
    assert.equal(powi(x, 2), x * x);
    assert.equal(powi(x, 3), x * (x * x));
    assert.equal(powi(x, 4), (x * x) * (x * x));
    assert.equal(powi(x, 5), x * ((x * x) * (x * x)));
    assert.equal(powi(x, 7), (x * (x * x)) * ((x * x) * (x * x)));
  }
  assert.equal(powi(NaN, 2), NaN);
  assert.equal(powi(-0.0, 3), -0);
});

test('parse_f64_accepts_rust_float_syntax', () => {
  assert.equal(parseF64('0'), 0);
  assert.equal(parseF64('1'), 1);
  assert.equal(parseF64('007'), 7);
  assert.equal(parseF64('0.1'), 0.1);
  assert.equal(parseF64('1.'), 1);
  assert.equal(parseF64('.5'), 0.5);
  assert.equal(parseF64('-.5'), -0.5);
  assert.equal(parseF64('+.5e-3'), 0.0005);
  assert.equal(parseF64('+3'), 3);
  assert.equal(parseF64('-0'), -0);
  assert.equal(parseF64('1e5'), 100000);
  assert.equal(parseF64('1E+2'), 100);
  assert.equal(parseF64('1e-2'), 0.01);
  assert.equal(parseF64('2.5E0'), 2.5);
  assert.equal(parseF64('1e400'), Infinity);
  assert.equal(parseF64('-1e400'), -Infinity);
  assert.equal(parseF64('1e-400'), 0);
  assert.equal(parseF64('0.1000000000000000055511151231257827'), 0.1);
});

test('parse_f64_stops_reading_exponent_digits_at_0x10000', () => {
  const zeros = '0'.repeat(65535);
  // These digits are all read: the exponent is below 0x10000 until the last one.
  assert.equal(parseF64(`0.${zeros}1e65536`), 1);
  assert.equal(parseF64(`0.${zeros}1e655359`), Infinity);
  // e655360 reads as e65536, e1000000 as e100000, in either sign and with leading zeros.
  assert.equal(parseF64(`0.${zeros}1e655360`), 1);
  assert.equal(parseF64(`0.${zeros}1E+0000655369`), 1);
  assert.equal(parseF64(`1${zeros}0e-655360`), 1);
  assert.equal(parseF64(`0.${'0'.repeat(99999)}1e1000000`), 1);
  assert.equal(parseF64(`0.${'0'.repeat(99999)}1e100000000000000000000`), 1);
  // e18446744073709551616 reads as e184467.
  assert.equal(parseF64(`0.${'0'.repeat(99999)}1e18446744073709551616`), Infinity);
  assert.equal(parseF64(`0.${'0'.repeat(184466)}1e18446744073709551616`), 1);
  // Without such a long mantissa the result is the same as for the true exponent.
  assert.equal(parseF64('1e655360'), Infinity);
  assert.equal(parseF64('1e-655360'), 0);
  assert.equal(parseF64('-1e655360'), -Infinity);
  assert.equal(parseF64('0e655360'), 0);
});

test('parse_f64_accepts_inf_infinity_and_nan', () => {
  assert.equal(parseF64('inf'), Infinity);
  assert.equal(parseF64('+inf'), Infinity);
  assert.equal(parseF64('-inf'), -Infinity);
  assert.equal(parseF64('Inf'), Infinity);
  assert.equal(parseF64('infinity'), Infinity);
  assert.equal(parseF64('INFINITY'), Infinity);
  assert.equal(parseF64('-Infinity'), -Infinity);
  assert.equal(parseF64('nan'), NaN);
  assert.equal(parseF64('NaN'), NaN);
  assert.equal(parseF64('-nan'), NaN);
  assert.equal(parseF64('+NAN'), NaN);
});

test('parse_f64_rejects_everything_else', () => {
  for (const s of [
    '',
    '.',
    '+',
    '-',
    '1e',
    '1e+',
    'e5',
    '.e5',
    ' 1',
    '1 ',
    '\t1',
    '1\n',
    '0x10',
    '1_000',
    '++1',
    '+-1',
    '1.5.2',
    '1,5',
    'infin',
    'infinityy',
    'nana',
    '+ inf',
    '\u0661',
  ]) {
    assert.equal(parseF64(s), null, JSON.stringify(s));
  }
});

test('parse_usize_accepts_optional_plus_and_ascii_digits', () => {
  assert.equal(parseUsize('0'), 0);
  assert.equal(parseUsize('3'), 3);
  assert.equal(parseUsize('+3'), 3);
  assert.equal(parseUsize('007'), 7);
  assert.equal(parseUsize('4294967296'), 4294967296);
  assert.equal(parseUsize('18446744073709551615'), 2 ** 64);
});

test('parse_usize_rejects_signs_whitespace_and_overflow', () => {
  for (const s of [
    '',
    '+',
    '-',
    '-0',
    '-3',
    '++3',
    ' 3',
    '3 ',
    '3.0',
    '1e3',
    '0x10',
    '1_000',
    '\u0661',
    '18446744073709551616',
    '99999999999999999999',
  ]) {
    assert.equal(parseUsize(s), null, JSON.stringify(s));
  }
});

test('rust_whitespace_is_unicode_white_space', () => {
  for (const cp of [
    0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0x85, 0xa0, 0x1680, 0x2000, 0x2005, 0x200a, 0x2028,
    0x2029, 0x202f, 0x205f, 0x3000,
  ]) {
    assert.equal(isRustWhitespace(cp), true, cp.toString(16));
  }
  for (const cp of [0x00, 0x1c, 0x1d, 0x1e, 0x1f, 0x41, 0x180e, 0x200b, 0x2060, 0xfeff]) {
    assert.equal(isRustWhitespace(cp), false, cp.toString(16));
  }
});

test('rust_trim', () => {
  assert.equal(rustTrim('  red  '), 'red');
  assert.equal(rustTrim('\t\n\r\u000b\u000cred\u00a0\u3000'), 'red');
  assert.equal(rustTrim('\u0085red\u0085'), 'red');
  assert.equal(rustTrim('\u2028red\u2029'), 'red');
  assert.equal(rustTrim('\ufeffred'), '\ufeffred');
  assert.equal(rustTrim('red\ufeff'), 'red\ufeff');
  assert.equal(rustTrim('\u200bred'), '\u200bred');
  assert.equal(rustTrim('\u001cred\u001f'), '\u001cred\u001f');
  assert.equal(rustTrim(' a b '), 'a b');
  assert.equal(rustTrim('   '), '');
  assert.equal(rustTrim(''), '');
  assert.equal(rustTrim(' \u{1f600} '), '\u{1f600}');

  assert.equal(rustTrimStart(' \u0085a '), 'a ');
  assert.equal(rustTrimEnd(' a\u0085 '), ' a');
});

test('utf8_len', () => {
  assert.equal(utf8Len(''), 0);
  assert.equal(utf8Len('abc'), 3);
  assert.equal(utf8Len('\u00e9'), 2);
  assert.equal(utf8Len('\u00b0'), 2);
  assert.equal(utf8Len('\u212a'), 3);
  assert.equal(utf8Len('\u{1f600}'), 4);
});
