// Copyright (c) David Peter and pastel contributors.
// SPDX-License-Identifier: MIT OR Apache-2.0
// JavaScript port of the tests in src/lib.rs (`mod tests`) from sharkdp/pastel v0.12.0.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Color, ColorScale, Format, Fraction, HSLA, Lab, RGBA } from '../src/lib/color.js';
import { parseColor } from '../src/lib/parser.js';
import { round } from '../src/lib/rustfmt.js';
import { assertColorEq, assertF64Eq, assertRelativeEq } from './helpers.js';

/**
 * Rust `assert_ne!` for colors.
 *
 * @param {Color} actual
 * @param {Color} expected
 */
function assertColorNe(actual, expected) {
  if (actual.equals(expected)) {
    throw new assert.AssertionError({
      message: `expected ${actual.debugString()} != ${expected.debugString()}`,
      actual,
      expected,
      operator: '!=',
    });
  }
}

/**
 * @param {Color} c1
 * @param {Color} c2
 */
function assertAlmostEqual(c1, c2) {
  const a = c1.toRgba();
  const b = c2.toRgba();

  assert.ok(Math.abs(a.r - b.r) <= 1, `r: ${c1.debugString()} vs ${c2.debugString()}`);
  assert.ok(Math.abs(a.g - b.g) <= 1, `g: ${c1.debugString()} vs ${c2.debugString()}`);
  assert.ok(Math.abs(a.b - b.b) <= 1, `b: ${c1.debugString()} vs ${c2.debugString()}`);
}

/** `Color::mix::<Lab>` as a mixing function. */
const labMix = (c1, c2, fraction) => c1.mix(Lab, c2, fraction);

test('color_partial_eq', () => {
  assertColorEq(Color.fromHsl(120.0, 0.3, 0.5), Color.fromHsl(360.0 + 120.0, 0.3, 0.5));
  assertColorEq(Color.fromRgba(1, 2, 3, 0.3), Color.fromRgba(1, 2, 3, 0.3));
  assertColorEq(Color.fromHsl(123.0, 0.3, 0.0), Color.black());
  assertColorEq(Color.fromHsl(123.0, 0.3, 1.0), Color.white());

  assertColorNe(Color.fromHsl(120.0, 0.3, 0.5), Color.fromHsl(122.0, 0.3, 0.5));
  assertColorNe(Color.fromHsl(120.0, 0.3, 0.5), Color.fromHsl(120.0, 0.32, 0.5));
  assertColorNe(Color.fromHsl(120.0, 0.3, 0.5), Color.fromHsl(120.0, 0.3, 0.52));
  assertColorNe(Color.fromHsla(120.0, 0.3, 0.5, 0.9), Color.fromHsla(120.0, 0.3, 0.5, 0.901));
  assertColorNe(Color.fromRgba(1, 2, 3, 0.3), Color.fromRgba(2, 2, 3, 0.3));
  assertColorNe(Color.fromRgba(1, 2, 3, 0.3), Color.fromRgba(1, 3, 3, 0.3));
  assertColorNe(Color.fromRgba(1, 2, 3, 0.3), Color.fromRgba(1, 2, 4, 0.3));
});

test('rgb_to_hsl_conversion', () => {
  assertColorEq(Color.fromRgbFloat(1.0, 1.0, 1.0), Color.white());
  assertColorEq(Color.fromRgbFloat(0.5, 0.5, 0.5), Color.gray());
  assertColorEq(Color.fromRgbFloat(0.0, 0.0, 0.0), Color.black());
  assertColorEq(Color.fromRgbFloat(1.0, 0.0, 0.0), Color.red());
  // yellow-green
  assertColorEq(Color.fromRgbFloat(0.75, 0.75, 0.0), Color.fromHsl(60.0, 1.0, 0.375));
  assertColorEq(Color.fromRgbFloat(0.0, 0.5, 0.0), Color.green());
  // blue-ish
  assertColorEq(Color.fromRgbFloat(0.5, 0.5, 1.0), Color.fromHsl(240.0, 1.0, 0.75));
  // yellow
  assertColorEq(Color.fromRgbFloat(0.941, 0.785, 0.053), Color.fromHsl(49.5, 0.893, 0.497));
  // cyan 2
  assertColorEq(Color.fromRgbFloat(0.099, 0.795, 0.591), Color.fromHsl(162.4, 0.779, 0.447));
});

