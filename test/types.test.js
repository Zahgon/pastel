// Copyright (c) David Peter and pastel contributors.
// SPDX-License-Identifier: MIT OR Apache-2.0
// JavaScript port of the tests in src/types.rs from sharkdp/pastel v0.12.0.

import { test } from 'node:test';

import { modPositive } from '../src/lib/helper.js';
import { Hue } from '../src/lib/types.js';
import { assertF64Eq, assertRelativeEq } from './helpers.js';

test('test_mod_positive', () => {
  assertRelativeEq(modPositive(2.9, 2.4), 0.5);
  assertRelativeEq(modPositive(-0.3, 2.0), 1.7);
});

test('test_hue_clipping', () => {
  assertF64Eq(Hue.from(43.0).value(), 43.0);
  assertF64Eq(Hue.from(373.0).value(), 13.0);
  assertF64Eq(Hue.from(-60.0).value(), 300.0);
  assertF64Eq(Hue.from(360.0).value(), 360.0);
});
