// Copyright (c) David Peter and pastel contributors.
// SPDX-License-Identifier: MIT OR Apache-2.0
// Tests of the `pow` routine of the JavaScript port of sharkdp/pastel v0.12.0.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { pow } from '../src/lib/pow.js';

test('pow_gives_the_results_of_the_system_libm', () => {
  // Values of glibc 2.36 on aarch64 where `Math.pow` of Node 22 is off by one unit in the last place.
  assert.equal(pow(0.615426868898794, 2.4), 0.3119058265150016);
  assert.equal(pow(0.4921643624547869, 1.0 / 2.4), 0.7442392461484165);
  assert.equal(pow(0.6961237692739815, 1.0 / 3.0), 0.8862620525994046);
  assert.equal(pow(1.9019085802137852, 3.0), 6.879690693934703);
  assert.equal(pow(-1.9019085802137852, 3.0), -6.879690693934703);
  // The range where the result needs the special case for underflow.
  assert.equal(pow(5.997587131266423e-93, 3.0), 2.1573951495756558e-277);
});

test('pow_special_values', () => {
  assert.equal(pow(0.0, 3.0), 0.0);
  assert.equal(pow(-0.0, 3.0), -0.0);
  assert.equal(pow(-0.0, 2.4), 0.0);
  assert.equal(pow(1.0, 2.4), 1.0);
  assert.equal(pow(Number.POSITIVE_INFINITY, 2.4), Number.POSITIVE_INFINITY);
  assert.equal(pow(Number.NEGATIVE_INFINITY, 3.0), Number.NEGATIVE_INFINITY);
  assert.equal(pow(Number.NaN, 2.4), Number.NaN);
  assert.equal(pow(-0.5, 2.4), Number.NaN);
  assert.equal(pow(1e-300, 3.0), 0.0);
  assert.equal(pow(1e300, 3.0), Number.POSITIVE_INFINITY);
  assert.equal(pow(5e-324, 1.0 / 3.0), 1.7031839360032837e-108);
});