test('rgb_roundtrip_conversion', () => {
  const roundtrip = (h, s, l) => {
    const color1 = Color.fromHsl(h, s, l);
    const rgb = color1.toRgba();
    const color2 = Color.fromRgb(rgb.r, rgb.g, rgb.b);
    assertColorEq(color2, color1);
  };

  roundtrip(0.0, 0.0, 1.0);
  roundtrip(0.0, 0.0, 0.5);
  roundtrip(0.0, 0.0, 0.0);
  roundtrip(60.0, 1.0, 0.375);
  roundtrip(120.0, 1.0, 0.25);
  roundtrip(240.0, 1.0, 0.75);
  roundtrip(49.5, 0.893, 0.497);
  roundtrip(162.4, 0.779, 0.447);

  for (let degree = 0; degree < 360; degree += 1) {
    roundtrip(degree, 0.5, 0.8);
  }
});

test('to_u32', () => {
  assert.equal(Color.black().toU32(), 0);
  assert.equal(Color.red().toU32(), 0xff0000);
  assert.equal(Color.white().toU32(), 0xffffff);
  assert.equal(Color.fromRgb(0xf4, 0x23, 0x0f).toU32(), 0xf4230f);
});

test('hsva_conversion', () => {
  assertColorEq(Color.fromHsva(0.0, 1.0, 1.0, 0.5), Color.fromHsla(0.0, 1.0, 0.5, 0.5));

  const roundtrip = (h, s, l) => {
    const color1 = Color.fromHsl(h, s, l);
    const hsva1 = color1.toHsva();
    const color2 = Color.fromHsva(hsva1.h, hsva1.s, hsva1.v, hsva1.alpha);
    assertAlmostEqual(color1, color2);
  };

  for (let hue = 0; hue < 360; hue += 1) {
    roundtrip(hue, 0.2, 0.8);
  }
});

test('xyz_conversion', () => {
  assertColorEq(Color.fromXyz(0.9505, 1.0, 1.089, 1.0), Color.white());
  assertColorEq(Color.fromXyz(0.4123, 0.2126, 0.01933, 1.0), Color.red());
  assertColorEq(
    Color.fromXyz(0.13123, 0.15372, 0.13174, 1.0),
    Color.fromHsl(109.999, 0.08654, 0.407843),
  );

  const roundtrip = (h, s, l) => {
    const color1 = Color.fromHsl(h, s, l);
    const xyz1 = color1.toXyz();
    const color2 = Color.fromXyz(xyz1.x, xyz1.y, xyz1.z, 1.0);
    assertAlmostEqual(color1, color2);
  };

  for (let hue = 0; hue < 360; hue += 1) {
    roundtrip(hue, 0.2, 0.8);
  }
});

test('lms_conversion', () => {
  const roundtrip = (h, s, l) => {
    const color1 = Color.fromHsl(h, s, l);
    const lms1 = color1.toLms();
    const color2 = Color.fromLms(lms1.l, lms1.m, lms1.s, 1.0);
    assertAlmostEqual(color1, color2);
  };

  for (let hue = 0; hue < 360; hue += 1) {
    roundtrip(hue, 0.2, 0.8);
  }
});

test('lab_conversion', () => {
  assertColorEq(Color.fromLab(53.233, 80.109, 67.22, 1.0), Color.red());

  const roundtrip = (h, s, l) => {
    const color1 = Color.fromHsl(h, s, l);
    const lab1 = color1.toLab();
    const color2 = Color.fromLab(lab1.l, lab1.a, lab1.b, 1.0);
    assertAlmostEqual(color1, color2);
  };

  for (let hue = 0; hue < 360; hue += 1) {
    roundtrip(hue, 0.2, 0.8);
  }
});

test('oklab_conversion', () => {
  assertColorEq(Color.fromOklab(0.51976, -0.14032, 0.10763, 1.0), Color.green());

  const roundtrip = (h, s, l) => {
    const color1 = Color.fromHsl(h, s, l);
    const oklab1 = color1.toOklab();
    const color2 = Color.fromOklab(oklab1.l, oklab1.a, oklab1.b, 1.0);
    assertAlmostEqual(color1, color2);
  };

  for (let hue = 0; hue < 360; hue += 1) {
    roundtrip(hue, 0.2, 0.8);
  }
});

