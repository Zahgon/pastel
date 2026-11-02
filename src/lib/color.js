// Copyright (c) David Peter and pastel contributors.
// SPDX-License-Identifier: MIT OR Apache-2.0
// JavaScript port of src/lib.rs and src/colorspace.rs from sharkdp/pastel v0.12.0.

import * as deltaE from './delta_e.js';
import { clamp, Fraction, interpolate, interpolateAngle, MaxPrecision, modPositive } from './helper.js';
import { pow } from './pow.js';
import { asU8, fmin, formatDisplay, formatFixed, powi, round } from './rustfmt.js';
import { Hue } from './types.js';

// Part of the public API, like `pub use helper::Fraction` in lib.rs.
export { Fraction };

// Illuminant D65 constants used for Lab color space conversions.
const D65_XN = 0.950_470;
const D65_YN = 1.0;
const D65_ZN = 1.088_830;

const DEG2RAD = Math.PI / 180.0;
const RAD2DEG = 180.0 / Math.PI;

/**
 * A color space that colors can be mixed in (the Rust `ColorSpace` trait of
 * src/colorspace.rs): one of the classes `RGBA`, `HSLA`, `HSVA`, `Lab`,
 * `OkLab`, `LCh` and `OkLCh`.
 *
 * @typedef {object} ColorSpace
 * @property {(color: Color) => ColorSpaceValue} fromColor convert a color into the space
 */

/**
 * A value in a `ColorSpace`.
 *
 * @typedef {object} ColorSpaceValue
 * @property {(other: ColorSpaceValue, fraction: Fraction) => ColorSpaceValue} mix interpolate
 *   between this value and `other` (of the same space)
 * @property {() => Color} intoColor convert the value back into a color
 */

/**
 * Output format for the `to*String` methods: with or without spaces after commas.
 */
export const Format = Object.freeze({
  Spaces: 'Spaces',
  NoSpaces: 'NoSpaces',
});

/**
 * A representation of the different kinds of colorblindness. More info
 * [here](https://en.wikipedia.org/wiki/Color_blindness).
 */
export const ColorblindnessType = Object.freeze({
  /** Protanopic people lack red cones */
  Protanopia: 'Protanopia',
  /** Deuteranopic people lack green cones */
  Deuteranopia: 'Deuteranopia',
  /** Tritanopic people lack blue cones */
  Tritanopia: 'Tritanopia',
});

/**
 * Returns the separator used after commas for the given format.
 *
 * @param {string} format a `Format` value
 * @returns {string}
 */
function spaceFor(format) {
  return format === Format.Spaces ? ' ' : '';
}

/**
 * Formats a byte as two lowercase hex digits (`{:02x}`).
 *
 * @param {number} n
 * @returns {string}
 */
function hex2(n) {
  return n.toString(16).padStart(2, '0');
}

/**
 * The optional alpha suffix (`,{space}{alpha}`) used by most string formats.
 *
 * @param {boolean} opaque whether the alpha suffix is omitted
 * @param {number} alpha
 * @param {string} space
 * @returns {string}
 */
function alphaSuffix(opaque, alpha, space) {
  return opaque ? '' : `,${space}${MaxPrecision.wrap(3, alpha).toString()}`;
}

/**
 * The representation of a color.
 *
 * Note:
 * - Colors outside the sRGB gamut (which cannot be displayed on a typical
 *   computer screen) can not be represented by `Color`.
 * - `equals` compares two `Color`s by comparing their (integer) RGB values.
 *   This is different from comparing the HSL values. For example, HSL has many
 *   different representations of black (arbitrary hue and saturation values).
 */
export class Color {
  /**
   * Use the static `from*` constructors instead; this stores already
   * normalized values.
   *
   * @param {Hue} hue
   * @param {number} saturation in [0, 1]
   * @param {number} lightness in [0, 1]
   * @param {number} alpha in [0, 1]
   */
  constructor(hue, saturation, lightness, alpha) {
    this.hue = hue;
    this.saturation = saturation;
    this.lightness = lightness;
    this.alpha = alpha;
  }

  /**
   * Create a `Color` from a hue in degrees and saturation, lightness and alpha
   * values between 0.0 and 1.0 (values outside this range are clamped).
   *
   * @param {number} hue
   * @param {number} saturation
   * @param {number} lightness
   * @param {number} alpha
   * @returns {Color}
   */
  static fromHsla(hue, saturation, lightness, alpha) {
    return colorFromHsla(new HSLA(hue, saturation, lightness, alpha));
  }

  /**
   * Create an opaque `Color` from a hue in degrees and saturation and
   * lightness values between 0.0 and 1.0.
   *
   * @param {number} hue
   * @param {number} saturation
   * @param {number} lightness
   * @returns {Color}
   */
  static fromHsl(hue, saturation, lightness) {
    return colorFromHsla(new HSLA(hue, saturation, lightness, 1.0));
  }

  /**
   * Create a `Color` from a hue in degrees and saturation, value and alpha
   * values between 0.0 and 1.0.
   *
   * @param {number} hue
   * @param {number} saturation
   * @param {number} value
   * @param {number} alpha
   * @returns {Color}
   */
  static fromHsva(hue, saturation, value, alpha) {
    return colorFromHsva(new HSVA(hue, saturation, value, alpha));
  }

  /**
   * Create an opaque `Color` from a hue in degrees and saturation and value
   * values between 0.0 and 1.0.
   *
   * @param {number} hue
   * @param {number} saturation
   * @param {number} value
   * @returns {Color}
   */
  static fromHsv(hue, saturation, value) {
    return colorFromHsva(new HSVA(hue, saturation, value, 1.0));
  }

  /**
   * Create a `Color` from integer RGB values between 0 and 255 and a floating
   * point alpha value between 0.0 and 1.0.
   *
   * @param {number} r integer in 0..=255
   * @param {number} g integer in 0..=255
   * @param {number} b integer in 0..=255
   * @param {number} alpha
   * @returns {Color}
   */
  static fromRgba(r, g, b, alpha) {
    return colorFromRgbaU8(new RGBA(r, g, b, alpha));
  }

  /**
   * Create a `Color` from integer RGB values between 0 and 255.
   *
   * @param {number} r integer in 0..=255
   * @param {number} g integer in 0..=255
   * @param {number} b integer in 0..=255
   * @returns {Color}
   */
  static fromRgb(r, g, b) {
    return colorFromRgbaU8(new RGBA(r, g, b, 1.0));
  }

  /**
   * Create a `Color` from RGB and alpha values between 0.0 and 1.0. Values
   * outside this range will be clamped.
   *
   * @param {number} r
   * @param {number} g
   * @param {number} b
   * @param {number} alpha
   * @returns {Color}
   */
  static fromRgbaFloat(r, g, b, alpha) {
    return colorFromRgbaF64(new RGBA(r, g, b, alpha));
  }

  /**
   * Create a `Color` from RGB values between 0.0 and 1.0. Values outside this
   * range will be clamped.
   *
   * @param {number} r
   * @param {number} g
   * @param {number} b
   * @returns {Color}
   */
  static fromRgbFloat(r, g, b) {
    return colorFromRgbaF64(new RGBA(r, g, b, 1.0));
  }

  /**
   * Create a `Color` from XYZ coordinates in the CIE 1931 color space. Note that
   * a `Color` always represents a color in the sRGB gamut (colors that can be
   * represented on a typical computer screen) while the XYZ color space is
   * bigger. This function will tend to create fully saturated colors at the
   * edge of the sRGB gamut if the coordinates lie outside the sRGB range.
   *
   * See:
   * - <https://en.wikipedia.org/wiki/CIE_1931_color_space>
   * - <https://en.wikipedia.org/wiki/SRGB>
   *
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @param {number} alpha
   * @returns {Color}
   */
  static fromXyz(x, y, z, alpha) {
    return colorFromXyz(new XYZ(x, y, z, alpha));
  }

