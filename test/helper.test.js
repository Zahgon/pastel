// Copyright (c) David Peter and pastel contributors.
// SPDX-License-Identifier: MIT OR Apache-2.0
// JavaScript port of the tests in src/helper.rs from sharkdp/pastel v0.12.0.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Fraction, interpolateAngle, MaxPrecision } from '../src/lib/helper.js';
import { assertF64Eq } from './helpers.js';

test('test_interpolate', () => {
  assertF64Eq(interpolateAngle(0.0, 90.0, Fraction.from(0.0)), 0.0);
  assertF64Eq(interpolateAngle(0.0, 90.0, Fraction.from(0.5)), 45.0);
  assertF64Eq(interpolateAngle(0.0, 90.0, Fraction.from(1.0)), 90.0);
  assertF64Eq(interpolateAngle(0.0, 90.0, Fraction.from(1.1)), 90.0);
});

test('test_interpolate_angle', () => {
  assertF64Eq(interpolateAngle(0.0, 30.0, Fraction.from(0.5)), 15.0);
  assertF64Eq(interpolateAngle(0.0, 100.0, Fraction.from(0.2)), 20.0);
  assertF64Eq(interpolateAngle(10.0, 350.0, Fraction.from(0.5)), 0.0);
  assertF64Eq(interpolateAngle(350.0, 10.0, Fraction.from(0.5)), 0.0);
});

test('test_max_precision', () => {
  assert.equal(`${MaxPrecision.wrap(3, 0.5)}`, '0.5');
  assert.equal(`${MaxPrecision.wrap(3, 0.51)}`, '0.51');
  assert.equal(`${MaxPrecision.wrap(3, 0.512)}`, '0.512');
  assert.equal(`${MaxPrecision.wrap(3, 0.5124)}`, '0.512');
  assert.equal(`${MaxPrecision.wrap(3, 0.5125)}`, '0.513');
});
