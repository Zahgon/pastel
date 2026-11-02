// Copyright (c) Individual contributors (clap); ported in sharkdp/pastel.
// SPDX-License-Identifier: MIT OR Apache-2.0
// Reimplements clap_builder 4.5.56 src/mkeymap.rs for the JavaScript port of sharkdp/pastel
// v0.12.0.

/**
 * The arguments of a command plus a lookup table by short flag, long flag and position.
 */
export class MKeyMap {
  constructor() {
    /** @type {import('./arg.js').Arg[]} */
    this.args = [];
    /** @type {Array<{type: 'Short'|'Long'|'Position', value: string|number, index: number}>} */
    this.keys = [];
  }

  /** @returns {MKeyMap} a deep copy (keys are rebuilt by {@link MKeyMap#build}) */
  clone() {
    const copy = new MKeyMap();
    copy.args = this.args.map((a) => a.clone());
    copy.keys = this.keys.map((k) => ({ ...k }));
    return copy;
  }

  /**
   * @param {import('./arg.js').Arg} arg
   */
  push(arg) {
    this.args.push(arg);
  }

  /** Builds the lookup keys (`MKeyMap::_build`). */
  build() {
    this.args.forEach((arg, index) => {
      if (arg.getIndex() !== null) {
        this.keys.push({ type: 'Position', value: arg.getIndex(), index });
      } else {
        if (arg.getShort() !== null) {
          this.keys.push({ type: 'Short', value: arg.getShort(), index });
        }
        if (arg.getLong() !== null) {
          this.keys.push({ type: 'Long', value: arg.getLong(), index });
        }
      }
    });
  }

  find(type, value) {
    const key = this.keys.find((k) => k.type === type && k.value === value);
    return key === undefined ? null : this.args[key.index];
  }

  /**
   * @param {string} c
   * @returns {import('./arg.js').Arg | null}
   */
  getShort(c) {
    return this.find('Short', c);
  }

  /**
   * @param {string} l
   * @returns {import('./arg.js').Arg | null}
   */
  getLong(l) {
    return this.find('Long', l);
  }

  /**
   * @param {number} n
   * @returns {import('./arg.js').Arg | null}
   */
  getPosition(n) {
    return this.find('Position', n);
  }

  /** @returns {string[]} all long flags in key order */
  longs() {
    return this.keys.filter((k) => k.type === 'Long').map((k) => k.value);
  }
}
