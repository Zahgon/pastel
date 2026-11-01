// Copyright (c) David Peter and pastel contributors.
// SPDX-License-Identifier: MIT OR Apache-2.0
// JavaScript port of src/distinct.rs from sharkdp/pastel v0.12.0.

import { Color } from './color.js';
import { cie76, ciede2000 } from './delta_e.js';
import { strategies, threadRng } from './random.js';
import { asI32, fmin } from './rustfmt.js';

const SCALAR_MAX = Number.MAX_VALUE;
const USIZE_MAX = 2 ** 64 - 1;
const I32_MAX = 2147483647;
const I32_MIN = -2147483648;

/** What the simulated annealing optimizes: the mean or the minimum nearest-neighbor distance. */
export const OptimizationTarget = Object.freeze({ Mean: 'Mean', Min: 'Min' });

/** How colors are modified: replaced by a random color, or changed slightly. */
export const OptimizationMode = Object.freeze({ Global: 'Global', Local: 'Local' });

/** The color distance used. */
export const DistanceMetric = Object.freeze({ CIE76: 'CIE76', CIEDE2000: 'CIEDE2000' });

/**
 * @typedef {object} SimulationParameters
 * @property {number} initialTemperature
 * @property {number} coolingRate
 * @property {number} numIterations
 * @property {string} optTarget an `OptimizationTarget` value
 * @property {string} optMode an `OptimizationMode` value
 * @property {string} distanceMetric a `DistanceMetric` value
 * @property {number} numFixedColors
 */

/** Nearest-neighbor distances within a set of colors. */
export class DistanceResult {
  /**
   * @param {object} fields
   * @param {number} fields.minClosestDistance the closest distance between any two colors
   * @param {number} fields.meanClosestDistance the average over all nearest-neighbor distances
   * @param {[number, number]} fields.closestPair indices of the colors that were closest to each other
   * @param {Array<[number, number]>} fields.closestDistances the closest distance and the index
   *   of the nearest neighbor, for each color
   * @param {string} fields.distanceMetric a `DistanceMetric` value
   * @param {number} fields.numFixedColors the number of colors that are fixed and cannot be
   *   changed. The actual colors are the first `numFixedColors` elements in the `colors` array.
   */
  constructor({
    minClosestDistance,
    meanClosestDistance,
    closestPair,
    closestDistances,
    distanceMetric,
    numFixedColors,
  }) {
    this.minClosestDistance = minClosestDistance;
    this.meanClosestDistance = meanClosestDistance;
    this.closestPair = closestPair;
    this.closestDistances = closestDistances;
    this.distanceMetric = distanceMetric;
    this.numFixedColors = numFixedColors;
  }

  /**
   * Compute the distances for the given Lab values (`DistanceResult::new`).
   *
   * @param {Array<import('./color.js').Lab>} labValues
   * @param {string} distanceMetric
   * @param {number} numFixedColors
   * @returns {DistanceResult}
   */
  static fromLabValues(labValues, distanceMetric, numFixedColors) {
    const result = new DistanceResult({
      closestDistances: labValues.map(() => [SCALAR_MAX, USIZE_MAX]),
      closestPair: [USIZE_MAX, USIZE_MAX],
      meanClosestDistance: 0.0,
      minClosestDistance: SCALAR_MAX,
      distanceMetric,
      numFixedColors,
    });

    for (let i = 0; i < labValues.length; i += 1) {
      result.updateDistances(labValues, i, false);
    }
    result.updateTotals();

    return result;
  }

  /**
   * @returns {DistanceResult}
   */
  clone() {
    return new DistanceResult({
      minClosestDistance: this.minClosestDistance,
      meanClosestDistance: this.meanClosestDistance,
      closestPair: [this.closestPair[0], this.closestPair[1]],
      closestDistances: this.closestDistances.map(([dist, i]) => [dist, i]),
      distanceMetric: this.distanceMetric,
      numFixedColors: this.numFixedColors,
    });
  }

