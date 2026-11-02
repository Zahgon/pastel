// Copyright (c) David Peter and pastel contributors.
// SPDX-License-Identifier: MIT OR Apache-2.0
// JavaScript port of the `parse_color` benchmark of sharkdp/pastel v0.12.0.

/**
 * Micro-benchmark of the color parser: `node bench/parse_color.js`.
 *
 * @module bench/parse_color
 */

import { performance } from 'node:perf_hooks';

import { parseColor } from '../src/lib/parser.js';

const BENCHMARKS = [
  ['parse_hex', '#ff0077'],
  ['parse_hex_short', '#f07'],
  ['parse_rgb', 'rgb(255, 125, 0)'],
  ['parse_hsl', 'hsl(280,20%,50%)'],
];

const WARMUP_ITERATIONS = 10_000;
const ITERATIONS = 200_000;

for (const [name, input] of BENCHMARKS) {
  for (let i = 0; i < WARMUP_ITERATIONS; i++) {
    parseColor(input);
  }
  const start = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    parseColor(input);
  }
  const nanosPerIteration = ((performance.now() - start) * 1e6) / ITERATIONS;
  process.stdout.write(`${name.padEnd(16)} ${nanosPerIteration.toFixed(1)} ns/iter\n`);
}