  /**
   * Create a `Color` from LMS coordinates. This is the matrix inverse of the
   * matrix that appears in `toLms`.
   *
   * @param {number} l
   * @param {number} m
   * @param {number} s
   * @param {number} alpha
   * @returns {Color}
   */
  static fromLms(l, m, s, alpha) {
    return colorFromLms(new LMS(l, m, s, alpha));
  }

  /**
   * Create a `Color` from L, a and b coordinates coordinates in the Lab color
   * space. Note: See documentation for `fromXyz`. The same restrictions apply
   * here.
   *
   * See: <https://en.wikipedia.org/wiki/Lab_color_space>
   *
   * @param {number} l
   * @param {number} a
   * @param {number} b
   * @param {number} alpha
   * @returns {Color}
   */
  static fromLab(l, a, b, alpha) {
    return colorFromLab(new Lab(l, a, b, alpha));
  }

  /**
   * Create a `Color` from L, a and b coordinates coordinates in the OkLab color
   * space. Note: See documentation for `fromXyz`. The same restrictions apply
   * here.
   *
   * See: <https://bottosson.github.io/posts/oklab>
   *
   * @param {number} l
   * @param {number} a
   * @param {number} b
   * @param {number} alpha
   * @returns {Color}
   */
  static fromOklab(l, a, b, alpha) {
    return colorFromOklab(new OkLab(l, a, b, alpha));
  }

  /**
   * Create a `Color` from lightness, chroma and hue coordinates in the CIE LCh
   * color space. This is a cylindrical transform of the Lab color space. Note:
   * See documentation for `fromXyz`. The same restrictions apply here.
   *
   * See: <https://en.wikipedia.org/wiki/Lab_color_space>
   *
   * @param {number} l
   * @param {number} c
   * @param {number} h
   * @param {number} alpha
   * @returns {Color}
   */
  static fromLch(l, c, h, alpha) {
    return colorFromLch(new LCh(l, c, h, alpha));
  }

  /**
   * Create a `Color` from lightness, chroma and hue coordinates in the OkLCh
   * color space. This is a cylindrical transform of the OkLab color space.
   * Note: See documentation for `fromXyz`. The same restrictions apply here.
   *
   * See: <https://bottosson.github.io/posts/oklab>
   *
   * @param {number} l
   * @param {number} c
   * @param {number} h
   * @param {number} alpha
   * @returns {Color}
   */
  static fromOklch(l, c, h, alpha) {
    return colorFromOklch(new OkLCh(l, c, h, alpha));
  }

  /**
   * Create a `Color` from the four colours of the CMYK model: Cyan, Magenta,
   * Yellow and Black. The CMYK colours are subtractive. This means the colours
   * get darker as you blend them together.
   *
   * @param {number} c
   * @param {number} m
   * @param {number} y
   * @param {number} k
   * @returns {Color}
   */
  static fromCmyk(c, m, y, k) {
    return colorFromCmyk(new CMYK(c, m, y, k));
  }

  /**
   * Convert a `Color` to its hue, saturation, lightness and alpha values. The
   * hue is given in degrees, as a number between 0.0 and 360.0. Saturation,
   * lightness and alpha are numbers between 0.0 and 1.0.
   *
   * @returns {HSLA}
   */
  toHsla() {
    return HSLA.fromColor(this);
  }

  /**
   * Format the color as a HSL-representation string
   * (`hsla(123, 50.3%, 80.1%, 0.4)`). If the alpha channel is `1.0`, the
   * simplified `hsl()` format will be used instead.
   *
   * @param {string} format a `Format` value
   * @returns {string}
   */
  toHslString(format) {
    const space = spaceFor(format);
    const opaque = this.alpha === 1.0;
    const aPrefix = opaque ? '' : 'a';
    const a = alphaSuffix(opaque, this.alpha, space);
    const h = formatFixed(this.hue.value(), 0);
    const s = formatFixed(100.0 * this.saturation, 1);
    const l = formatFixed(100.0 * this.lightness, 1);
    return `hsl${aPrefix}(${h},${space}${s}%,${space}${l}%${a})`;
  }

  /**
   * Convert a `Color` to its hue, saturation, value and alpha values. The hue
   * is given in degrees, as a number between 0.0 and 360.0. Saturation, value
   * and alpha are numbers between 0.0 and 1.0.
   *
   * @returns {HSVA}
   */
  toHsva() {
    return HSVA.fromColor(this);
  }

  /**
   * Format the color as a HSV-representation string
   * (`hsva(123, 50.3%, 80.1%, 0.4)`). If the alpha channel is `1.0`, the
   * simplified `hsv()` format will be used instead.
   *
   * @param {string} format a `Format` value
   * @returns {string}
   */
  toHsvString(format) {
    const hsv = HSVA.fromColor(this);
    const space = spaceFor(format);
    const opaque = hsv.alpha === 1.0;
    const aPrefix = opaque ? '' : 'a';
    const a = alphaSuffix(opaque, hsv.alpha, space);
    const h = formatFixed(hsv.h, 0);
    const s = formatFixed(100.0 * hsv.s, 1);
    const v = formatFixed(100.0 * hsv.v, 1);
    return `hsv${aPrefix}(${h},${space}${s}%,${space}${v}%${a})`;
  }

  /**
   * Convert a `Color` to its red, green, blue and alpha values. The RGB values
   * are integers in the range from 0 to 255. The alpha channel is a number
   * between 0.0 and 1.0.
   *
   * @returns {RGBA}
   */
  toRgba() {
    return rgbaU8FromColor(this);
  }

  /**
   * Format the color as a RGB-representation string (`rgba(255, 127, 0, 0.5)`).
   * If the alpha channel is `1.0`, the simplified `rgb()` format will be used
   * instead.
   *
   * @param {string} format a `Format` value
   * @returns {string}
   */
  toRgbString(format) {
    const rgba = rgbaU8FromColor(this);
    const space = spaceFor(format);
    const opaque = this.alpha === 1.0;
    const aPrefix = opaque ? '' : 'a';
    const a = alphaSuffix(opaque, rgba.alpha, space);
    return `rgb${aPrefix}(${rgba.r},${space}${rgba.g},${space}${rgba.b}${a})`;
  }

  /**
   * Convert a `Color` to its cyan, magenta, yellow, and black values. The CMYK
   * values are floats smaller than or equal to 1.0.
   *
   * @returns {CMYK}
   */
  toCmyk() {
    return CMYK.fromColor(this);
  }

  /**
   * Format the color as a CMYK-representation string (`cmyk(0, 50, 100, 100)`).
   *
   * @param {string} format a `Format` value
   * @returns {string}
   */
  toCmykString(format) {
    const cmyk = CMYK.fromColor(this);
    const space = spaceFor(format);
    const c = formatDisplay(round(cmyk.c * 100.0));
    const m = formatDisplay(round(cmyk.m * 100.0));
    const y = formatDisplay(round(cmyk.y * 100.0));
    const k = formatDisplay(round(cmyk.k * 100.0));
    return `cmyk(${c},${space}${m},${space}${y},${space}${k})`;
  }

  /**
   * Format the color as a floating point RGB-representation string
   * (`rgb(1.000, 0.500, 0.000)`). If the alpha channel is `1.0`, the simplified
   * `rgb()` format will be used instead.
   *
   * @param {string} format a `Format` value
   * @returns {string}
   */
  toRgbFloatString(format) {
    const rgba = RGBA.fromColor(this);
    const space = spaceFor(format);
    const opaque = this.alpha === 1.0;
    const aPrefix = opaque ? '' : 'a';
    const a = alphaSuffix(opaque, rgba.alpha, space);
    const r = formatFixed(rgba.r, 3);
    const g = formatFixed(rgba.g, 3);
    const b = formatFixed(rgba.b, 3);
    return `rgb${aPrefix}(${r},${space}${g},${space}${b}${a})`;
  }