  /**
   * A new result for the given Lab values, where only `changedColor` differs from the values
   * this result was computed for.
   *
   * @param {Array<import('./color.js').Lab>} labValues
   * @param {number} changedColor
   * @returns {DistanceResult}
   */
  update(labValues, changedColor) {
    const result = this.clone();
    result.updateDistances(labValues, changedColor, true);
    result.updateTotals();
    return result;
  }

  /**
   * @param {Array<import('./color.js').Lab>} labValues
   * @param {number} color
   * @param {boolean} changed
   */
  updateDistances(labValues, color, changed) {
    this.closestDistances[color] = [SCALAR_MAX, USIZE_MAX];

    // we need to recalculate distances for nodes where the previous min dist was with
    // changed_color but it's not anymore (potentially).
    const toRecalc = [];
    const atLab = labValues[color];

    labValues.forEach((l, i) => {
      if (i === color) {
        return;
      }

      const dist = this.distance(l, atLab);

      if (dist < this.closestDistances[i][0]) {
        this.closestDistances[i] = [dist, color];
      } else if (changed && this.closestDistances[i][1] === color) {
        // changed_color was the best before, but unfortunately we cannot say it now for
        // sure because the distance between the two increased. Play it safe and just
        // recalculate its distances.
        toRecalc.push(i);
      }

      if (dist < this.closestDistances[color][0]) {
        this.closestDistances[color] = [dist, i];
      }
    });

    for (const i of toRecalc) {
      this.updateDistances(labValues, i, false);
    }
  }

  updateTotals() {
    this.meanClosestDistance = 0.0;
    this.minClosestDistance = SCALAR_MAX;

    let closestPairSet = false;

    this.closestDistances.forEach(([dist, closestI], i) => {
      if (i < this.numFixedColors && closestI < this.numFixedColors) {
        return;
      }

      this.meanClosestDistance += dist;

      // the closest pair must ignore pairs of fixed colors because we cannot change them. On
      // the other hand we can consider pairs with at least one non fixed color because we
      // can change that.
      if (
        (i >= this.numFixedColors || closestI >= this.numFixedColors) &&
        (dist < this.minClosestDistance || !closestPairSet)
      ) {
        this.closestPair = [i, closestI];
        closestPairSet = true;
      }

      this.minClosestDistance = fmin(this.minClosestDistance, dist);
    });

    this.meanClosestDistance /= this.closestDistances.length - this.numFixedColors;
  }

  /**
   * @param {import('./color.js').Lab} a
   * @param {import('./color.js').Lab} b
   * @returns {number}
   */
  distance(a, b) {
    switch (this.distanceMetric) {
      case DistanceMetric.CIE76:
        return cie76(a, b);
      case DistanceMetric.CIEDE2000:
        return ciede2000(a, b);
      default:
        throw new TypeError(`invalid distance metric: ${this.distanceMetric}`);
    }
  }
}

/** A snapshot of the simulated annealing, passed to the progress callback. */
export class IterationStatistics {
  /**
   * @param {number} iteration
   * @param {number} temperature
   * @param {DistanceResult} distanceResult
   * @param {Color[]} colors
   */
  constructor(iteration, temperature, distanceResult, colors) {
    this.iteration = iteration;
    this.temperature = temperature;
    this.distanceResult = distanceResult;
    this.colors = colors;
  }
}

/** Simulated annealing that maximizes the distances between a set of colors. */
export class SimulatedAnnealing {
  /**
   * @param {Color[]} initialColors
   * @param {SimulationParameters} parameters
   * @param {import('./random.js').Rng} [rng] defaults to the shared default generator
   */
  constructor(initialColors, parameters, rng = threadRng()) {
    this.colors = initialColors.slice();
    this.labValues = initialColors.map((c) => c.toLab());
    this.temperature = parameters.initialTemperature;
    this.parameters = parameters;
    this.rng = rng;
  }

