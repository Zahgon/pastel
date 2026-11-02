// Copyright (c) David Peter and pastel contributors.
// SPDX-License-Identifier: MIT OR Apache-2.0
// JavaScript port of the tests in src/ansi.rs from sharkdp/pastel v0.12.0.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ansiStyle, Brush, fromAnsi8bit, Mode, Style, toAnsi8bit } from '../src/lib/ansi.js';
import { Color } from '../src/lib/color.js';
import { assertColorEq } from './helpers.js';

test('from_ansi_8bit_lower_16', () => {
  assertColorEq(fromAnsi8bit(0), Color.black());
  assertColorEq(fromAnsi8bit(9), Color.red());
  assertColorEq(fromAnsi8bit(15), Color.white());
});

test('from_ansi_8bit_cube', () => {
  assertColorEq(fromAnsi8bit(16), Color.black());
  assertColorEq(fromAnsi8bit(17), Color.fromRgb(0, 0, 95));
  assertColorEq(fromAnsi8bit(72), Color.fromRgb(95, 175, 135));
  assertColorEq(fromAnsi8bit(221), Color.fromRgb(255, 215, 95));
  assertColorEq(fromAnsi8bit(231), Color.white());
});

test('from_ansi_8bit_grays', () => {
  assertColorEq(fromAnsi8bit(232), Color.fromRgb(8, 8, 8));
  assertColorEq(fromAnsi8bit(242), Color.fromRgb(108, 108, 108));
  assertColorEq(fromAnsi8bit(255), Color.fromRgb(238, 238, 238));
});

test('to_ansi_8bit_lower_16', () => {
  assert.equal(toAnsi8bit(Color.black()), 16);
  assert.equal(toAnsi8bit(Color.white()), 231);

  assert.equal(toAnsi8bit(Color.red()), 196);
  assert.equal(toAnsi8bit(Color.green()), 28);
  assert.equal(toAnsi8bit(Color.blue()), 21);

  assert.equal(toAnsi8bit(Color.lime()), 46);
  assert.equal(toAnsi8bit(Color.yellow()), 226);
  assert.equal(toAnsi8bit(Color.fuchsia()), 201);
  assert.equal(toAnsi8bit(Color.aqua()), 51);
  assert.equal(toAnsi8bit(Color.gray()), 244);

  assert.equal(toAnsi8bit(Color.black().lighten(0.01)), 16);
});

test('to_ansi_8bit_cube', () => {
  assert.equal(toAnsi8bit(Color.fromRgb(95, 175, 135)), 72);
  assert.equal(toAnsi8bit(Color.fromRgb(255, 215, 95)), 221);
});

test('to_ansi_8bit_grays', () => {
  assert.equal(toAnsi8bit(Color.fromRgb(8, 8, 8)), 232);
  assert.equal(toAnsi8bit(Color.fromRgb(108, 108, 108)), 242);
  assert.equal(toAnsi8bit(Color.fromRgb(238, 238, 238)), 255);
});

test('ansi_style', () => {
  assert.equal(new Style().escapeSequence(Mode.TrueColor), '\x1b[0m');

  assert.equal(ansiStyle(Color.red()).escapeSequence(Mode.TrueColor), '\x1b[38;2;255;0;0m');

  assert.equal(ansiStyle(Color.red()).escapeSequence(Mode.Ansi8Bit), '\x1b[38;5;196m');

  assert.equal(
    ansiStyle(Color.red())
      .on(Color.blue())
      .bold(true)
      .italic(true)
      .underline(true)
      .escapeSequence(Mode.TrueColor),
    '\x1b[38;2;255;0;0;48;2;0;0;255;1;3;4m',
  );
});

test('brush', () => {
  const ansi = Brush.fromMode(Mode.TrueColor);

  assert.equal(
    ansi.paint('hello', ansiStyle(Color.red()).bold(true)),
    '\x1b[38;2;255;0;0;1mhello\x1b[0m',
  );
});