  /**
   * Format the color as a RGB-representation string (`#fc0070`). The output
   * will contain 6 hex digits if the alpha channel is `1.0`, or 8 hex digits
   * otherwise.
   *
   * @param {boolean} leadingHash
   * @returns {string}
   */
  toRgbHexString(leadingHash) {
    const rgba = this.toRgba();
    const hash = leadingHash ? '#' : '';
    const alpha = rgba.alpha === 1.0 ? '' : hex2(asU8(round(rgba.alpha * 255.0)));
    return `${hash}${hex2(rgba.r)}${hex2(rgba.g)}${hex2(rgba.b)}${alpha}`;
  }

  /**
   * Convert a `Color` to its red, green, blue and alpha values. All numbers
   * are from the range between 0.0 and 1.0.
   *
   * @returns {RGBA}
   */
  toRgbaFloat() {
    return RGBA.fromColor(this);
  }

  /**
   * Return the color as an integer in RGB representation (`0xRRGGBB`).
   *
   * @returns {number}
   */
  toU32() {
    const rgba = this.toRgba();
    return (rgba.r << 16) + (rgba.g << 8) + rgba.b;
  }

  /**
   * Parse the RGBA representation (`0xAARRGGBB`) of an u32 into a Color.
   *
   * @param {number} n unsigned 32-bit integer
   * @returns {Color}
   */
  static fromU32(n) {
    const a = n >>> 24;
    const r = (n >>> 16) & 0xff;
    const g = (n >>> 8) & 0xff;
    const b = n & 0xff;

    // Mirrors the original, which passes the alpha byte unscaled (`a as f64`):
    // it is clamped, so every non-zero alpha byte means fully opaque.
    return Color.fromRgba(r, g, b, a);
  }

  /**
   * Get XYZ coordinates according to the CIE 1931 color space.
   *
   * See:
   * - <https://en.wikipedia.org/wiki/CIE_1931_color_space>
   * - <https://en.wikipedia.org/wiki/SRGB>
   *
   * @returns {XYZ}
   */
  toXyz() {
    return XYZ.fromColor(this);
  }

  /**
   * Get coordinates according to the LMS color space.
   *
   * See <https://en.wikipedia.org/wiki/LMS_color_space> for info on the color
   * space as well as an algorithm for converting from CIE XYZ.
   *
   * @returns {LMS}
   */
  toLms() {
    return LMS.fromColor(this);
  }

  /**
   * Get L, a and b coordinates according to the Lab color space.
   *
   * See: <https://en.wikipedia.org/wiki/Lab_color_space>
   *
   * @returns {Lab}
   */
  toLab() {
    return Lab.fromColor(this);
  }

  /**
   * Format the color as a Lab-representation string (`Lab(41, 83, -93, 0.5)`).
   * If the alpha channel is `1.0`, it won't be included in the output.
   *
   * @param {string} format a `Format` value
   * @returns {string}
   */
  toLabString(format) {
    const lab = Lab.fromColor(this);
    const space = spaceFor(format);
    const l = formatFixed(lab.l, 0);
    const a = formatFixed(lab.a, 0);
    const b = formatFixed(lab.b, 0);
    const alpha = alphaSuffix(this.alpha === 1.0, this.alpha, space);
    return `Lab(${l},${space}${a},${space}${b}${alpha})`;
  }

  /**
   * Get L, a and b coordinates according to the OkLab color space.
   *
   * See: <https://bottosson.github.io/posts/oklab>
   *
   * @returns {OkLab}
   */
  toOklab() {
    return OkLab.fromColor(this);
  }

  /**
   * Format the color as an OkLab-representation string
   * (`OkLab(0.4, 0.2, -0.1, 0.5)`). If the alpha channel is `1.0`, it won't be
   * included in the output.
   *
   * @param {string} format a `Format` value
   * @returns {string}
   */
  toOklabString(format) {
    const oklab = OkLab.fromColor(this);
    const space = spaceFor(format);
    const l = formatFixed(oklab.l, 4);
    const a = formatFixed(oklab.a, 4);
    const b = formatFixed(oklab.b, 4);
    const alpha = alphaSuffix(this.alpha === 1.0, this.alpha, space);
    return `OkLab(${l},${space}${a},${space}${b}${alpha})`;
  }

  /**
   * Get L, C and h coordinates according to the CIE LCh color space.
   *
   * See: <https://en.wikipedia.org/wiki/Lab_color_space>
   *
   * @returns {LCh}
   */
  toLch() {
    return LCh.fromColor(this);
  }

  /**
   * Format the color as a LCh-representation string (`LCh(0.3, 0.2, 0.1, 0.5)`).
   * If the alpha channel is `1.0`, it won't be included in the output.
   *
   * @param {string} format a `Format` value
   * @returns {string}
   */
  toLchString(format) {
    const lch = LCh.fromColor(this);
    const space = spaceFor(format);
    const l = formatFixed(lch.l, 0);
    const c = formatFixed(lch.c, 0);
    const h = formatFixed(lch.h, 0);
    const alpha = alphaSuffix(this.alpha === 1.0, this.alpha, space);
    return `LCh(${l},${space}${c},${space}${h}${alpha})`;
  }

  /**
   * Get L, C and h coordinates according to the OkLCh color space.
   *
   * See: <https://bottosson.github.io/posts/oklab>
   *
   * @returns {OkLCh}
   */
  toOklch() {
    return OkLCh.fromColor(this);
  }

  /**
   * Format the color as a OkLCh-representation string
   * (`OkLCh(0.4, 0.2, 1.0, 0.5)`). If the alpha channel is `1.0`, it won't be
   * included in the output.
   *
   * @param {string} format a `Format` value
   * @returns {string}
   */
  toOklchString(format) {
    const oklch = OkLCh.fromColor(this);
    const space = spaceFor(format);
    const l = formatFixed(oklch.l, 4);
    const c = formatFixed(oklch.c, 4);
    const h = formatFixed(oklch.h, 4);
    const alpha = alphaSuffix(this.alpha === 1.0, this.alpha, space);
    return `OkLCh(${l},${space}${c},${space}${h}${alpha})`;
  }

  /** Pure black. @returns {Color} */
  static black() {
    return Color.fromHsl(0.0, 0.0, 0.0);
  }

  /** Pure white. @returns {Color} */
  static white() {
    return Color.fromHsl(0.0, 0.0, 1.0);
  }

  /** Red (`#ff0000`). @returns {Color} */
  static red() {
    return Color.fromRgb(255, 0, 0);
  }

  /** Green (`#008000`). @returns {Color} */
  static green() {
    return Color.fromRgb(0, 128, 0);
  }

  /** Blue (`#0000ff`). @returns {Color} */
  static blue() {
    return Color.fromRgb(0, 0, 255);
  }

  /** Yellow (`#ffff00`). @returns {Color} */
  static yellow() {
    return Color.fromRgb(255, 255, 0);
  }

  /** Fuchsia (`#ff00ff`). @returns {Color} */
  static fuchsia() {
    return Color.fromRgb(255, 0, 255);
  }

  /** Aqua (`#00ffff`). @returns {Color} */
  static aqua() {
    return Color.fromRgb(0, 255, 255);
  }

  /** Lime (`#00ff00`). @returns {Color} */
  static lime() {
    return Color.fromRgb(0, 255, 0);
  }

  /** Maroon (`#800000`). @returns {Color} */
  static maroon() {
    return Color.fromRgb(128, 0, 0);
  }

  /** Olive (`#808000`). @returns {Color} */
  static olive() {
    return Color.fromRgb(128, 128, 0);
  }