test('lch_conversion', () => {
  assertColorEq(Color.fromLch(24.829, 60.093, 38.18, 1.0), Color.fromHsl(0.0, 1.0, 0.245));

  const roundtrip = (h, s, l) => {
    const color1 = Color.fromHsl(h, s, l);
    const lch1 = color1.toLch();
    const color2 = Color.fromLch(lch1.l, lch1.c, lch1.h, 1.0);
    assertAlmostEqual(color1, color2);
  };

  for (let hue = 0; hue < 360; hue += 1) {
    roundtrip(hue, 0.2, 0.8);
  }
});

test('oklch_conversion', () => {
  assertColorEq(Color.fromOklch(0.5, 0.205, 29.23, 1.0), Color.fromHsl(0.0, 1.0, 0.369));
  assertColorEq(Color.fromOklch(0.452, 0.3132, 264.1, 1.0), Color.blue());

  const roundtrip = (h, s, l) => {
    const color1 = Color.fromHsl(h, s, l);
    const oklch1 = color1.toOklch();
    const color2 = Color.fromOklch(oklch1.l, oklch1.c, oklch1.h, 1.0);
    assertAlmostEqual(color1, color2);
  };

  for (let hue = 0; hue < 360; hue += 1) {
    roundtrip(hue, 0.2, 0.8);
  }
});

test('rotate_hue', () => {
  assertColorEq(Color.red().rotateHue(120.0), Color.lime());
});

test('complementary', () => {
  assertColorEq(Color.lime().complementary(), Color.fuchsia());
  assertColorEq(Color.fuchsia().complementary(), Color.lime());
});

test('lighten', () => {
  assertColorEq(Color.fromHsl(90.0, 0.5, 0.3).lighten(0.4), Color.fromHsl(90.0, 0.5, 0.7));
  assertColorEq(Color.fromHsl(90.0, 0.5, 0.3).lighten(0.8), Color.fromHsl(90.0, 0.5, 1.0));
});

test('to_gray', () => {
  const salmon = Color.fromRgb(250, 128, 114);
  assertF64Eq(salmon.toGray().toHsla().s, 0.0);
  assertRelativeEq(salmon.toGray().luminance(), salmon.luminance(), 0.01);

  assertColorEq(Color.graytone(0.3).toGray(), Color.graytone(0.3));
});

test('brightness', () => {
  assertF64Eq(Color.black().brightness(), 0.0);
  assertF64Eq(Color.white().brightness(), 1.0);
  assertF64Eq(Color.graytone(0.5).brightness(), 0.5);
});

test('luminance', () => {
  assertF64Eq(Color.white().luminance(), 1.0);
  const hotpink = Color.fromRgb(255, 105, 180);
  assertRelativeEq(hotpink.luminance(), 0.347, 0.01);
  assertF64Eq(Color.black().luminance(), 0.0);
});

test('contrast_ratio', () => {
  assertRelativeEq(Color.black().contrastRatio(Color.white()), 21.0);
  assertRelativeEq(Color.white().contrastRatio(Color.black()), 21.0);

  assertRelativeEq(Color.white().contrastRatio(Color.white()), 1.0);
  assertRelativeEq(Color.red().contrastRatio(Color.red()), 1.0);

  assertRelativeEq(
    Color.fromRgb(255, 119, 153).contrastRatio(Color.fromRgb(0, 68, 85)),
    4.26,
    0.01,
  );
});

test('text_color', () => {
  assertColorEq(Color.graytone(0.4).textColor(), Color.white());
  assertColorEq(Color.graytone(0.6).textColor(), Color.black());
});

test('distance_delta_e_cie76', () => {
  const c = Color.fromRgb(255, 127, 14);
  assertF64Eq(c.distanceDeltaECie76(c), 0.0);

  const c1 = Color.fromRgb(50, 100, 200);
  const c2 = Color.fromRgb(200, 10, 0);
  assertF64Eq(round(c1.distanceDeltaECie76(c2)), 123.0);
});