  /**
   * @param {Color[]} initialColors
   * @param {SimulationParameters} parameters
   * @param {import('./random.js').Rng} rng
   * @returns {SimulatedAnnealing}
   */
  static withRng(initialColors, parameters, rng) {
    return new SimulatedAnnealing(initialColors, parameters, rng);
  }

  /**
   * @returns {Color[]}
   */
  getColors() {
    return this.colors.slice();
  }

  /**
   * @param {number} c a u8 channel value
   * @returns {number} the modified channel value
   */
  modifyChannel(c) {
    if (this.rng.nextBool()) {
      return Math.min(255, c + (this.rng.nextU8() % 10));
    }
    return Math.max(0, c - (this.rng.nextU8() % 10));
  }

  /**
   * @param {Color} color
   * @returns {[Color, import('./color.js').Lab]} the modified color and its Lab value
   */
  modifyColorAndLab(color) {
    const strategy = new strategies.UniformRGB();

    switch (this.parameters.optMode) {
      case OptimizationMode.Local: {
        const rgb = color.toRgba();
        const r = this.modifyChannel(rgb.r);
        const g = this.modifyChannel(rgb.g);
        const b = this.modifyChannel(rgb.b);
        color = Color.fromRgb(r, g, b);
        break;
      }
      case OptimizationMode.Global:
        color = strategy.generateWith(this.rng);
        break;
      default:
        throw new TypeError(`invalid optimization mode: ${this.parameters.optMode}`);
    }
    return [color, color.toLab()];
  }

  /**
   * Run the simulation with the current parameters.
   *
   * @param {(statistics: IterationStatistics) => void} callback called every 5000 iterations
   * @returns {DistanceResult}
   */
  run(callback) {
    this.temperature = this.parameters.initialTemperature;

    let result = DistanceResult.fromLabValues(
      this.labValues,
      this.parameters.distanceMetric,
      this.parameters.numFixedColors,
    );

    if (this.parameters.numFixedColors === this.colors.length) {
      return result;
    }

    for (let iter = 0; iter < this.parameters.numIterations; iter += 1) {
      let randomIndex;
      if (this.parameters.optTarget === OptimizationTarget.Mean) {
        randomIndex = this.rng.rangeUsize(this.parameters.numFixedColors, this.colors.length);
      } else if (result.closestPair[0] < this.parameters.numFixedColors) {
        // first check if any of the colors cannot change, if that's the case just return
        // the other color. Note that the closest_pair cannot contain only fixed colors.
        randomIndex = result.closestPair[1];
      } else if (result.closestPair[1] < this.parameters.numFixedColors) {
        randomIndex = result.closestPair[0];
      } else if (this.rng.nextBool()) {
        randomIndex = result.closestPair[0];
      } else {
        randomIndex = result.closestPair[1];
      }

      const newLabValues = this.labValues.slice();

      const [newColors, newLab] = this.modifyColorAndLab(this.colors[randomIndex].clone());
      newLabValues[randomIndex] = newLab;

      const newResult = result.update(newLabValues, randomIndex);

      let score;
      let newScore;
      switch (this.parameters.optTarget) {
        case OptimizationTarget.Mean:
          score = result.meanClosestDistance;
          newScore = newResult.meanClosestDistance;
          break;
        case OptimizationTarget.Min:
          score = result.minClosestDistance;
          newScore = newResult.minClosestDistance;
          break;
        default:
          throw new TypeError(`invalid optimization target: ${this.parameters.optTarget}`);
      }

      if (newScore > score) {
        result = newResult;
        this.colors[randomIndex] = newColors;
        this.labValues = newLabValues;
      } else {
        const bolzmann = Math.exp(-(score - newScore) / this.temperature);
        if (this.rng.nextF64() <= bolzmann) {
          result = newResult;
          this.colors[randomIndex] = newColors;
          this.labValues = newLabValues;
        }
      }

      if (iter % 5_000 === 0) {
        callback(new IterationStatistics(iter, this.temperature, result, this.colors.slice()));
      }

      if (iter % 1_000 === 0) {
        this.temperature *= this.parameters.coolingRate;
      }
    }

    return result;
  }
}

