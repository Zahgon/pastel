// Copyright (c) David Peter and pastel contributors.
// SPDX-License-Identifier: MIT OR Apache-2.0
// JavaScript port of the tests in src/parser.rs from sharkdp/pastel v0.12.0.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Color } from '../src/lib/color.js';
import { parseColor } from '../src/lib/parser.js';

const rgb = (r, g, b) => Color.fromRgb(r, g, b);
const rgba = (r, g, b, a) => Color.fromRgba(r, g, b, a);

/**
 * The Rust `Debug` output of an `Option<Color>`.
 *
 * @param {Color | null} color
 * @returns {string}
 */
function debugOption(color) {
  return color === null ? 'None' : `Some(${color.debugString()})`;
}

/**
 * `assert_eq!(Some(expected), parse_color(input))`.
 *
 * @param {Color} expected
 * @param {string} input
 */
function assertParses(expected, input) {
  const actual = parseColor(input);
  if (actual === null || !actual.equals(expected)) {
    throw new assert.AssertionError({
      message: `parse_color(${JSON.stringify(input)}): expected ${debugOption(expected)}, got ${debugOption(actual)}`,
      actual,
      expected,
      operator: '==',
    });
  }
}

/**
 * `assert_eq!(None, parse_color(input))`.
 *
 * @param {string} input
 */
function assertNone(input) {
  const actual = parseColor(input);
  if (actual !== null) {
    throw new assert.AssertionError({
      message: `parse_color(${JSON.stringify(input)}): expected None, got ${debugOption(actual)}`,
      actual,
      expected: null,
      operator: '==',
    });
  }
}

test('parse_rgb_hex_syntax', () => {
  assertParses(rgb(255, 0, 153), 'f09');
  assertParses(rgb(255, 0, 153), '#f09');
  assertParses(rgb(255, 0, 153), '#F09');

  assertParses(rgb(255, 0, 153), '#ff0099');
  assertParses(rgb(255, 0, 153), '#FF0099');
  assertParses(rgb(255, 0, 153), 'ff0099');

  assertParses(rgb(87, 166, 206), '57A6CE');
  assertParses(rgb(255, 0, 119), '  #ff0077  ');

  assertNone('#1');
  assertNone('#12');
  assertNone('#12345');
  assertNone('#1234567');
  assertNone('#hh0033');
  assertNone('#h03');
});

test('parse_rgb_functional_syntax', () => {
  assertParses(rgb(255, 0, 153), 'rgb(255,0,153)');
  assertParses(rgb(255, 0, 153), 'rgb(255, 0, 153)');
  assertParses(rgb(255, 0, 153), 'rgb( 255 , 0 , 153 )');
  assertParses(rgb(255, 0, 153), 'rgb(255, 0, 153.0)');
  assertParses(rgb(255, 0, 153), 'rgb(255 0 153)');

  assertParses(rgb(255, 8, 119), '  rgb( 255  ,  8  ,  119 )  ');

  assertParses(rgb(255, 0, 127), 'rgb(100%,0%,49.8%)');
  assertParses(rgb(255, 0, 153), 'rgb(100%,0%,60%)');
  assertParses(rgb(255, 0, 119), 'rgb(100%,0%,46.7%)');
  assertParses(rgb(3, 54, 119), 'rgb(1%,21.2%,46.7%)');
  assertParses(rgb(255, 0, 119), 'rgb(255 0 119)');
  assertParses(rgb(255, 0, 119), 'rgb(    255      0      119)');

  assertParses(rgb(255, 0, 153), 'rgb(100%,0%,60%)');
  assertParses(rgb(255, 0, 153), 'rgb(100%, 0%, 60%)');
  assertParses(rgb(255, 0, 153), 'rgb( 100% , 0% , 60% )');
  assertParses(rgb(255, 0, 153), 'rgb(100% 0% 60%)');

  assertParses(rgb(100, 5, 1), 'rgb(1e2, .5e1, .5e0)');
  assertParses(rgb(140, 0, 153), 'rgb(55% 0% 60%)');
  assertParses(rgb(142, 0, 153), 'rgb(55.5% 0% 60%)');
  assertParses(rgb(255, 0, 0), 'rgb(256,0,0)');
  assertParses(rgb(255, 255, 0), 'rgb(100%,100%,-45%)');

  assertNone('rgb(255,0)');
  assertNone('rgb(255,0,0');
  assertNone('rgb (256,0,0)');
  assertNone('rgb(100%,0,0)');
  assertNone('rgb(2550119)');
});

