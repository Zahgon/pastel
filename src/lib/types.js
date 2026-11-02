// Copyright (c) David Peter and pastel contributors.
// SPDX-License-Identifier: MIT OR Apache-2.0
// JavaScript port of src/types.rs from sharkdp/pastel v0.12.0.

import { modPositive } from './helper.js';

/** The hue of a color, represented by an angle (degrees). */
export class Hue {
  /**
   * @param {number} unclipped angle in degrees (any value)
   */
  constructor(unclipped) {
    this.unclipped = unclipped;
  }

  /**
   * Create a hue from an angle in degrees; the angle is normalized lazily by `value`.
   *
   * @param {number} unclipped angle in degrees (any value)
   * @returns {Hue}
   */
  static from(unclipped) {
    return new Hue(unclipped);
  }

  /**
   * Return a hue value in the interval [0, 360].
   *
   * @returns {number}
   */
  value() {
    // As in the original, exactly 360 is kept (so `rotate 360 red` prints a hue of 360).
    if (this.unclipped === 360.0) {
      return this.unclipped;
    }
    return modPositive(this.unclipped, 360.0);
  }
}