  /** Navy (`#000080`). @returns {Color} */
  static navy() {
    return Color.fromRgb(0, 0, 128);
  }

  /** Purple (`#800080`). @returns {Color} */
  static purple() {
    return Color.fromRgb(128, 0, 128);
  }

  /** Teal (`#008080`). @returns {Color} */
  static teal() {
    return Color.fromRgb(0, 128, 128);
  }

  /** Silver (`#c0c0c0`). @returns {Color} */
  static silver() {
    return Color.fromRgb(192, 192, 192);
  }

  /** Gray (`#808080`). @returns {Color} */
  static gray() {
    return Color.fromRgb(128, 128, 128);
  }

  /**
   * Create a gray tone from a lightness value (0.0 is black, 1.0 is white).
   *
   * @param {number} lightness
   * @returns {Color}
   */
  static graytone(lightness) {
    return Color.fromHsl(0.0, 0.0, lightness);
  }

  /**
   * Rotate along the "hue" axis.
   *
   * @param {number} delta degrees
   * @returns {Color}
   */
  rotateHue(delta) {
    return Color.fromHsla(this.hue.value() + delta, this.saturation, this.lightness, this.alpha);
  }

  /**
   * Get the complementary color (hue rotated by 180°).
   *
   * @returns {Color}
   */
  complementary() {
    return this.rotateHue(180.0);
  }

  /**
   * Lighten a color by adding a certain amount (number between -1.0 and 1.0)
   * to the lightness channel. If the number is negative, the color is darkened.
   *
   * @param {number} f
   * @returns {Color}
   */
  lighten(f) {
    return Color.fromHsla(this.hue.value(), this.saturation, this.lightness + f, this.alpha);
  }

  /**
   * Darken a color by subtracting a certain amount (number between -1.0 and
   * 1.0) from the lightness channel. If the number is negative, the color is
   * lightened.
   *
   * @param {number} f
   * @returns {Color}
   */
  darken(f) {
    return this.lighten(-f);
  }

  /**
   * Increase the saturation of a color by adding a certain amount (number
   * between -1.0 and 1.0) to the saturation channel. If the number is
   * negative, the color is desaturated.
   *
   * @param {number} f
   * @returns {Color}
   */
  saturate(f) {
    return Color.fromHsla(this.hue.value(), this.saturation + f, this.lightness, this.alpha);
  }

  /**
   * Decrease the saturation of a color by subtracting a certain amount (number
   * between -1.0 and 1.0) from the saturation channel. If the number is
   * negative, the color is saturated.
   *
   * @param {number} f
   * @returns {Color}
   */
  desaturate(f) {
    return this.saturate(-f);
  }

  /**
   * Adjust the long-, medium-, and short-wavelength cone perception of a color
   * to simulate what a colorblind person sees. Since there are multiple kinds
   * of colorblindness, the desired kind must be specified in `cbTy`.
   *
   * @param {string} cbTy a `ColorblindnessType` value
   * @returns {Color}
   */
  simulateColorblindness(cbTy) {
    // Coefficients here are taken from
    // https://ixora.io/projects/colorblindness/color-blindness-simulation-research/
    const lms = this.toLms();
    let { l, m, s } = lms;
    switch (cbTy) {
      case ColorblindnessType.Protanopia:
        l = 1.051_182_94 * m - 0.051_160_99 * s;
        break;
      case ColorblindnessType.Deuteranopia:
        m = 0.951_309_2 * l + 0.048_669_92 * s;
        break;
      case ColorblindnessType.Tritanopia:
        s = -0.867_447_36 * l + 1.867_270_89 * m;
        break;
      default:
        throw new TypeError(`unknown colorblindness type: ${String(cbTy)}`);
    }

    return Color.fromLms(l, m, s, lms.alpha);
  }

  /**
   * Convert a color to a gray tone with the same perceived luminance (see
   * `luminance`).
   *
   * @returns {Color}
   */
  toGray() {
    const hue = this.hue;
    const c = this.toLch();

    // the desaturation step is only needed to correct minor rounding errors.
    const gray = Color.fromLch(c.l, 0.0, 0.0, 1.0).desaturate(1.0);

    // Restore the hue value (does not alter the color, but makes it able to add
    // saturation again)
    gray.hue = hue;

    return gray;
  }

  /**
   * The perceived brightness of the color (A number between 0.0 and 1.0).
   *
   * See: <https://www.w3.org/TR/AERT#color-contrast>
   *
   * @returns {number}
   */
  brightness() {
    const c = this.toRgbaFloat();
    return (299.0 * c.r + 587.0 * c.g + 114.0 * c.b) / 1000.0;
  }

  /**
   * Determine whether a color is perceived as a light color (perceived
   * brightness is larger than 0.5).
   *
   * @returns {boolean}
   */
  isLight() {
    return this.brightness() > 0.5;
  }