test('parse_rgb_standalone_syntax', () => {
  assertParses(rgb(255, 8, 119), '  rgb( 255  ,  8  ,  119 )  ');

  assertParses(rgb(255, 0, 153), '255,0,153');
  assertParses(rgb(255, 0, 153), '255, 0, 153');
  assertParses(rgb(255, 0, 153), '  255  ,  0  ,  153   ');
  assertParses(rgb(255, 0, 153), '255 0 153');
  assertParses(rgb(255, 0, 153), '255 0 153.0');

  assertParses(rgb(1, 2, 3), '1,2,3');
});

test('parse_hsl_syntax', () => {
  assertParses(Color.fromHsl(280.0, 0.2, 0.5), 'hsl(280,20%,50%)');
  assertParses(Color.fromHsl(280.0, 0.2, 0.5), 'hsl(280deg,20%,50%)');
  assertParses(Color.fromHsl(280.0, 0.2, 0.5), 'hsl(280°,20%,50%)');
  assertParses(Color.fromHsl(280.33, 0.123, 0.456), 'hsl(280.33001,12.3%,45.6%)');
  assertParses(Color.fromHsl(280.0, 0.2, 0.5), 'hsl(  280 , 20% , 50%)');
  assertParses(Color.fromHsl(270.0, 0.6, 0.7), 'hsl(270 60% 70%)');

  assertParses(Color.fromHsl(-140.0, 0.2, 0.5), 'hsl(-140°,20%,50%)');

  assertParses(Color.fromHsl(90.0, 0.2, 0.5), 'hsl(100grad,20%,50%)');
  assertParses(Color.fromHsl(90.05, 0.2, 0.5), 'hsl(1.5708rad,20%,50%)');
  assertParses(Color.fromHsl(90.0, 0.2, 0.5), 'hsl(0.25turn,20%,50%)');
  assertParses(Color.fromHsl(45.0, 0.2, 0.5), 'hsl(50grad,20%,50%)');
  assertParses(Color.fromHsl(45.0, 0.2, 0.5), 'hsl(0.7854rad,20%,50%)');
  assertParses(Color.fromHsl(45.0, 0.2, 0.5), 'hsl(0.125turn,20%,50%)');

  assertNone('hsl(280,20%,50)');
  assertNone('hsl(280,20,50%)');
  assertNone('hsl(280%,20%,50%)');
  assertNone('hsl(280,20%)');
});

test('parse_hsv_syntax', () => {
  assertParses(Color.fromHsv(280.0, 0.2, 0.5), 'hsv(280,20%,50%)');
  assertParses(Color.fromHsv(280.0, 0.2, 0.5), 'hsv(280deg,20%,50%)');
  assertParses(Color.fromHsv(280.0, 0.2, 0.5), 'hsv(280°,20%,50%)');
  assertParses(Color.fromHsv(280.33, 0.123, 0.456), 'hsv(280.33001,12.3%,45.6%)');
  assertParses(Color.fromHsv(280.0, 0.2, 0.5), 'hsv(  280 , 20% , 50%)');
  assertParses(Color.fromHsv(270.0, 0.6, 0.7), 'hsv(270 60% 70%)');

  assertParses(Color.fromHsv(-140.0, 0.2, 0.5), 'hsv(-140°,20%,50%)');

  assertParses(Color.fromHsv(90.0, 0.2, 0.5), 'hsv(100grad,20%,50%)');
  assertParses(Color.fromHsv(90.05, 0.2, 0.5), 'hsv(1.5708rad,20%,50%)');
  assertParses(Color.fromHsv(90.0, 0.2, 0.5), 'hsv(0.25turn,20%,50%)');
  assertParses(Color.fromHsv(45.0, 0.2, 0.5), 'hsv(50grad,20%,50%)');
  assertParses(Color.fromHsv(45.0, 0.2, 0.5), 'hsv(0.7854rad,20%,50%)');
  assertParses(Color.fromHsv(45.0, 0.2, 0.5), 'hsv(0.125turn,20%,50%)');

  assertNone('hsv(280,20%,50)');
  assertNone('hsv(280,20,50%)');
  assertNone('hsv(280%,20%,50%)');
  assertNone('hsv(280,20%)');
});

test('parse_gray_syntax', () => {
  assertParses(Color.graytone(0.2), 'gray(0.2)');
  assertParses(Color.black(), 'gray(0.0)');
  assertParses(Color.black(), 'gray(0)');
  assertParses(Color.white(), 'gray(1.0)');
  assertParses(Color.white(), 'gray(1)');
  assertParses(Color.white(), 'gray(7.3)');

  assertParses(Color.graytone(0.32), 'gray(.32)');

  assertParses(Color.graytone(0.41), '  gray(  0.41   ) ');

  assertParses(Color.graytone(0.2), 'gray(20%)');
  assertParses(Color.black(), 'gray(0%)');
  assertParses(Color.black(), 'gray(0.0%)');
  assertParses(Color.white(), 'gray(100%)');
  assertParses(Color.graytone(0.5), 'gray(50%)');

  assertNone('gray(-1)');
  assertNone('gray(-1%)');
  assertNone('gray(-4.%)');
});

