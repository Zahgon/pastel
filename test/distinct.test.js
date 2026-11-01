// Copyright (c) David Peter and pastel contributors.
// SPDX-License-Identifier: MIT OR Apache-2.0
// JavaScript port of the tests in src/distinct.rs from sharkdp/pastel v0.12.0.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Color } from '../src/lib/color.js';
import {
  DistanceMetric,
  OptimizationMode,
  OptimizationTarget,
  rearrangeSequence,
  SimulatedAnnealing,
} from '../src/lib/distinct.js';
import { Rng } from '../src/lib/random.js';

const MASK64 = (1n << 64n) - 1n;

/**
 * `u64::rotate_left`.
 *
 * @param {bigint} x
 * @param {bigint} k
 * @returns {bigint}
 */
const rotateLeft = (x, k) => ((x << k) | (x >> (64n - k))) & MASK64;

/** `rand_xoshiro::SplitMix64` (rand_xoshiro 0.7), used to seed `Xoshiro256StarStar`. */
class SplitMix64 {
  /**
   * `SeedableRng::seed_from_u64`.
   *
   * @param {number | bigint} seed
   */
  constructor(seed) {
    this.x = BigInt.asUintN(64, BigInt(seed));
  }

  /**
   * @returns {bigint}
   */
  nextU64() {
    this.x = (this.x + 0x9e3779b97f4a7c15n) & MASK64;
    let z = this.x;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK64;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK64;
    return z ^ (z >> 31n);
  }
}

/** `rand_xoshiro::Xoshiro256StarStar` (rand_xoshiro 0.7) with the rand 0.9 sampling methods. */
class Xoshiro256StarStar extends Rng {
  /**
   * @param {bigint[]} state the four state words
   */
  constructor(state) {
    super();
    this.s = state.slice();
  }

  /**
   * `SeedableRng::seed_from_u64`: `from_rng(SplitMix64::seed_from_u64(seed))`, i.e. the 32 seed
   * bytes are four little-endian `next_u64` outputs, read back as the four state words.
   *
   * @param {number | bigint} seed
   * @returns {Xoshiro256StarStar}
   */
  static seedFromU64(seed) {
    const rng = new SplitMix64(seed);
    return new Xoshiro256StarStar([rng.nextU64(), rng.nextU64(), rng.nextU64(), rng.nextU64()]);
  }

  /**
   * @returns {bigint}
   */
  nextU64() {
    const s = this.s;
    const result = (rotateLeft((s[1] * 5n) & MASK64, 7n) * 9n) & MASK64;
    const t = (s[1] << 17n) & MASK64;

    s[2] ^= s[0];
    s[3] ^= s[1];
    s[1] ^= s[2];
    s[0] ^= s[3];

    s[2] ^= t;

    s[3] = rotateLeft(s[3], 45n);

    return result;
  }

  /**
   * The upper 32 bits of `next_u64` (the lowest bits have linear dependencies).
   *
   * @returns {number}
   */
  nextU32() {
    return Number(this.nextU64() >> 32n);
  }
}

/**
 * Rust `assert_eq!` for vectors of colors.
 *
 * @param {Color[]} actual
 * @param {Color[]} expected
 */
function assertColorsEq(actual, expected) {
  const same = actual.length === expected.length && actual.every((c, i) => c.equals(expected[i]));
  if (!same) {
    const show = (colors) => `[${colors.map((c) => c.debugString()).join(', ')}]`;
    throw new assert.AssertionError({
      message: `expected ${show(expected)}, got ${show(actual)}`,
      actual,
      expected,
      operator: '==',
    });
  }
}

test('test_rearrange_sequence', () => {
  const colors = [
    Color.white(),
    Color.graytone(0.25),
    Color.graytone(0.5),
    Color.graytone(0.8),
    Color.black(),
  ];

  rearrangeSequence(colors, DistanceMetric.CIE76);

  assertColorsEq(colors, [
    Color.white(),
    Color.black(),
    Color.graytone(0.5),
    Color.graytone(0.25),
    Color.graytone(0.8),
  ]);
});

test('test_distinct_all_fixed_colors', () => {
  const colors = [Color.red(), Color.olive(), Color.yellow()];

  const sim = SimulatedAnnealing.withRng(
    colors,
    {
      initialTemperature: 3.0,
      coolingRate: 0.95,
      numIterations: 100,
      optTarget: OptimizationTarget.Min,
      optMode: OptimizationMode.Local,
      distanceMetric: DistanceMetric.CIE76,
      numFixedColors: 3,
    },
    Xoshiro256StarStar.seedFromU64(21),
  );
  sim.run(() => {});

  assertColorsEq(sim.getColors(), [Color.red(), Color.olive(), Color.yellow()]);
});

test('test_distinct_2_fixed_colors', () => {
  const colors = [Color.red(), Color.yellow()];

  const sim = SimulatedAnnealing.withRng(
    colors,
    {
      initialTemperature: 3.0,
      coolingRate: 0.95,
      numIterations: 100,
      optTarget: OptimizationTarget.Min,
      optMode: OptimizationMode.Local,
      distanceMetric: DistanceMetric.CIE76,
      numFixedColors: 1,
    },
    Xoshiro256StarStar.seedFromU64(42),
  );
  sim.run(() => {});

  assertColorsEq([sim.getColors()[0]], [Color.red()]);
});