  /**
   * The relative brightness of a color (normalized to 0.0 for darkest black
   * and 1.0 for lightest white), according to the WCAG definition.
   *
   * See: <https://www.w3.org/TR/2008/REC-WCAG20-20081211/#relativeluminancedef>
   *
   * @returns {number}
   */
  luminance() {
    const f = (s) => {
      if (s <= 0.03928) {
        return s / 12.92;
      }
      return pow((s + 0.055) / 1.055, 2.4);
    };

    const c = this.toRgbaFloat();
    const r = f(c.r);
    const g = f(c.g);
    const b = f(c.b);

    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  /**
   * Contrast ratio between two colors as defined by the WCAG. The ratio can
   * range from 1.0 to 21.0. Two colors with a contrast ratio of 4.5 or higher
   * can be used as text color and background color and should be well
   * readable.
   *
   * <https://www.w3.org/TR/2008/REC-WCAG20-20081211/#contrast-ratiodef>
   *
   * @param {Color} other
   * @returns {number}
   */
  contrastRatio(other) {
    const lSelf = this.luminance();
    const lOther = other.luminance();

    if (lSelf > lOther) {
      return (lSelf + 0.05) / (lOther + 0.05);
    }
    return (lOther + 0.05) / (lSelf + 0.05);
  }

  /**
   * Return a readable foreground text color (either `black` or `white`) for a
   * given background color.
   *
   * @returns {Color}
   */
  textColor() {
    // This threshold can be easily computed by solving
    //
    //   contrast(L_threshold, L_black) == contrast(L_threshold, L_white)
    //
    // where contrast(.., ..) is the color contrast as defined by the WCAG (see
    // above)
    const THRESHOLD = 0.179;

    if (this.luminance() > THRESHOLD) {
      return Color.black();
    }
    return Color.white();
  }

  /**
   * Compute the perceived 'distance' between two colors according to the
   * CIE76 delta-E standard. A distance below ~2.3 is not noticeable.
   *
   * See: <https://en.wikipedia.org/wiki/Color_difference>
   *
   * @param {Color} other
   * @returns {number}
   */
  distanceDeltaECie76(other) {
    return deltaE.cie76(this.toLab(), other.toLab());
  }

  /**
   * Compute the perceived 'distance' between two colors according to the
   * CIEDE2000 delta-E standard.
   *
   * See: <https://en.wikipedia.org/wiki/Color_difference>
   *
   * @param {Color} other
   * @returns {number}
   */
  distanceDeltaECiede2000(other) {
    return deltaE.ciede2000(this.toLab(), other.toLab());
  }

  /**
   * Mix two colors by linearly interpolating between them in the specified
   * color space. For the angle-like components (hue), the shortest path along
   * the unit circle is chosen.
   *
   * @param {ColorSpace} Space the color space class to mix in (e.g. `Lab`)
   * @param {Color} other
   * @param {Fraction} fraction
   * @returns {Color}
   */
  mix(Space, other, fraction) {
    return Space.fromColor(this).mix(Space.fromColor(other), fraction).intoColor();
  }

  /**
   * Alpha composite two colors, placing the second over the first.
   *
   * @param {Color} source
   * @returns {Color}
   */
  composite(source) {
    const backdrop = this.toRgba();
    const src = source.toRgba();

    // Composite A over B (see https://en.wikipedia.org/wiki/Alpha_compositing)
    //
    //   αo = αa + αb(1 - αa)
    //
    //        Ca * αa + Cb * αb(1 - αa)
    //   Co = -------------------------
    //                   αo
    //
    //       αo:  output alpha
    //   αa, αb:  A/B alpha
    //       Co:  output color
    //   Ca, Cb:  A/B color
    //
    const compositeChannel = (cA, aA, cB, aB, aO) =>
      asU8(Math.floor((cA * aA + cB * aB * (1.0 - aA)) / aO));

    const a = src.alpha + backdrop.alpha * (1.0 - src.alpha);
    const r = compositeChannel(src.r, src.alpha, backdrop.r, backdrop.alpha, a);
    const g = compositeChannel(src.g, src.alpha, backdrop.g, backdrop.alpha, a);
    const b = compositeChannel(src.b, src.alpha, backdrop.b, backdrop.alpha, a);

    return Color.fromRgba(r, g, b, a);
  }

  /**
   * Equality as defined by the Rust `PartialEq` instance: compares the
   * (integer) RGB values and the alpha channel.
   *
   * @param {Color} other
   * @returns {boolean}
   */
  equals(other) {
    return this.toRgba().equals(other.toRgba());
  }

  /**
   * An independent copy of this color.
   *
   * @returns {Color}
   */
  clone() {
    return new Color(this.hue, this.saturation, this.lightness, this.alpha);
  }

  /**
   * By default colors are displayed in HSLA format (Rust `Display`).
   *
   * @returns {string}
   */
  toString() {
    return HSLA.fromColor(this).toString();
  }

  /**
   * The Rust `Debug` representation (`Color::from_rgb(255,0,0)`).
   *
   * @returns {string}
   */
  debugString() {
    return `Color::from_${this.toRgbString(Format.NoSpaces)}`;
  }
}

/**
 * `From<&HSLA> for Color`: clamps saturation, lightness and alpha to [0, 1].
 *
 * @param {HSLA} color
 * @returns {Color}
 */
function colorFromHsla(color) {
  return new Color(
    Hue.from(color.h),
    clamp(0.0, 1.0, color.s),
    clamp(0.0, 1.0, color.l),
    clamp(0.0, 1.0, color.alpha),
  );
}

/**
 * `From<&HSVA> for Color`.
 *
 * @param {HSVA} color
 * @returns {Color}
 */
function colorFromHsva(color) {
  const lightness = color.v * (1.0 - color.s / 2.0);
  const saturation =
    lightness > 0.0 && lightness < 1.0 ? (color.v - lightness) / fmin(lightness, 1.0 - lightness) : 0.0;

  return new Color(
    Hue.from(color.h),
    clamp(0.0, 1.0, saturation),
    clamp(0.0, 1.0, lightness),
    clamp(0.0, 1.0, color.alpha),
  );
}

/**
 * `From<&RGBA<u8>> for Color`. The RGB to HSL conversion algorithm is adapted
 * from <https://en.wikipedia.org/wiki/HSL_and_HSV>.
 *
 * @param {RGBA} color with integer channels in 0..=255
 * @returns {Color}
 */
function colorFromRgbaU8(color) {
  const maxChroma = Math.max(Math.max(color.r, color.g), color.b);
  const minChroma = Math.min(Math.min(color.r, color.g), color.b);

  const chroma = maxChroma - minChroma;
  const chromaS = chroma / 255.0;

  const rS = color.r / 255.0;
  const gS = color.g / 255.0;
  const bS = color.b / 255.0;

  let hueSector;
  if (chroma === 0) {
    hueSector = 0.0;
  } else if (color.r === maxChroma) {
    hueSector = modPositive((gS - bS) / chromaS, 6.0);
  } else if (color.g === maxChroma) {
    hueSector = (bS - rS) / chromaS + 2.0;
  } else {
    hueSector = (rS - gS) / chromaS + 4.0;
  }
  const hue = 60.0 * hueSector;

  const lightness = (maxChroma + minChroma) / (255.0 * 2.0);
  const saturation = chroma === 0 ? 0.0 : chromaS / (1.0 - Math.abs(2.0 * lightness - 1.0));

  return colorFromHsla(new HSLA(hue, saturation, lightness, color.alpha));
}

/**
 * `From<&RGBA<f64>> for Color`: the channels are scaled to 0..=255, clamped,
 * rounded and converted with `as u8`.
 *
 * @param {RGBA} color with floating point channels
 * @returns {Color}
 */
function colorFromRgbaF64(color) {
  const r = asU8(round(clamp(0.0, 255.0, 255.0 * color.r)));
  const g = asU8(round(clamp(0.0, 255.0, 255.0 * color.g)));
  const b = asU8(round(clamp(0.0, 255.0, 255.0 * color.b)));
  return colorFromRgbaU8(new RGBA(r, g, b, color.alpha));
}

/**
 * `From<&XYZ> for Color`: linear sRGB matrix followed by the sRGB gamma curve.
 *
 * @param {XYZ} color
 * @returns {Color}
 */
function colorFromXyz(color) {
  const f = (c) => {
    if (c <= 0.003_130_8) {
      return 12.92 * c;
    }
    return 1.055 * pow(c, 1.0 / 2.4) - 0.055;
  };

  const r = f(3.2406 * color.x - 1.5372 * color.y - 0.4986 * color.z);
  const g = f(-0.9689 * color.x + 1.8758 * color.y + 0.0415 * color.z);
  const b = f(0.0557 * color.x - 0.2040 * color.y + 1.0570 * color.z);

  return colorFromRgbaF64(new RGBA(r, g, b, color.alpha));
}

/**
 * `From<&LMS> for Color`.
 *
 * @param {LMS} color
 * @returns {Color}
 */
function colorFromLms(color) {
  const x = 1.91020 * color.l - 1.112_120 * color.m + 0.201_908 * color.s;
  const y = 0.37095 * color.l + 0.629_054 * color.m + 0.000_000 * color.s;
  const z = 0.00000 * color.l + 0.000_000 * color.m + 1.000_000 * color.s;
  return colorFromXyz(new XYZ(x, y, z, color.alpha));
}

/**
 * `From<&Lab> for Color` (relative to the D65 white point).
 *
 * @param {Lab} color
 * @returns {Color}
 */
function colorFromLab(color) {
  const DELTA = 6.0 / 29.0;

  const finv = (t) => {
    if (t > DELTA) {
      return pow(t, 3.0);
    }
    return 3.0 * DELTA * DELTA * (t - 4.0 / 29.0);
  };

  const l_ = (color.l + 16.0) / 116.0;
  const x = D65_XN * finv(l_ + color.a / 500.0);
  const y = D65_YN * finv(l_);
  const z = D65_ZN * finv(l_ - color.b / 200.0);

  return colorFromXyz(new XYZ(x, y, z, color.alpha));
}

/**
 * `From<&OkLab> for Color`.
 *
 * @param {OkLab} color
 * @returns {Color}
 */
function colorFromOklab(color) {
  const l = powi(1.0 * color.l + 0.39633779 * color.a + 0.21580376 * color.b, 3);
  const m = powi(1.00000001 * color.l + -0.10556134 * color.a + -0.06385417 * color.b, 3);
  const s = powi(1.00000005 * color.l + -0.08948418 * color.a + -1.29148554 * color.b, 3);

  const x = 1.22701385 * l + -0.55779998 * m + 0.28125615 * s;
  const y = -0.04058018 * l + 1.11225687 * m + -0.07167668 * s;
  const z = -0.07638128 * l + -0.42148198 * m + 1.58616322 * s;

  return colorFromXyz(new XYZ(x, y, z, color.alpha));
}

/**
 * `From<&LCh> for Color`: polar to cartesian Lab coordinates.
 *
 * @param {LCh} color
 * @returns {Color}
 */
function colorFromLch(color) {
  const a = color.c * Math.cos(color.h * DEG2RAD);
  const b = color.c * Math.sin(color.h * DEG2RAD);

  return colorFromLab(new Lab(color.l, a, b, color.alpha));
}

/**
 * `From<&OkLCh> for Color`: polar to cartesian OkLab coordinates.
 *
 * @param {OkLCh} color
 * @returns {Color}
 */
function colorFromOklch(color) {
  const a = color.c * Math.cos(color.h * DEG2RAD);
  const b = color.c * Math.sin(color.h * DEG2RAD);

  return colorFromOklab(new OkLab(color.l, a, b, color.alpha));
}

/**
 * `From<&CMYK> for Color`. The formula, including its divisions by 100, is
 * kept exactly as in the original.
 *
 * @param {CMYK} color
 * @returns {Color}
 */
function colorFromCmyk(color) {
  const r = 255.0 * ((1.0 - color.c) / 100.0) * ((1.0 - color.k) / 100.0);
  const g = 255.0 * ((1.0 - color.m) / 100.0) * ((1.0 - color.k) / 100.0);
  const b = 255.0 * ((1.0 - color.y) / 100.0) * ((1.0 - color.k) / 100.0);

  return colorFromRgbaF64(new RGBA(r, g, b, 1.0));
}

/**
 * Red, green, blue and alpha channels. Used both for integer channels
 * (`Color.toRgba`, 0..=255) and floating point channels (`Color.toRgbaFloat`,
 * 0.0..=1.0). As a color space (for `Color.mix`) it uses the floating point
 * representation.
 */
export class RGBA {
  /**
   * @param {number} r
   * @param {number} g
   * @param {number} b
   * @param {number} alpha
   */
  constructor(r, g, b, alpha) {
    this.r = r;
    this.g = g;
    this.b = b;
    this.alpha = alpha;
  }

