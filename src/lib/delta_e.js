// Copyright (c) David Peter and pastel contributors.
// SPDX-License-Identifier: MIT OR Apache-2.0
// JavaScript port of src/delta_e.rs from sharkdp/pastel v0.12.0.

// The code below is adapted from https://github.com/elliotekj/DeltaE
//
// Original license:
//
// The MIT License (MIT)
//
// Copyright (c) 2017 Elliot Jackson
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

import { powi } from './rustfmt.js';

/**
 * A color in the Lab color space (only `l`, `a` and `b` are used).
 *
 * @typedef {{l: number, a: number, b: number}} LabLike
 */

/**
 * The CIE76 color difference (euclidean distance in the Lab color space).
 *
 * @param {LabLike} c1
 * @param {LabLike} c2
 * @returns {number}
 */
export function cie76(c1, c2) {
  return Math.sqrt(powi(c1.l - c2.l, 2) + powi(c1.a - c2.a, 2) + powi(c1.b - c2.b, 2));
}

/**
 * The CIEDE2000 color difference.
 *
 * @param {LabLike} color1
 * @param {LabLike} color2
 * @returns {number}
 */
export function ciede2000(color1, color2) {
  const ksubL = 1.0;
  const ksubC = 1.0;
  const ksubH = 1.0;

  const deltaLPrime = color2.l - color1.l;

  const lBar = (color1.l + color2.l) / 2.0;

  const c1 = Math.sqrt(powi(color1.a, 2) + powi(color1.b, 2));
  const c2 = Math.sqrt(powi(color2.a, 2) + powi(color2.b, 2));

  const cBar = (c1 + c2) / 2.0;

  const aPrime1 =
    color1.a + (color1.a / 2.0) * (1.0 - Math.sqrt(powi(cBar, 7) / (powi(cBar, 7) + powi(25.0, 7))));
  const aPrime2 =
    color2.a + (color2.a / 2.0) * (1.0 - Math.sqrt(powi(cBar, 7) / (powi(cBar, 7) + powi(25.0, 7))));

  const cPrime1 = Math.sqrt(powi(aPrime1, 2) + powi(color1.b, 2));
  const cPrime2 = Math.sqrt(powi(aPrime2, 2) + powi(color2.b, 2));

  const cBarPrime = (cPrime1 + cPrime2) / 2.0;

  const deltaCPrime = cPrime2 - cPrime1;

  const sSubL = 1.0 + (0.015 * powi(lBar - 50.0, 2)) / Math.sqrt(20.0 + powi(lBar - 50.0, 2));

  const sSubC = 1.0 + 0.045 * cBarPrime;

  const hPrime1 = getHPrimeFn(color1.b, aPrime1);
  const hPrime2 = getHPrimeFn(color2.b, aPrime2);

  const deltaHPrime = getDeltaHPrime(c1, c2, hPrime1, hPrime2);

  const deltaUpcaseHPrime =
    2.0 * Math.sqrt(cPrime1 * cPrime2) * Math.sin(degreesToRadians(deltaHPrime) / 2.0);

  const upcaseHBarPrime = getUpcaseHBarPrime(hPrime1, hPrime2);

  const upcaseT = getUpcaseT(upcaseHBarPrime);

  const sSubUpcaseH = 1.0 + 0.015 * cBarPrime * upcaseT;

  const rSubT = getRSubT(cBarPrime, upcaseHBarPrime);

  const lightness = deltaLPrime / (ksubL * sSubL);

  const chroma = deltaCPrime / (ksubC * sSubC);

  const hue = deltaUpcaseHPrime / (ksubH * sSubUpcaseH);

  return Math.sqrt(powi(lightness, 2) + powi(chroma, 2) + powi(hue, 2) + rSubT * chroma * hue);
}

/**
 * The hue angle h' in degrees, in [0, 360), of the point `(y, x)` (`atan2(x, y)`).
 *
 * @param {number} x the b coordinate
 * @param {number} y the modified a' coordinate
 * @returns {number}
 */
function getHPrimeFn(x, y) {
  if (x === 0.0 && y === 0.0) {
    return 0.0;
  }

  let hueAngle = radiansToDegrees(Math.atan2(x, y));

  if (hueAngle < 0.0) {
    hueAngle += 360.0;
  }

  return hueAngle;
}

/**
 * The hue difference Δh' in degrees, taking the shorter way around the circle.
 *
 * @param {number} c1
 * @param {number} c2
 * @param {number} hPrime1
 * @param {number} hPrime2
 * @returns {number}
 */
function getDeltaHPrime(c1, c2, hPrime1, hPrime2) {
  if (0.0 === c1 || 0.0 === c2) {
    return 0.0;
  }

  if (Math.abs(hPrime1 - hPrime2) <= 180.0) {
    return hPrime2 - hPrime1;
  }

  if (hPrime2 <= hPrime1) {
    return hPrime2 - hPrime1 + 360.0;
  }
  return hPrime2 - hPrime1 - 360.0;
}

/**
 * The mean hue H̄' in degrees.
 *
 * @param {number} hPrime1
 * @param {number} hPrime2
 * @returns {number}
 */
function getUpcaseHBarPrime(hPrime1, hPrime2) {
  if (Math.abs(hPrime1 - hPrime2) > 180.0) {
    return (hPrime1 + hPrime2 + 360.0) / 2.0;
  }

  return (hPrime1 + hPrime2) / 2.0;
}

/**
 * The hue weighting term T.
 *
 * @param {number} upcaseHBarPrime
 * @returns {number}
 */
function getUpcaseT(upcaseHBarPrime) {
  return (
    1.0 -
    0.17 * Math.cos(degreesToRadians(upcaseHBarPrime - 30.0)) +
    0.24 * Math.cos(degreesToRadians(2.0 * upcaseHBarPrime)) +
    0.32 * Math.cos(degreesToRadians(3.0 * upcaseHBarPrime + 6.0)) -
    0.2 * Math.cos(degreesToRadians(4.0 * upcaseHBarPrime - 63.0))
  );
}

/**
 * The rotation term R_T (interaction between chroma and hue differences in the blue region).
 *
 * @param {number} cBarPrime
 * @param {number} upcaseHBarPrime
 * @returns {number}
 */
function getRSubT(cBarPrime, upcaseHBarPrime) {
  return (
    -2.0 *
    Math.sqrt(powi(cBarPrime, 7) / (powi(cBarPrime, 7) + powi(25.0, 7))) *
    Math.sin(degreesToRadians(60.0 * Math.exp(-powi((upcaseHBarPrime - 275.0) / 25.0, 2))))
  );
}

/**
 * @param {number} radians
 * @returns {number} the angle in degrees
 */
function radiansToDegrees(radians) {
  return radians * (180.0 / Math.PI);
}

/**
 * @param {number} degrees
 * @returns {number} the angle in radians
 */
function degreesToRadians(degrees) {
  return degrees * (Math.PI / 180.0);
}
