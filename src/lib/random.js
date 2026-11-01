// Copyright (c) David Peter and pastel contributors.
// SPDX-License-Identifier: MIT OR Apache-2.0
// JavaScript port of src/random.rs from sharkdp/pastel v0.12.0.

import { Buffer } from 'node:buffer';
import { randomFillSync } from 'node:crypto';

import { Color } from './color.js';

const TWO_POW_32 = 0x1_0000_0000;

/**
 * A random number generator with the sampling methods of `rand::Rng` (rand 0.9) that pastel
 * uses. Subclasses implement `nextU32()` (a number in 0..2^32) and `nextU64()` (a BigInt in
 * 0..2^64), like `rand::RngCore`.
 */
export class Rng {
  /**
   * Abstract: the next random `u32`.
   *
   * @returns {number} integer in 0..2^32
   */
  nextU32() {
    throw new Error('Rng.nextU32 must be implemented by a subclass');
  }

  /**
   * Abstract: the next random `u64`.
   *
   * @returns {bigint} integer in 0..2^64
   */
  nextU64() {
    throw new Error('Rng.nextU64 must be implemented by a subclass');
  }

  /**
   * `rng.random::<u8>()`: the low byte of a `u32`.
   *
   * @returns {number} integer in 0..=255
   */
  nextU8() {
    return this.nextU32() & 0xff;
  }

  /**
   * `rng.random::<f64>()`: the 53 most significant bits of a `u64`, scaled to [0, 1).
   *
   * @returns {number}
   */
  nextF64() {
    return Number(this.nextU64() >> 11n) * (1.0 / 2 ** 53);
  }

  /**
   * `rng.random::<bool>()`: the most significant bit of a `u32`.
   *
   * @returns {boolean}
   */
  nextBool() {
    return (this.nextU32() | 0) < 0;
  }

  /**
   * `rng.random_range(low..high)` for `usize` with `high <= u32::MAX`: Canon's method on
   * `u32` samples, as in `UniformInt::<u32>::sample_single_inclusive`.
   *
   * @param {number} low
   * @param {number} high exclusive upper bound
   * @returns {number} integer in low..high
   */
  rangeUsize(low, high) {
    if (!(low < high)) {
      throw new RangeError('cannot sample empty range');
    }
    if (high > TWO_POW_32 - 1) {
      throw new RangeError('ranges above u32::MAX are not supported');
    }
    const range = high - low;

    // generate a sample using a sensible integer type
    let [result, loOrder] = wideningMulU32(this.nextU32(), range);

    // if the sample is biased...
    if (loOrder > TWO_POW_32 - range) {
      // ...generate a new sample to reduce bias...
      const [newHiOrder] = wideningMulU32(this.nextU32(), range);
      // ... incrementing result on overflow
      if (loOrder + newHiOrder >= TWO_POW_32) {
        result += 1;
      }
    }

    return low + result;
  }
}

/**
 * The full 64-bit product of two `u32` values, as `[high word, low word]`.
 *
 * @param {number} a
 * @param {number} b
 * @returns {[number, number]}
 */
function wideningMulU32(a, b) {
  const product = BigInt(a) * BigInt(b);
  return [Number(product >> 32n), Number(product & 0xffff_ffffn)];
}

const BUFFER_SIZE = 4096;

/**
 * The default generator (`rand::rng()`), backed by the operating system's cryptographically
 * secure random number generator.
 */
export class ThreadRng extends Rng {
  #buffer = Buffer.alloc(BUFFER_SIZE);
  #offset = BUFFER_SIZE;

  /**
   * Reserve `n` random bytes, refilling the buffer when it is used up.
   *
   * @param {number} n
   * @returns {number} the offset of the reserved bytes in the buffer
   */
  #take(n) {
    if (this.#offset + n > BUFFER_SIZE) {
      randomFillSync(this.#buffer);
      this.#offset = 0;
    }
    const offset = this.#offset;
    this.#offset += n;
    return offset;
  }

  /**
   * @returns {number} a random integer in 0..2^32
   */
  nextU32() {
    return this.#buffer.readUInt32LE(this.#take(4));
  }

  /**
   * @returns {bigint} a random integer in 0..2^64
   */
  nextU64() {
    return this.#buffer.readBigUInt64LE(this.#take(8));
  }
}

/** Holds the shared default generator, created on first use. */
const threadRngCache = { rng: null };

/**
 * The lazily created, shared default generator (`rand::rng()`).
 *
 * @returns {ThreadRng}
 */
export function threadRng() {
  if (threadRngCache.rng === null) {
    threadRngCache.rng = new ThreadRng();
  }
  return threadRngCache.rng;
}

/** A way to generate random colors (`RandomizationStrategy`). */
export class RandomizationStrategy {
  /**
   * Generate a color with the default generator.
   *
   * @returns {Color}
   */
  generate() {
    return this.generateWith(threadRng());
  }

  /**
   * Abstract: generate a color with the given generator.
   *
   * @param {Rng} _rng
   * @returns {Color}
   */
  generateWith(_rng) {
    throw new Error('RandomizationStrategy.generateWith must be implemented by a subclass');
  }
}

/** Random colors with a medium saturation and lightness. */
class Vivid extends RandomizationStrategy {
  /**
   * @param {Rng} rng
   * @returns {Color}
   */
  generateWith(rng) {
    const hue = rng.nextF64() * 360.0;
    const saturation = 0.2 + 0.6 * rng.nextF64();
    const lightness = 0.3 + 0.4 * rng.nextF64();

    return Color.fromHsl(hue, saturation, lightness);
  }
}

/** Uniformly distributed RGB colors. */
class UniformRGB extends RandomizationStrategy {
  /**
   * @param {Rng} rng
   * @returns {Color}
   */
  generateWith(rng) {
    return Color.fromRgb(rng.nextU8(), rng.nextU8(), rng.nextU8());
  }
}

/** Uniformly distributed gray tones. */
class UniformGray extends RandomizationStrategy {
  /**
   * @param {Rng} rng
   * @returns {Color}
   */
  generateWith(rng) {
    return Color.graytone(rng.nextF64());
  }
}

/** Colors with fixed LCh lightness and chroma and a uniformly distributed hue. */
class UniformHueLCh extends RandomizationStrategy {
  /**
   * @param {Rng} rng
   * @returns {Color}
   */
  generateWith(rng) {
    return Color.fromLch(70.0, 35.0, 360.0 * rng.nextF64(), 1.0);
  }
}

/** The randomization strategies (`random::strategies`). */
export const strategies = Object.freeze({ Vivid, UniformRGB, UniformGray, UniformHueLCh });
