// Copyright (c) David Peter and pastel contributors.
// SPDX-License-Identifier: MIT OR Apache-2.0
// JavaScript port of src/cli/commands/distinct.rs from sharkdp/pastel v0.12.0.

import { ansiStyle } from '../../lib/ansi.js';
import { Color, HSLA } from '../../lib/color.js';
import { DistanceMetric, distinctColors, rearrangeSequence } from '../../lib/distinct.js';
import { Fraction } from '../../lib/helper.js';
import { formatFixed, parseUsize } from '../../lib/rustfmt.js';
import { ignoreWriteError, Panic, PastelError } from '../error.js';
import { environmentBrush, STDERR } from '../output.js';
import { ColorArgIterator, PrintSpectrum } from './io.js';

/**
 * Formats one line of the optimization progress.
 * @param {import('../../lib/ansi.js').Brush} brush
 * @param {import('../../lib/distinct.js').IterationStatistics} stats
 * @returns {string}
 */
function formatIteration(brush, stats) {
  const result = stats.distanceResult;
  return (
    `[${String(stats.iteration).padStart(10)}] ` +
    `D_mean = ${formatFixed(result.meanClosestDistance, 2).padEnd(6)}; ` +
    `D_min = ${formatFixed(result.minClosestDistance, 2).padEnd(6)}; ` +
    `T = ${formatFixed(stats.temperature, 6)} ` +
    formatColors(brush, stats.colors, result.closestPair)
  );
}

/**
 * Formats the colors as hex codes on their own background, highlighting the closest pair.
 * @param {import('../../lib/ansi.js').Brush} brush
 * @param {Color[]} colors
 * @param {[number, number] | null} closestPair
 * @returns {string}
 */
function formatColors(brush, colors, closestPair) {
  let text = '';
  for (const [ci, c] of colors.entries()) {
    const tc = c.textColor();
    const style = ansiStyle(tc);
    style.on(c);

    if (closestPair !== null && (closestPair[0] === ci || closestPair[1] === ci)) {
      style.bold(true);
      style.underline(true);
    }

    text += `${brush.paint(c.toRgbHexString(false), style)} `;
  }
  return `${text}\n`;
}

/**
 * Color scale used for the distance matrix.
 * @param {number} f
 * @returns {Color}
 */
function blueRedYellow(f) {
  const blue = Color.fromRgb(0, 0, 120);
  const red = Color.fromRgb(224, 0, 119);
  const yellow = Color.fromRgb(255, 255, 0);

  if (f < 0.5) {
    return blue.mix(HSLA, red, Fraction.from(2.0 * f));
  }
  return red.mix(HSLA, yellow, Fraction.from(2.0 * (f - 0.5)));
}

/**
 * Prints the matrix of mutual color distances to stderr.
 * @param {import('../../lib/ansi.js').Brush} brush
 * @param {Color[]} colors
 * @param {string} metric
 */
function printDistanceMatrix(brush, colors, metric) {
  const count = colors.length;

  const distance = (c1, c2) =>
    metric === DistanceMetric.CIE76 ? c1.distanceDeltaECie76(c2) : c1.distanceDeltaECiede2000(c2);

  let min = Number.MAX_VALUE;
  let max = 0.0;
  for (let i = 0; i < count; i++) {
    for (let j = 0; j < count; j++) {
      if (i !== j) {
        const dist = distance(colors[i], colors[j]);
        if (dist < min) {
          min = dist;
        }
        if (dist > max) {
          max = dist;
        }
      }
    }
  }

  const colorToString = (c) => {
    const tc = c.textColor();
    const style = ansiStyle(tc);
    style.on(c);
    return brush.paint(c.toRgbHexString(false), style);
  };

  // Stderr is unbuffered and `write!` writes every piece on its own (`{:6}` even the padding
  // character by character), which decides how much of the matrix fits into a non-blocking pipe.
  const writeBlank = () => {
    for (let k = 0; k < 6; k++) {
      STDERR.write(' ');
    }
  };

  STDERR.write('\n\n');
  writeBlank();
  STDERR.write('  ');
  for (const c of colors) {
    STDERR.write(colorToString(c));
    STDERR.write(' ');
  }
  STDERR.write('\n\n');

  for (const c1 of colors) {
    STDERR.write(colorToString(c1));
    STDERR.write('  ');
    for (const c2 of colors) {
      if (c1.equals(c2)) {
        writeBlank();
        STDERR.write(' ');
      } else {
        const dist = distance(c1, c2);

        let magnitude = (dist - min) / (max - min);
        magnitude = 1.0 - magnitude ** 0.3;

        const bg = blueRedYellow(magnitude);
        const style = ansiStyle(bg.textColor());
        style.on(bg);

        STDERR.write(brush.paint(formatFixed(dist, 2).padStart(6), style));
        STDERR.write(' ');
      }
    }
    STDERR.write('\n');
  }
  STDERR.write('\n\n');
}

/** `pastel distinct`: generates a set of visually distinct colors. */
export class DistinctCommand {
  /**
   * @param {import('../output.js').Output} out
   * @param {object} matches
   * @param {import('../config.js').Config} config
   */
  run(out, matches, config) {
    const brushStderr = environmentBrush(2, config.env);
    const verboseOutput = matches.getFlag('verbose');

    const countArg = matches.getOne('number');
    const count = parseUsize(countArg);
    if (count === null) {
      throw PastelError.couldNotParseNumber(countArg);
    }

    if (count < 2) {
      throw PastelError.distinctColorCountMustBeLargerThanOne();
    }

    let distanceMetric;
    switch (matches.getOne('metric')) {
      case 'CIE76':
        distanceMetric = DistanceMetric.CIE76;
        break;
      case 'CIEDE2000':
        distanceMetric = DistanceMetric.CIEDE2000;
        break;
      default:
        throw new Panic(
          'internal error: entered unreachable code: Unknown distance metric',
          'src/cli/commands/distinct.rs:152:18',
        );
    }

    const positionals = matches.getMany('color');
    const fixedColors =
      positionals === undefined || positionals === null
        ? []
        : [...ColorArgIterator.fromPositionalArguments(config, positionals, PrintSpectrum.Yes)];

    const numFixedColors = fixedColors.length;
    if (numFixedColors > count) {
      throw PastelError.distinctColorFixedColorsCannotBeMoreThanCount();
    }

    const callback = verboseOutput
      ? (stats) => ignoreWriteError(() => STDERR.write(formatIteration(brushStderr, stats)))
      : () => {};

    const [colors, distanceResult] = distinctColors(count, distanceMetric, fixedColors, callback);

    if (matches.getFlag('print-minimal-distance')) {
      out.handle.write(`${formatFixed(distanceResult.minClosestDistance, 3)}\n`);
    } else {
      rearrangeSequence(colors, distanceMetric);

      if (verboseOutput) {
        printDistanceMatrix(brushStderr, colors, distanceMetric);
      }

      for (const color of colors) {
        out.showColor(config, color);
      }
    }
  }
}
