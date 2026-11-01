// Copyright (c) David Peter and pastel contributors.
// SPDX-License-Identifier: MIT OR Apache-2.0
// Assertions shared by the tests of the JavaScript port of sharkdp/pastel v0.12.0.

import assert from 'node:assert/strict';
import { inspect } from 'node:util';

/**
 * Rust `assert_eq!` for `f64` values: IEEE equality (`0.0 == -0.0`, NaN is never equal).
 *
 * @param {number} actual
 * @param {number} expected
 */
export function assertF64Eq(actual, expected) {
  if (!(actual === expected)) {
    throw new assert.AssertionError({
      message: `expected ${inspect(expected)}, got ${inspect(actual)}`,
      actual,
      expected,
      operator: '==',
    });
  }
}

/**
 * `approx::relative_eq` for `f64` with `epsilon = f64::EPSILON`.
 *
 * @param {number} a
 * @param {number} b
 * @param {number} maxRelative
 * @returns {boolean}
 */
function relativeEq(a, b, maxRelative) {
  if (a === b) {
    return true;
  }
  if (a === Infinity || a === -Infinity || b === Infinity || b === -Infinity) {
    return false;
  }
  const absDiff = Math.abs(a - b);
  if (absDiff <= Number.EPSILON) {
    return true;
  }
  const largest = Math.max(Math.abs(a), Math.abs(b));
  return absDiff <= largest * maxRelative;
}

/**
 * `assert_relative_eq!(expected, actual, max_relative = maxRelative)`; the default
 * `max_relative` is `f64::EPSILON`, as in the approx crate.
 *
 * @param {number} actual
 * @param {number} expected
 * @param {number} [maxRelative]
 */
export function assertRelativeEq(actual, expected, maxRelative = Number.EPSILON) {
  if (!relativeEq(expected, actual, maxRelative)) {
    throw new assert.AssertionError({
      message:
        `assert_relative_eq failed (max_relative = ${maxRelative}): ` +
        `expected ${inspect(expected)}, got ${inspect(actual)}`,
      actual,
      expected,
      operator: 'relative_eq',
    });
  }
}

/**
 * Rust `assert_eq!` for colors (`PartialEq for Color`: equal RGBA values).
 *
 * @param {import('../src/lib/color.js').Color | null} actual
 * @param {import('../src/lib/color.js').Color} expected
 */
export function assertColorEq(actual, expected) {
  if (actual === null || !actual.equals(expected)) {
    throw new assert.AssertionError({
      message:
        `expected ${expected.debugString()}, ` +
        `got ${actual === null ? 'None' : actual.debugString()}`,
      actual,
      expected,
      operator: '==',
    });
  }
}
