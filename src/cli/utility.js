// Copyright (c) David Peter and pastel contributors.
// SPDX-License-Identifier: MIT OR Apache-2.0
// JavaScript port of src/cli/utility.rs from sharkdp/pastel v0.12.0.
// Also contains the counterparts of the Rust slice/`Vec` methods `sort_by_key` and `dedup_by`
// that the commands rely on.

import { NAMED_COLORS } from '../lib/named.js';
import { asI32 } from '../lib/rustfmt.js';

/**
 * Rust's `sort_by_key` / `sort_by_cached_key` on a slice with an integer key: a stable sort in
 * ascending key order. The key function is evaluated once per element.
 * @template T
 * @param {readonly T[]} items
 * @param {(item: T) => number} key
 * @returns {T[]} a new sorted array
 */
export function sortByKey(items, key) {
  return items
    .map((item, index) => ({ item, index, key: key(item) }))
    .sort((a, b) => a.key - b.key || a.index - b.index)
    .map((entry) => entry.item);
}

/**
 * Rust's `Vec::dedup_by`: removes consecutive elements that are in the same bucket as the
 * previously retained element, keeping the first one of every run.
 * @template T
 * @param {readonly T[]} items
 * @param {(current: T, previous: T) => boolean} sameBucket
 * @returns {T[]} a new array
 */
export function dedupBy(items, sameBucket) {
  const result = [];
  for (const item of items) {
    if (result.length > 0 && sameBucket(item, result[result.length - 1])) {
      continue;
    }
    result.push(item);
  }
  return result;
}

/**
 * Returns a list of named colors, sorted by the perceived distance to the given color.
 * @param {import('../lib/color.js').Color} color
 * @returns {{name: string, color: import('../lib/color.js').Color}[]}
 */
export function similarColors(color) {
  const colors = sortByKey(NAMED_COLORS, (nc) => asI32(1000.0 * nc.color.distanceDeltaECiede2000(color)));
  return dedupBy(colors, (n1, n2) => n1.color.equals(n2.color));
}