test('parse_numbers_skip_exponent_digits_like_dec2flt', () => {
  // Not from the Rust tests. Exponent digits are skipped from 0x10000 on, so e655360 means e65536
  // here: with the true exponent these would be white and black.
  const zeros = '0'.repeat(65536);
  assertParses(Color.graytone(0.1), `gray(0.${zeros}1e655360)`);
  assertParses(Color.white(), `gray(1${zeros}e-655360)`);
  assertParses(Color.graytone(0.5), `gray(0.${zeros}5E+655360)`);
});

test('parse_lab_syntax', () => {
  assertParses(Color.fromLab(12.43, -35.5, 43.4, 1.0), 'Lab(12.43,-35.5,43.4)');
  assertParses(Color.fromLab(15.0, -23.0, 43.0, 0.5), 'lab(15,-23,43,0.5)');
  assertParses(Color.fromLab(15.0, 23.0, -43.0, 1.0), 'CIELab(15,23,-43)');
  assertParses(Color.fromLab(15.0, 35.5, -43.4, 1.0), 'CIELab(15,35.5,-43.4)');
  assertParses(Color.fromLab(15.0, -35.5, -43.4, 0.4), 'cieLab(15,-35.5,-43.4,0.4)');
  assertParses(Color.fromLab(15.0, 23.0, -43.0, 1.0), 'Lab(        15,  23,-43   )');
  assertParses(Color.fromLab(15.0, -35.5, -43.4, 0.4), 'CieLab(15,-35.5,-43.4,0.4)');
  assertParses(Color.fromLab(15.0, 23.0, -43.0, 1.0), 'CIELab(        15,  23,-43   )');
});

test('parse_oklab_syntax', () => {
  assertParses(Color.fromOklab(12.43, -35.5, 43.4, 1.0), 'okLab(12.43,-35.5,43.4)');
  assertParses(Color.fromOklab(15.0, -23.0, 43.0, 0.5), 'OKlab(15,-23,43,0.5)');
  assertParses(Color.fromOklab(15.0, 23.0, -43.0, 1.0), 'OkLab(15,23,-43)');
  assertParses(Color.fromOklab(15.0, 35.5, -43.4, 1.0), 'oKLab(15,35.5,-43.4)');
  assertParses(Color.fromOklab(15.0, -35.5, -43.4, 0.4), 'okLab(15,-35.5,-43.4,0.4)');
  assertParses(Color.fromOklab(15.0, 23.0, -43.0, 1.0), 'OKLab(        15,  23,-43   )');
  assertParses(Color.fromOklab(15.0, -35.5, -43.4, 0.4), 'OKLab(15,-35.5,-43.4,0.4)');
  assertParses(Color.fromOklab(15.0, 23.0, -43.0, 1.0), 'OkLab(        15,  23,-43   )');
});

test('parse_lch_syntax', () => {
  assertParses(Color.fromLch(12.43, -35.5, 43.4, 1.0), 'Lch(12.43,-35.5,43.4)');
  assertParses(Color.fromLch(15.0, -23.0, 43.0, 0.5), 'lch(15,-23,43,0.5)');
  assertParses(Color.fromLch(15.0, 23.0, -43.0, 1.0), 'CIELch(15,23,-43)');
  assertParses(Color.fromLch(15.0, 35.5, -43.4, 1.0), 'CIELch(15,35.5,-43.4)');
  assertParses(Color.fromLch(15.0, -35.5, -43.4, 0.4), 'cieLch(15,-35.5,-43.4,0.4)');
  assertParses(Color.fromLch(15.0, 23.0, -43.0, 1.0), 'Lch(        15,  23,-43   )');
  assertParses(Color.fromLch(15.0, -35.5, -43.4, 0.4), 'CieLch(15,-35.5,-43.4,0.4)');
  assertParses(Color.fromLch(15.0, 23.0, -43.0, 1.0), 'CIELch(        15,  23,-43   )');

  assertParses(Color.fromLch(15.0, -23.0, 43.0, 1.0), 'lch(15,-23,43)');
  assertParses(Color.fromLch(15.0, -23.0, 43.0, 1.0), 'lch(15,-23,43°)');
  assertParses(Color.fromLch(15.0, -23.0, 43.0, 1.0), 'lch(15,-23,43deg)');

  assertNone('lch(15%,-23,43)');
});

