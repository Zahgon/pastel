// Copyright (c) Individual contributors (clap); ported in sharkdp/pastel.
// SPDX-License-Identifier: MIT
// Reimplements clap_builder 4.5.56 src/parser/features/suggestions.rs (MIT OR Apache-2.0, used here
// under MIT) and the Jaro similarity of strsim 0.11.1 (`generic_jaro` over chars; MIT only) for the
// JavaScript port of sharkdp/pastel v0.12.0.

// `jaro` below is adapted from https://github.com/rapidfuzz/strsim-rs
//
// Original license:
//
// The MIT License (MIT)
//
// Copyright (c) 2015 Danny Guo; ported in sharkdp/pastel
// Copyright (c) 2016 Titus Wormer <tituswormer@gmail.com>; ported in sharkdp/pastel
// Copyright (c) 2018 Akash Kurdekar; ported in sharkdp/pastel
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

/**
 * Jaro similarity of two strings, compared by Unicode scalar values (`strsim::jaro`).
 *
 * @param {string} a
 * @param {string} b
 * @returns {number} between 0 and 1
 */
function jaro(a, b) {
  const as = Array.from(a);
  const bs = Array.from(b);
  const aLen = as.length;
  const bLen = bs.length;
  if (aLen === 0 && bLen === 0) {
    return 1.0;
  }
  if (aLen === 0 || bLen === 0) {
    return 0.0;
  }
  let searchRange = Math.floor(Math.max(aLen, bLen) / 2);
  searchRange = Math.max(searchRange - 1, 0);

  const aFlags = new Array(aLen).fill(false);
  const bFlags = new Array(bLen).fill(false);
  let matches = 0;
  for (let i = 0; i < aLen; i++) {
    const minBound = i > searchRange ? i - searchRange : 0;
    const maxBound = Math.min(bLen, i + searchRange + 1);
    for (let j = 0; j < maxBound; j++) {
      if (minBound <= j && as[i] === bs[j] && !bFlags[j]) {
        aFlags[i] = true;
        bFlags[j] = true;
        matches += 1;
        break;
      }
    }
  }

  let transpositions = 0;
  if (matches !== 0) {
    let bIdx = 0;
    for (let i = 0; i < aLen; i++) {
      if (aFlags[i]) {
        while (bIdx < bLen) {
          const j = bIdx;
          bIdx += 1;
          if (!bFlags[j]) {
            continue;
          }
          if (as[i] !== bs[j]) {
            transpositions += 1;
          }
          break;
        }
      }
    }
  }
  transpositions = Math.floor(transpositions / 2);

  if (matches === 0) {
    return 0.0;
  }
  return (matches / aLen + matches / bLen + (matches - transpositions) / matches) / 3.0;
}

/**
 * All `possibleValues` similar to `v` (Jaro > 0.7), sorted by ascending similarity; among equal
 * scores the later candidate comes later (`did_you_mean`).
 *
 * @param {string} v
 * @param {Iterable<string>} possibleValues
 * @returns {string[]}
 */
export function didYouMean(v, possibleValues) {
  const candidates = [];
  for (const pv of possibleValues) {
    const confidence = jaro(v, pv);
    if (confidence > 0.7) {
      let pos = 0;
      while (pos < candidates.length && !(candidates[pos][0] > confidence)) {
        pos += 1;
      }
      candidates.splice(pos, 0, [confidence, pv]);
    }
  }
  return candidates.map(([, pv]) => pv);
}

/**
 * Suggests a long flag of the command, or else a long flag of a subcommand named later on the
 * command line (`did_you_mean_flag`).
 *
 * @param {string} arg the unknown flag without `--`
 * @param {string[]} remainingArgs the arguments after it
 * @param {string[]} longs the command's long flags
 * @param {import('./command.js').Command[]} subcommands
 * @returns {[string, string | null] | null} the suggested flag and the subcommand that has it
 */
export function didYouMeanFlag(arg, remainingArgs, longs, subcommands) {
  const candidate = didYouMean(arg, longs).pop();
  if (candidate !== undefined) {
    return [candidate, null];
  }
  let best = null;
  for (const subcommand of subcommands) {
    subcommand.buildSelf();
    const subLongs = subcommand.getKeymap().longs();
    const subCandidate = didYouMean(arg, subLongs).pop();
    if (subCandidate === undefined) {
      continue;
    }
    const score = remainingArgs.indexOf(subcommand.getName());
    if (score < 0) {
      continue;
    }
    if (best === null || score < best[0]) {
      best = [score, [subCandidate, subcommand.getName()]];
    }
  }
  return best === null ? null : best[1];
}
