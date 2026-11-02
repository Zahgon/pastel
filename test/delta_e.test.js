// Copyright (c) David Peter and pastel contributors.
// SPDX-License-Identifier: MIT OR Apache-2.0
// JavaScript port of the tests in src/delta_e.rs from sharkdp/pastel v0.12.0.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspect } from 'node:util';

import { Lab } from '../src/lib/color.js';
import { ciede2000 } from '../src/lib/delta_e.js';
import { round as roundF64 } from '../src/lib/rustfmt.js';

/**
 * @param {number} val
 * @returns {number} `val` rounded to 4 decimal places
 */
function round(val) {
  const rounded = val * 10000;
  return roundF64(rounded) / 10000;
}

/**
 * @param {number} expected
 * @param {[number, number, number]} lab1
 * @param {[number, number, number]} lab2
 */
function assertDeltaE(expected, lab1, lab2) {
  const color1 = new Lab(lab1[0], lab1[1], lab1[2], 1.0);

  const color2 = new Lab(lab2[0], lab2[1], lab2[2], 1.0);

  const actual = round(ciede2000(color1, color2));
  if (!(actual === expected)) {
    throw new assert.AssertionError({
      message:
        `ciede2000(${inspect(lab1)}, ${inspect(lab2)}): ` +
        `expected ${inspect(expected)}, got ${inspect(actual)}`,
      actual,
      expected,
      operator: '==',
    });
  }
}

// Tests taken from Table 1: "CIEDE2000 total color difference test data" of
// "The CIEDE2000 Color-Difference Formula: Implementation Notes,
// Supplementary Test Data, and Mathematical Observations" by Gaurav Sharma,
// Wencheng Wu and Edul N. Dalal.
//
// http://www.ece.rochester.edu/~gsharma/papers/CIEDE2000CRNAFeb05.pdf

test('tests', () => {
  assertDeltaE(0.0, [0.0, 0.0, 0.0], [0.0, 0.0, 0.0]);
  assertDeltaE(0.0, [99.5, 0.005, -0.01], [99.5, 0.005, -0.01]);
  assertDeltaE(100.0, [100.0, 0.005, -0.01], [0.0, 0.0, 0.0]);
  assertDeltaE(2.0425, [50.0, 2.6772, -79.7751], [50.0, 0.0, -82.7485]);
  assertDeltaE(2.8615, [50.0, 3.1571, -77.2803], [50.0, 0.0, -82.7485]);
  assertDeltaE(3.4412, [50.0, 2.8361, -74.02], [50.0, 0.0, -82.7485]);
  assertDeltaE(1.0, [50.0, -1.3802, -84.2814], [50.0, 0.0, -82.7485]);
  assertDeltaE(1.0, [50.0, -1.1848, -84.8006], [50.0, 0.0, -82.7485]);
  assertDeltaE(1.0, [50.0, -0.9009, -85.5211], [50.0, 0.0, -82.7485]);
  assertDeltaE(2.3669, [50.0, 0.0, 0.0], [50.0, -1.0, 2.0]);
  assertDeltaE(2.3669, [50.0, -1.0, 2.0], [50.0, 0.0, 0.0]);
  assertDeltaE(7.1792, [50.0, 2.49, -0.001], [50.0, -2.49, 0.0009]);
  assertDeltaE(7.1792, [50.0, 2.49, -0.001], [50.0, -2.49, 0.001]);
  assertDeltaE(7.2195, [50.0, 2.49, -0.001], [50.0, -2.49, 0.0011]);
  assertDeltaE(7.2195, [50.0, 2.49, -0.001], [50.0, -2.49, 0.0012]);
  assertDeltaE(4.8045, [50.0, -0.001, 2.49], [50.0, 0.0009, -2.49]);
  assertDeltaE(4.7461, [50.0, -0.001, 2.49], [50.0, 0.0011, -2.49]);
  assertDeltaE(4.3065, [50.0, 2.5, 0.0], [50.0, 0.0, -2.5]);
  assertDeltaE(27.1492, [50.0, 2.5, 0.0], [73.0, 25.0, -18.0]);
  assertDeltaE(22.8977, [50.0, 2.5, 0.0], [61.0, -5.0, 29.0]);
  assertDeltaE(31.903, [50.0, 2.5, 0.0], [56.0, -27.0, -3.0]);
  assertDeltaE(19.4535, [50.0, 2.5, 0.0], [58.0, 24.0, 15.0]);
  assertDeltaE(1.0, [50.0, 2.5, 0.0], [50.0, 3.1736, 0.5854]);
  assertDeltaE(1.0, [50.0, 2.5, 0.0], [50.0, 3.2972, 0.0]);
  assertDeltaE(1.0, [50.0, 2.5, 0.0], [50.0, 1.8634, 0.5757]);
  assertDeltaE(1.0, [50.0, 2.5, 0.0], [50.0, 3.2592, 0.335]);
  assertDeltaE(1.2644, [60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387]);
  assertDeltaE(1.263, [63.0109, -31.0961, -5.8663], [62.8187, -29.7946, -4.0864]);
  assertDeltaE(1.8731, [61.2901, 3.7196, -5.3901], [61.4292, 2.248, -4.962]);
  assertDeltaE(1.8645, [35.0831, -44.1164, 3.7933], [35.0232, -40.0716, 1.5901]);
  assertDeltaE(2.0373, [22.7233, 20.0904, -46.694], [23.0331, 14.973, -42.5619]);
  assertDeltaE(1.4146, [36.4612, 47.858, 18.3852], [36.2715, 50.5065, 21.2231]);
  assertDeltaE(1.4441, [90.8027, -2.0831, 1.441], [91.1528, -1.6435, 0.0447]);
  assertDeltaE(1.5381, [90.9257, -0.5406, -0.9208], [88.6381, -0.8985, -0.7239]);
  assertDeltaE(0.6377, [6.7747, -0.2908, -2.4247], [5.8714, -0.0985, -2.2286]);
  assertDeltaE(0.9082, [2.0776, 0.0795, -1.135], [0.9033, -0.0636, -0.5514]);
});
