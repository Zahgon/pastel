// Copyright (c) David Peter and pastel contributors.
// SPDX-License-Identifier: MIT OR Apache-2.0
// JavaScript port of src/helper.rs from sharkdp/pastel v0.12.0.

import { clampF64, formatDisplay, round } from './rustfmt.js';

/**
 * Like `%`, but always positive.
 *
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
export function modPositive(x, y) {
  return ((x % y) + y) % y;
}

/**
 * Trim a number such that it fits into the range [lower, upper]. Follows the
 * Rust `f64::max`/`f64::min` semantics, so a NaN input results in `upper`.
 *
 * @param {number} lower
 * @param {number} upper
 * @param {number} x
 * @returns {number}
 */
export function clamp(lower, upper, x) {
  return clampF64(lower, upper, x);
}

/** A number in the interval [0, 1]. */
export class Fraction {
  /**
   * @param {number} f an already clamped value (use `Fraction.from`)
   */
  constructor(f) {
    this.f = f;
  }

  /**
   * Create a fraction by clamping the given number to [0, 1] (NaN becomes 1).
   *
   * @param {number} s
   * @returns {Fraction}
   */
  static from(s) {
    return new Fraction(clamp(0.0, 1.0, s));
  }

  /**
   * The fraction as a number in [0, 1].
   *
   * @returns {number}
   */
  value() {
    return this.f;
  }
}

/**
 * Linearly interpolate between two values.
 *
 * @param {number} a
 * @param {number} b
 * @param {Fraction} fraction
 * @returns {number}
 */
export function interpolate(a, b, fraction) {
  return a + fraction.value() * (b - a);
}

/**
 * Linearly interpolate between two angles. Always take the shortest path
 * along the circle.
 *
 * @param {number} a
 * @param {number} b
 * @param {Fraction} fraction
 * @returns {number}
 */
export function interpolateAngle(a, b, fraction) {
  const paths = [
    [a, b],
    [a, b + 360.0],
    [a + 360.0, b],
  ];

  const dist = ([x, y]) => Math.abs(x - y);

  // Mirrors `Iterator::min_by` in the original: the first minimum is kept, and
  // an unordered comparison (NaN) counts as `Less`, which also keeps it.
  let shortest = paths[0];
  for (const path of paths.slice(1)) {
    if (dist(shortest) > dist(path)) {
      shortest = path;
    }
  }

  return modPositive(interpolate(shortest[0], shortest[1], fraction), 360.0);
}

/**
 * Formats a number with at most `precision` decimal places, omitting trailing
 * zeroes (web colors generally omit them: `0.5` rather than `0.500`). Note that
 * this will round using omitted decimal places:
 *
 *     MaxPrecision.wrap(3, 0.5004) //=> 0.5
 *     MaxPrecision.wrap(3, 0.5005) //=> 0.501
 */
export class MaxPrecision {
  /**
   * @param {number} precision number of decimal places
   * @param {number} inner the value to format
   */
  constructor(precision, inner) {
    this.precision = precision;
    this.inner = inner;
  }

  /**
   * Wrap a value for formatting with at most `precision` decimal places.
   *
   * @param {number} precision number of decimal places
   * @param {number} inner the value to format
   * @returns {MaxPrecision}
   */
  static wrap(precision, inner) {
    return new MaxPrecision(precision, inner);
  }

  /**
   * The Rust `Display` output: the value rounded half away from zero to
   * `precision` places, printed in the shortest form.
   *
   * @returns {string}
   */
  toString() {
    const pow10 = 10 ** this.precision;
    const rounded = round(this.inner * pow10) / pow10;
    return formatDisplay(rounded);
  }
}