/**
 * Re-arrange the sequence of colors (in place) such that the minimal difference between a
 * given color and any of its predecessors is maximized.
 *
 * Note: this is only a heuristic and will not yield optimal results (especially at the end of
 * the sequence).
 *
 * See: <https://en.wikipedia.org/wiki/Farthest-first_traversal>
 *
 * @param {Color[]} colors
 * @param {string} metric a `DistanceMetric` value
 */
export function rearrangeSequence(colors, metric) {
  const distance = (c1, c2) => {
    switch (metric) {
      case DistanceMetric.CIE76:
        return c1.distanceDeltaECie76(c2);
      case DistanceMetric.CIEDE2000:
        return c1.distanceDeltaECiede2000(c2);
      default:
        throw new TypeError(`invalid distance metric: ${metric}`);
    }
  };

  // vector where the i-th element contains the minimum distance to the colors from 0 to i-1.
  const minDistances = new Array(colors.length).fill(I32_MAX);

  for (let i = 1; i < colors.length; i += 1) {
    let maxI = colors.length;
    let maxD = I32_MIN;

    for (let j = i; j < colors.length; j += 1) {
      minDistances[j] = Math.min(
        minDistances[j],
        asI32(distance(colors[j], colors[i - 1]) * 1000.0),
      );

      if (minDistances[j] > maxD) {
        maxI = j;
        maxD = minDistances[j];
      }
    }

    swap(colors, i, maxI);
    swap(minDistances, i, maxI);
  }
}

/**
 * Rust `slice::swap` (panics on an out-of-bounds index).
 *
 * @param {Array<unknown>} array
 * @param {number} a
 * @param {number} b
 */
function swap(array, a, b) {
  if (a >= array.length || b >= array.length) {
    throw new RangeError('index out of bounds');
  }
  [array[a], array[b]] = [array[b], array[a]];
}

/**
 * Generate `count` visually distinct colors, starting with the given fixed colors, by
 * simulated annealing (first maximizing the mean nearest-neighbor distance with random
 * colors, then the minimum distance with small modifications).
 *
 * @param {number} count the total number of colors (> 1)
 * @param {string} distanceMetric a `DistanceMetric` value
 * @param {Color[]} fixedColors at most `count` colors that are kept unchanged
 * @param {(statistics: IterationStatistics) => void} callback progress callback
 * @returns {[Color[], DistanceResult]}
 */
export function distinctColors(count, distanceMetric, fixedColors, callback) {
  if (!(count > 1)) {
    throw new Error('assertion failed: count > 1');
  }
  if (!(fixedColors.length <= count)) {
    throw new Error('assertion failed: fixed_colors.len() <= count');
  }

  const numFixedColors = fixedColors.length;
  const colors = fixedColors.slice();

  for (let k = numFixedColors; k < count; k += 1) {
    colors.push(new strategies.UniformRGB().generate());
  }

  const annealing = new SimulatedAnnealing(colors, {
    initialTemperature: 3.0,
    coolingRate: 0.95,
    numIterations: 100_000,
    optTarget: OptimizationTarget.Mean,
    optMode: OptimizationMode.Global,
    distanceMetric,
    numFixedColors,
  });

  annealing.run(callback);

  annealing.parameters.initialTemperature = 0.5;
  annealing.parameters.coolingRate = 0.98;
  annealing.parameters.numIterations = 200_000;
  annealing.parameters.optTarget = OptimizationTarget.Min;
  annealing.parameters.optMode = OptimizationMode.Local;

  const result = annealing.run(callback);

  return [annealing.colors, result];
}