  /**
   * The floating point RGBA representation of a color.
   *
   * @param {Color} color
   * @returns {RGBA}
   */
  static fromColor(color) {
    const hS = color.hue.value() / 60.0;
    const chr = (1.0 - Math.abs(2.0 * color.lightness - 1.0)) * color.saturation;
    const m = color.lightness - chr / 2.0;
    const x = chr * (1.0 - Math.abs((hS % 2.0) - 1.0));

    let col;
    if (hS < 1.0) {
      col = [chr, x, 0.0];
    } else if (hS >= 1.0 && hS < 2.0) {
      col = [x, chr, 0.0];
    } else if (hS >= 2.0 && hS < 3.0) {
      col = [0.0, chr, x];
    } else if (hS >= 3.0 && hS < 4.0) {
      col = [0.0, x, chr];
    } else if (hS >= 4.0 && hS < 5.0) {
      col = [x, 0.0, chr];
    } else {
      col = [chr, 0.0, x];
    }

    return new RGBA(col[0] + m, col[1] + m, col[2] + m, color.alpha);
  }

  /**
   * Convert floating point channels back into a color (values are clamped).
   *
   * @returns {Color}
   */
  intoColor() {
    return Color.fromRgbaFloat(this.r, this.g, this.b, this.alpha);
  }

  /**
   * Linearly interpolate every channel.
   *
   * @param {RGBA} other
   * @param {Fraction} fraction
   * @returns {RGBA}
   */
  mix(other, fraction) {
    return new RGBA(
      interpolate(this.r, other.r, fraction),
      interpolate(this.g, other.g, fraction),
      interpolate(this.b, other.b, fraction),
      interpolate(this.alpha, other.alpha, fraction),
    );
  }

  /**
   * Channel-wise equality (the derived Rust `PartialEq`).
   *
   * @param {RGBA} other
   * @returns {boolean}
   */
  equals(other) {
    return this.r === other.r && this.g === other.g && this.b === other.b && this.alpha === other.alpha;
  }

  /**
   * The Rust `Display` output, e.g. `rgb(255, 0, 0)`.
   *
   * @returns {string}
   */
  toString() {
    return `rgb(${formatDisplay(this.r)}, ${formatDisplay(this.g)}, ${formatDisplay(this.b)})`;
  }
}

/**
 * `From<&Color> for RGBA<u8>`: the floating point channels scaled to 0..=255,
 * rounded and converted with `as u8`.
 *
 * @param {Color} color
 * @returns {RGBA} integer channels in 0..=255
 */
function rgbaU8FromColor(color) {
  const c = RGBA.fromColor(color);
  const r = asU8(round(255.0 * c.r));
  const g = asU8(round(255.0 * c.g));
  const b = asU8(round(255.0 * c.b));

  return new RGBA(r, g, b, color.alpha);
}

/** Hue, saturation, lightness and alpha. */
export class HSLA {
  /**
   * @param {number} h
   * @param {number} s
   * @param {number} l
   * @param {number} alpha
   */
  constructor(h, s, l, alpha) {
    this.h = h;
    this.s = s;
    this.l = l;
    this.alpha = alpha;
  }

  /**
   * The HSLA representation of a color.
   *
   * @param {Color} color
   * @returns {HSLA}
   */
  static fromColor(color) {
    return new HSLA(color.hue.value(), color.saturation, color.lightness, color.alpha);
  }

  /**
   * Convert back into a color.
   *
   * @returns {Color}
   */
  intoColor() {
    return Color.fromHsla(this.h, this.s, this.l, this.alpha);
  }

  /**
   * Interpolate the channels, the hue along the shorter way around the circle.
   *
   * @param {HSLA} other
   * @param {Fraction} fraction
   * @returns {HSLA}
   */
  mix(other, fraction) {
    // make sure that the hue is preserved when mixing with gray colors
    const selfHue = this.s < 0.0001 ? other.h : this.h;
    const otherHue = other.s < 0.0001 ? this.h : other.h;

    return new HSLA(
      interpolateAngle(selfHue, otherHue, fraction),
      interpolate(this.s, other.s, fraction),
      interpolate(this.l, other.l, fraction),
      interpolate(this.alpha, other.alpha, fraction),
    );
  }

  /**
   * The Rust `Display` output, e.g. `hsl(0, 1, 0.5)`.
   *
   * @returns {string}
   */
  toString() {
    return `hsl(${formatDisplay(this.h)}, ${formatDisplay(this.s)}, ${formatDisplay(this.l)})`;
  }
}

/** Hue, saturation, value and alpha. */
export class HSVA {
  /**
   * @param {number} h
   * @param {number} s
   * @param {number} v
   * @param {number} alpha
   */
  constructor(h, s, v, alpha) {
    this.h = h;
    this.s = s;
    this.v = v;
    this.alpha = alpha;
  }

  /**
   * The HSVA representation of a color.
   *
   * @param {Color} color
   * @returns {HSVA}
   */
  static fromColor(color) {
    const lightness = color.lightness;

    const value = lightness + color.saturation * fmin(lightness, 1.0 - lightness);
    const saturation = value > 0.0 ? 2.0 * (1.0 - lightness / value) : 0.0;

    return new HSVA(color.hue.value(), saturation, value, color.alpha);
  }

  /**
   * Convert back into a color.
   *
   * @returns {Color}
   */
  intoColor() {
    return Color.fromHsva(this.h, this.s, this.v, this.alpha);
  }