test('parse_oklch_syntax', () => {
  assertParses(Color.fromOklch(0.1243, 0.0355, 43.4, 1.0), 'oklch(0.1243,0.0355,43.4)');
  assertParses(Color.fromOklch(0.15, 0.023, 43.0, 0.5), 'OKlch(0.15,0.023,43,0.5)');
  assertParses(Color.fromOklch(0.15, 0.023, 43.0, 1.0), 'OkLch(0.15,0.023,43)');
  assertParses(Color.fromOklch(0.15, 0.0355, 43.4, 1.0), 'oKLch(0.15,0.0355,43.4)');
  assertParses(Color.fromOklch(0.15, 0.0355, 43.4, 0.4), 'okLch(0.15,0.0355,43.4,0.4)');
  assertParses(Color.fromOklch(0.15, 23.0, 43.0, 1.0), 'OKLch(        0.15,  23,43   )');
  assertParses(Color.fromOklch(0.15, 0.0355, 43.4, 0.4), 'OKLch(0.15,0.0355,43.4,0.4)');
  assertParses(Color.fromOklch(0.15, 0.02, 43.0, 1.0), 'OkLch(        0.15,  0.02,43   )');
});

test('parse_ansi_8bit_syntax', () => {
  assertParses(Color.black(), 'ansi_8bit(0)');
  assertParses(Color.red(), 'ansi_8bit(9)');
  assertParses(Color.white(), 'ansi_8bit(15)');
  assertParses(Color.fromRgb(255, 215, 95), 'ansi_8bit(221)');
  assertParses(Color.white(), 'ansi_8bit(231)');
  assertParses(Color.fromRgb(8, 8, 8), 'ansi_8bit(232)');
  assertParses(Color.fromRgb(238, 238, 238), 'ansi_8bit(255)');

  // whitespace
  assertParses(Color.black(), '  ansi_8bit( 0 )  ');
  assertParses(Color.red(), 'ansi_8bit(  9  )');

  // case insensitive
  assertParses(Color.black(), 'ANSI_8BIT(0)');
  assertParses(Color.black(), 'Ansi_8bit(0)');
  assertParses(Color.black(), 'Ansi_8Bit(0)');

  // out of range
  assertNone('ansi_8bit(256)');
  assertNone('ansi_8bit(-1)');

  // invalid syntax
  assertNone('ansi_8bit()');
  assertNone('ansi_8bit(0');
});

test('parse_named_syntax', () => {
  assertParses(Color.black(), 'black');
  assertParses(Color.blue(), 'blue');
  assertParses(Color.blue(), 'Blue');
  assertParses(Color.blue(), 'BLUE');
  assertParses(rgb(255, 20, 147), 'deeppink');
  assertNone('whatever');
  assertNone('red blue');
});

test('parse_alpha_syntax', () => {
  // hex
  assertParses(rgba(255, 0, 0, 1.0), 'ff0000ff');
  assertParses(rgba(255, 0, 0, 1.0), '#ff0000ff');

  // rgb/rgba
  assertParses(rgba(10, 0, 0, 1.0), 'rgb(10,0,0,1)');
  assertParses(rgba(10, 0, 0, 1.0), 'rgb(10,0,0, 1)');
  assertParses(rgba(10, 0, 0, 1.0), 'rgba(10,0,0,1)');
  assertParses(rgba(10, 0, 0, 1.0), 'rgba(10,0,0, 1)');
  assertParses(rgba(10, 0, 0, 1.0), 'rgba(10,0,0,1.0)');
  assertParses(rgba(10, 0, 0, 1.0), 'rgba(10,0,0, 1.0)');

  // hsl/hsla
  assertParses(Color.fromHsla(10.0, 0.5, 0.5, 1.0), 'hsl(10,50%,50%,1)');
  assertParses(Color.fromHsla(10.0, 0.5, 0.5, 1.0), 'hsl(10,50%,50%,1.0)');
  assertParses(Color.fromHsla(10.0, 0.5, 0.5, 1.0), 'hsla(10,50%,50%,1)');
  assertParses(Color.fromHsla(10.0, 0.5, 0.5, 1.0), 'hsla(10,50%,50%,1.0)');

  // lab
  assertParses(Color.fromLab(10.0, 30.0, 50.0, 1.0), 'lab(10,30,50,1)');
  assertParses(Color.fromLab(10.0, 30.0, 50.0, 1.0), 'lab(10,30,50,1.0)');

  // alpha parsing
  assertParses(rgba(10, 0, 0, 0.5), 'rgba(10,0,0,0.5)');
  assertParses(rgba(10, 0, 0, 0.5), 'rgba(10,0,0,50%)');
  assertParses(rgba(10, 0, 0, 0.33), 'rgba(10,0,0,0.33)');
  assertParses(rgba(10, 0, 0, 0.33), 'rgba(10,0,0,33%)');

  // hex alpha doesn't line up nicely with decimal precision,
  // so just compare the debug output (3 digit precision)
  assert.equal(debugOption(parseColor('0a000080')), debugOption(rgba(10, 0, 0, 0.502)));
  assert.equal(debugOption(parseColor('0a000054')), debugOption(rgba(10, 0, 0, 0.329)));
});