test('to_hsl_string', () => {
  const c = Color.fromHsl(91.3, 0.541, 0.983);
  assert.equal(c.toHslString(Format.Spaces), 'hsl(91, 54.1%, 98.3%)');
});

test('to_rgb_string', () => {
  const c = Color.fromRgb(255, 127, 4);
  assert.equal(c.toRgbString(Format.Spaces), 'rgb(255, 127, 4)');
});

test('to_rgb_float_string', () => {
  assert.equal(Color.black().toRgbFloatString(Format.Spaces), 'rgb(0.000, 0.000, 0.000)');

  assert.equal(Color.white().toRgbFloatString(Format.Spaces), 'rgb(1.000, 1.000, 1.000)');

  // some minor rounding errors here, but that is to be expected:
  const c = Color.fromRgbFloat(0.12, 0.45, 0.78);
  assert.equal(c.toRgbFloatString(Format.Spaces), 'rgb(0.122, 0.451, 0.780)');
});

test('to_rgb_hex_string', () => {
  const c = Color.fromRgb(255, 127, 4);
  assert.equal(c.toRgbHexString(false), 'ff7f04');
  assert.equal(c.toRgbHexString(true), '#ff7f04');
});

test('to_lab_string', () => {
  const c = Color.fromLab(41.0, 83.0, -93.0, 1.0);
  assert.equal(c.toLabString(Format.Spaces), 'Lab(41, 83, -93)');
});

test('to_oklab_string', () => {
  const c = Color.fromOklab(0.52, -0.14, 0.108, 1.0);
  assert.equal(c.toOklabString(Format.Spaces), 'OkLab(0.5201, -0.1398, 0.1077)');
});

test('to_lch_string', () => {
  const c = Color.fromLch(52.0, 44.0, 271.0, 1.0);
  assert.equal(c.toLchString(Format.Spaces), 'LCh(52, 44, 271)');
});

test('mix', () => {
  assertColorEq(Color.red().mix(RGBA, Color.blue(), Fraction.from(0.5)), Color.purple());
  assertColorEq(Color.red().mix(HSLA, Color.blue(), Fraction.from(0.5)), Color.fuchsia());
});

test('mixing_with_gray_preserves_hue', () => {
  const hue = 123.0;

  const input = Color.fromHsla(hue, 0.5, 0.5, 1.0);

  const hueAfterMixing = (other) => input.mix(HSLA, other, Fraction.from(0.5)).toHsla().h;

  assertF64Eq(hueAfterMixing(Color.black()), hue);
  assertF64Eq(hueAfterMixing(Color.graytone(0.2)), hue);
  assertF64Eq(hueAfterMixing(Color.graytone(0.7)), hue);
  assertF64Eq(hueAfterMixing(Color.white()), hue);
});

test('color_scale_add_preserves_ordering', () => {
  const colorScale = ColorScale.empty();

  colorScale
    .addStop(Color.red(), Fraction.from(0.5))
    .addStop(Color.gray(), Fraction.from(0.0))
    .addStop(Color.blue(), Fraction.from(1.0));

  assertColorEq(colorScale.colorStops[0].color, Color.gray());
  assertColorEq(colorScale.colorStops[1].color, Color.red());
  assertColorEq(colorScale.colorStops[2].color, Color.blue());
});

test('color_scale_empty_sample_none', () => {
  const mix = labMix;

  const colorScale = ColorScale.empty();

  const color = colorScale.sample(Fraction.from(0.0), mix);

  assert.equal(color, null);
});

test('color_scale_one_color_sample_none', () => {
  const mix = labMix;

  const colorScale = ColorScale.empty();

  colorScale.addStop(Color.red(), Fraction.from(0.0));

  const color = colorScale.sample(Fraction.from(0.0), mix);

  assert.equal(color, null);
});

test('color_scale_sample_same_position', () => {
  const mix = labMix;

  const colorScale = ColorScale.empty();

  colorScale
    .addStop(Color.red(), Fraction.from(0.0))
    .addStop(Color.green(), Fraction.from(1.0))
    .addStop(Color.blue(), Fraction.from(0.0))
    .addStop(Color.white(), Fraction.from(1.0));

  const sampleBlue = colorScale.sample(Fraction.from(0.0), mix);
  const sampleWhite = colorScale.sample(Fraction.from(1.0), mix);
  assert.notEqual(sampleBlue, null);
  assert.notEqual(sampleWhite, null);

  assertColorEq(sampleBlue, Color.blue());
  assertColorEq(sampleWhite, Color.white());
});