  /**
   * Interpolate the channels, the hue along the shorter way around the circle.
   *
   * @param {HSVA} other
   * @param {Fraction} fraction
   * @returns {HSVA}
   */
  mix(other, fraction) {
    // make sure that the hue is preserved when mixing with gray colors
    const selfHue = this.s < 0.0001 ? other.h : this.h;
    const otherHue = other.s < 0.0001 ? this.h : other.h;

    return new HSVA(
      interpolateAngle(selfHue, otherHue, fraction),
      interpolate(this.s, other.s, fraction),
      interpolate(this.v, other.v, fraction),
      interpolate(this.alpha, other.alpha, fraction),
    );
  }

  /**
   * The Rust `Display` output, e.g. `hsv(0, 1, 1)`.
   *
   * @returns {string}
   */
  toString() {
    return `hsv(${formatDisplay(this.h)}, ${formatDisplay(this.s)}, ${formatDisplay(this.v)})`;
  }
}

/** Coordinates in the CIE 1931 XYZ color space. */
export class XYZ {
  /**
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @param {number} alpha
   */
  constructor(x, y, z, alpha) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.alpha = alpha;
  }

  /**
   * The XYZ coordinates of a color (inverse sRGB gamma, then the sRGB matrix).
   *
   * @param {Color} color
   * @returns {XYZ}
   */
  static fromColor(color) {
    const finv = (c_) => {
      if (c_ <= 0.04045) {
        return c_ / 12.92;
      }
      return pow((c_ + 0.055) / 1.055, 2.4);
    };

    const rec = RGBA.fromColor(color);
    const r = finv(rec.r);
    const g = finv(rec.g);
    const b = finv(rec.b);

    const x = 0.4124 * r + 0.3576 * g + 0.1805 * b;
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const z = 0.0193 * r + 0.1192 * g + 0.9505 * b;

    return new XYZ(x, y, z, color.alpha);
  }

  /**
   * The Rust `Display` output, e.g. `XYZ(0.4124, 0.2126, 0.0193)`.
   *
   * @returns {string}
   */
  toString() {
    return `XYZ(${formatDisplay(this.x)}, ${formatDisplay(this.y)}, ${formatDisplay(this.z)})`;
  }
}

/**
 * A color space whose axes correspond to the responsivity spectra of the
 * long-, medium-, and short-wavelength cone cells in the human eye. More info
 * [here](https://en.wikipedia.org/wiki/LMS_color_space).
 */
export class LMS {
  /**
   * @param {number} l
   * @param {number} m
   * @param {number} s
   * @param {number} alpha
   */
  constructor(l, m, s, alpha) {
    this.l = l;
    this.m = m;
    this.s = s;
    this.alpha = alpha;
  }

  /**
   * The LMS coordinates of a color (computed from its XYZ coordinates).
   *
   * @param {Color} color
   * @returns {LMS}
   */
  static fromColor(color) {
    const { x, y, z, alpha } = XYZ.fromColor(color);
    const l = 0.38971 * x + 0.68898 * y - 0.07868 * z;
    const m = -0.22981 * x + 1.18340 * y + 0.04641 * z;
    const s = 0.00000 * x + 0.00000 * y + 1.00000 * z;

    return new LMS(l, m, s, alpha);
  }

  /**
   * The Rust `Display` output, e.g. `LMS(0.3, 0.2, 0.1)`.
   *
   * @returns {string}
   */
  toString() {
    return `LMS(${formatDisplay(this.l)}, ${formatDisplay(this.m)}, ${formatDisplay(this.s)})`;
  }
}

/** Coordinates in the CIE L*a*b* color space. */
export class Lab {
  /**
   * @param {number} l
   * @param {number} a
   * @param {number} b
   * @param {number} alpha
   */
  constructor(l, a, b, alpha) {
    this.l = l;
    this.a = a;
    this.b = b;
    this.alpha = alpha;
  }

  /**
   * The Lab coordinates of a color (relative to the D65 white point).
   *
   * @param {Color} color
   * @returns {Lab}
   */
  static fromColor(color) {
    const rec = XYZ.fromColor(color);

    const cut = pow(6.0 / 29.0, 3.0);
    const f = (t) => {
      if (t > cut) {
        return pow(t, 1.0 / 3.0);
      }
      // `powf(_, 2.0)` is compiled to a plain multiplication.
      return (1.0 / 3.0) * powi(29.0 / 6.0, 2) * t + 4.0 / 29.0;
    };

    const fy = f(rec.y / D65_YN);

    const l = 116.0 * fy - 16.0;
    const a = 500.0 * (f(rec.x / D65_XN) - fy);
    const b = 200.0 * (fy - f(rec.z / D65_ZN));

    return new Lab(l, a, b, color.alpha);
  }

  /**
   * Convert back into a color.
   *
   * @returns {Color}
   */
  intoColor() {
    return Color.fromLab(this.l, this.a, this.b, this.alpha);
  }

  /**
   * Linearly interpolate every coordinate.
   *
   * @param {Lab} other
   * @param {Fraction} fraction
   * @returns {Lab}
   */
  mix(other, fraction) {
    return new Lab(
      interpolate(this.l, other.l, fraction),
      interpolate(this.a, other.a, fraction),
      interpolate(this.b, other.b, fraction),
      interpolate(this.alpha, other.alpha, fraction),
    );
  }

  /**
   * The Rust `Display` output, e.g. `Lab(53, 80, 67)`.
   *
   * @returns {string}
   */
  toString() {
    return `Lab(${formatDisplay(this.l)}, ${formatDisplay(this.a)}, ${formatDisplay(this.b)})`;
  }
}

/** Coordinates in the OkLab color space. */
export class OkLab {
  /**
   * @param {number} l
   * @param {number} a
   * @param {number} b
   * @param {number} alpha
   */
  constructor(l, a, b, alpha) {
    this.l = l;
    this.a = a;
    this.b = b;
    this.alpha = alpha;
  }

  /**
   * The OkLab coordinates of a color.
   *
   * @param {Color} color
   * @returns {OkLab}
   */
  static fromColor(color) {
    const rec = XYZ.fromColor(color);

    // https://bottosson.github.io/posts/oklab/?#converting-from-xyz-to-oklab

    // multiply with M1 and apply non-linearity
    const long = pow(0.8189330101 * rec.x + 0.3618667424 * rec.y + -0.1288597137 * rec.z, 1.0 / 3.0);
    const medium = pow(0.0329845436 * rec.x + 0.9293118715 * rec.y + 0.0361456387 * rec.z, 1.0 / 3.0);
    const short = pow(0.0482003018 * rec.x + 0.2643662691 * rec.y + 0.6338517070 * rec.z, 1.0 / 3.0);

    // multiply with M2
    const l = 0.2104542553 * long + 0.7936177850 * medium + -0.0040720468 * short;
    const a = 1.9779984951 * long + -2.4285922050 * medium + 0.4505937099 * short;
    const b = 0.0259040371 * long + 0.7827717662 * medium + -0.8086757660 * short;

    return new OkLab(l, a, b, rec.alpha);
  }

  /**
   * Convert back into a color.
   *
   * @returns {Color}
   */
  intoColor() {
    return Color.fromOklab(this.l, this.a, this.b, this.alpha);
  }

  /**
   * Linearly interpolate every coordinate.
   *
   * @param {OkLab} other
   * @param {Fraction} fraction
   * @returns {OkLab}
   */
  mix(other, fraction) {
    return new OkLab(
      interpolate(this.l, other.l, fraction),
      interpolate(this.a, other.a, fraction),
      interpolate(this.b, other.b, fraction),
      interpolate(this.alpha, other.alpha, fraction),
    );
  }

  /**
   * The Rust `Display` output, e.g. `OkLab(0.6, 0.2, 0.1)`.
   *
   * @returns {string}
   */
  toString() {
    return `OkLab(${formatDisplay(this.l)}, ${formatDisplay(this.a)}, ${formatDisplay(this.b)})`;
  }
}