test('color_scale_sample', () => {
  const mix = labMix;

  const colorScale = ColorScale.empty();

  colorScale.addStop(Color.green(), Fraction.from(1.0)).addStop(Color.red(), Fraction.from(0.0));

  const sampleRedGreen = colorScale.sample(Fraction.from(0.5), mix);
  assert.notEqual(sampleRedGreen, null);

  const mixRedGreen = mix(Color.red(), Color.green(), Fraction.from(0.5));

  assertColorEq(sampleRedGreen, mixRedGreen);
});

test('color_scale_sample_position', () => {
  const mix = labMix;

  const colorScale = ColorScale.empty();

  colorScale
    .addStop(Color.green(), Fraction.from(0.5))
    .addStop(Color.red(), Fraction.from(0.0))
    .addStop(Color.blue(), Fraction.from(1.0));

  const sampleRed = colorScale.sample(Fraction.from(0.0), mix);
  const sampleGreen = colorScale.sample(Fraction.from(0.5), mix);
  const sampleBlue = colorScale.sample(Fraction.from(1.0), mix);

  const sampleRedGreen = colorScale.sample(Fraction.from(0.25), mix);
  const sampleGreenBlue = colorScale.sample(Fraction.from(0.75), mix);

  for (const sample of [sampleRed, sampleGreen, sampleBlue, sampleRedGreen, sampleGreenBlue]) {
    assert.notEqual(sample, null);
  }

  const mixRedGreen = mix(Color.red(), Color.green(), Fraction.from(0.5));
  const mixGreenBlue = mix(Color.green(), Color.blue(), Fraction.from(0.5));

  assertColorEq(sampleRed, Color.red());
  assertColorEq(sampleGreen, Color.green());
  assertColorEq(sampleBlue, Color.blue());

  assertColorEq(sampleRedGreen, mixRedGreen);
  assertColorEq(sampleGreenBlue, mixGreenBlue);
});

test('to_cmyk_string', () => {
  const white = Color.fromRgb(255, 255, 255);
  assert.equal(white.toCmykString(Format.Spaces), 'cmyk(0, 0, 0, 0)');

  const black = Color.fromRgb(0, 0, 0);
  assert.equal(black.toCmykString(Format.Spaces), 'cmyk(0, 0, 0, 100)');

  const c = Color.fromRgb(19, 19, 1);
  assert.equal(c.toCmykString(Format.Spaces), 'cmyk(0, 0, 95, 93)');

  const c1 = Color.fromRgb(55, 55, 55);
  assert.equal(c1.toCmykString(Format.Spaces), 'cmyk(0, 0, 0, 78)');

  const c2 = Color.fromRgb(136, 117, 78);
  assert.equal(c2.toCmykString(Format.Spaces), 'cmyk(0, 14, 43, 47)');

  const c3 = Color.fromRgb(143, 111, 76);
  assert.equal(c3.toCmykString(Format.Spaces), 'cmyk(0, 22, 47, 44)');
});

test('alpha_roundtrip_hex_to_decimal', () => {
  // We use a max of 3 decimal places when displaying RGB floating point
  // alpha values. This test insures that is sufficient to "roundtrip"
  // from hex (0 < n < 255) to float (0 < n < 1) and back again,
  // e.g. hex `80` is float `0.502`, which parses to hex `80`, and so on.
  for (let alphaInt = 0; alphaInt < 255; alphaInt += 1) {
    const hexString = `#000000${alphaInt.toString(16).padStart(2, '0')}`;
    const parsedFromHex = parseColor(hexString);
    assert.notEqual(parsedFromHex, null, hexString);
    const rgbaString = parsedFromHex.toRgbFloatString(Format.Spaces);
    const parsedFromRgba = parseColor(rgbaString);
    assert.notEqual(parsedFromRgba, null, rgbaString);
    assert.equal(parsedFromRgba.toRgbHexString(true), hexString);
  }
});