/** Lightness, chroma and hue in the CIE LCh color space (cylindrical Lab). */
export class LCh {
  /**
   * @param {number} l
   * @param {number} c
   * @param {number} h
   * @param {number} alpha
   */
  constructor(l, c, h, alpha) {
    this.l = l;
    this.c = c;
    this.h = h;
    this.alpha = alpha;
  }

  /**
   * The LCh coordinates of a color (Lab in polar form, hue in degrees).
   *
   * @param {Color} color
   * @returns {LCh}
   */
  static fromColor(color) {
    const { l, a, b, alpha } = Lab.fromColor(color);

    const c = Math.sqrt(a * a + b * b);
    const h = modPositive(Math.atan2(b, a) * RAD2DEG, 360.0);

    return new LCh(l, c, h, alpha);
  }

  /**
   * Convert back into a color.
   *
   * @returns {Color}
   */
  intoColor() {
    return Color.fromLch(this.l, this.c, this.h, this.alpha);
  }

  /**
   * Interpolate the coordinates, the hue along the shorter way around the circle.
   *
   * @param {LCh} other
   * @param {Fraction} fraction
   * @returns {LCh}
   */
  mix(other, fraction) {
    // make sure that the hue is preserved when mixing with gray colors
    const selfHue = this.c < 0.1 ? other.h : this.h;
    const otherHue = other.c < 0.1 ? this.h : other.h;

    return new LCh(
      interpolate(this.l, other.l, fraction),
      interpolate(this.c, other.c, fraction),
      interpolateAngle(selfHue, otherHue, fraction),
      interpolate(this.alpha, other.alpha, fraction),
    );
  }

  /**
   * The Rust `Display` output, e.g. `LCh(53, 105, 40)`.
   *
   * @returns {string}
   */
  toString() {
    return `LCh(${formatDisplay(this.l)}, ${formatDisplay(this.c)}, ${formatDisplay(this.h)})`;
  }
}

/** Lightness, chroma and hue in the OkLCh color space (cylindrical OkLab). */
export class OkLCh {
  /**
   * @param {number} l
   * @param {number} c
   * @param {number} h
   * @param {number} alpha
   */
  constructor(l, c, h, alpha) {
    this.l = l;
    this.c = c;
    this.h = h;
    this.alpha = alpha;
  }

  /**
   * The OkLCh coordinates of a color (OkLab in polar form, hue in degrees).
   *
   * @param {Color} color
   * @returns {OkLCh}
   */
  static fromColor(color) {
    const { l, a, b, alpha } = OkLab.fromColor(color);

    const c = Math.sqrt(a * a + b * b);
    const h = modPositive(Math.atan2(b, a) * RAD2DEG, 360.0);

    return new OkLCh(l, c, h, alpha);
  }

  /**
   * Convert back into a color.
   *
   * @returns {Color}
   */
  intoColor() {
    return Color.fromOklch(this.l, this.c, this.h, this.alpha);
  }

  /**
   * Interpolate the coordinates, the hue along the shorter way around the circle.
   *
   * @param {OkLCh} other
   * @param {Fraction} fraction
   * @returns {OkLCh}
   */
  mix(other, fraction) {
    // make sure that the hue is preserved when mixing with gray colors
    const selfHue = this.c < 0.0003 ? other.h : this.h;
    const otherHue = other.c < 0.0003 ? this.h : other.h;

    return new OkLCh(
      interpolate(this.l, other.l, fraction),
      interpolate(this.c, other.c, fraction),
      interpolateAngle(selfHue, otherHue, fraction),
      interpolate(this.alpha, other.alpha, fraction),
    );
  }

  /**
   * The Rust `Display` output, e.g. `OkLCh(0.6, 0.2, 29)`.
   *
   * @returns {string}
   */
  toString() {
    return `OkLCh(${formatDisplay(this.l)}, ${formatDisplay(this.c)}, ${formatDisplay(this.h)})`;
  }
}

/** Cyan, magenta, yellow and black (key) values. */
export class CMYK {
  /**
   * @param {number} c
   * @param {number} m
   * @param {number} y
   * @param {number} k
   */
  constructor(c, m, y, k) {
    this.c = c;
    this.m = m;
    this.y = y;
    this.k = k;
  }

  /**
   * The CMYK values of a color. For black, the undefined (NaN) components are
   * set to 0, as in the original.
   *
   * @param {Color} color
   * @returns {CMYK}
   */
  static fromColor(color) {
    const rgba = rgbaU8FromColor(color);
    const r = rgba.r / 255.0;
    const g = rgba.g / 255.0;
    const b = rgba.b / 255.0;
    let biggest;
    if (r >= g && r >= b) {
      biggest = r;
    } else if (g >= r && g >= b) {
      biggest = g;
    } else {
      biggest = b;
    }
    const outK = 1.0 - biggest;
    const outC = (1.0 - r - outK) / biggest;
    const outM = (1.0 - g - outK) / biggest;
    const outY = (1.0 - b - outK) / biggest;

    return new CMYK(
      Number.isNaN(outC) ? 0.0 : outC,
      Number.isNaN(outM) ? 0.0 : outM,
      Number.isNaN(outY) ? 0.0 : outY,
      outK,
    );
  }

  /**
   * The Rust `Display` output, e.g. `cmyk(0, 1, 1, 0)`.
   *
   * @returns {string}
   */
  toString() {
    return `cmyk(${formatDisplay(this.c)}, ${formatDisplay(this.m)}, ${formatDisplay(this.y)}, ${formatDisplay(this.k)})`;
  }
}

/**
 * The representation of a color stop for a `ColorScale`. The position defines
 * where the color is placed from left (0.0) to right (1.0).
 */
class ColorStop {
  /**
   * @param {Color} color
   * @param {Fraction} position
   */
  constructor(color, position) {
    this.color = color;
    this.position = position;
  }
}

/**
 * The representation of a color scale. The first stop (position 0.0) defines
 * the left end color. The last stop (position 1.0) defines the right end
 * color.
 */
export class ColorScale {
  /** Use `ColorScale.empty()`. */
  constructor() {
    /** @type {ColorStop[]} */
    this.colorStops = [];
  }

  /**
   * Create an empty `ColorScale`.
   *
   * @returns {ColorScale}
   */
  static empty() {
    return new ColorScale();
  }

  /**
   * Add a `Color` at the given position (a stop at the same position is
   * replaced).
   *
   * @param {Color} color
   * @param {Fraction} position
   * @returns {ColorScale} this
   */
  addStop(color, position) {
    const samePosition = this.colorStops.find((c) => position.value() === c.position.value());

    if (samePosition !== undefined) {
      samePosition.color = color;
    } else {
      const nextIndex = this.colorStops.findIndex((c) => position.value() < c.position.value());

      const index = nextIndex === -1 ? this.colorStops.length : nextIndex;

      this.colorStops.splice(index, 0, new ColorStop(color, position));
    }

    return this;
  }

  /**
   * Get the color at the given position using the mixing function.
   *
   * Note:
   * - No color is returned if position isn't between two color stops or the
   *   `ColorScale` is empty.
   *
   * @param {Fraction} position
   * @param {function(Color, Color, Fraction): Color} mix
   * @returns {Color | null}
   */
  sample(position, mix) {
    if (this.colorStops.length < 2) {
      return null;
    }

    const leftStop = this.colorStops.findLast((c) => position.value() >= c.position.value());

    const rightStop = this.colorStops.find((c) => position.value() <= c.position.value());

    if (leftStop !== undefined && rightStop !== undefined) {
      const diffColorStops = rightStop.position.value() - leftStop.position.value();
      const diffPosition = position.value() - leftStop.position.value();
      const localPosition = Fraction.from(diffPosition / diffColorStops);

      return mix(leftStop.color, rightStop.color, localPosition);
    }
    return null;
  }
}
