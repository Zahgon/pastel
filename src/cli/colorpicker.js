// Copyright (c) David Peter and pastel contributors.
// SPDX-License-Identifier: MIT OR Apache-2.0
// JavaScript port of src/cli/colorpicker.rs from sharkdp/pastel v0.12.0.

import { spawnSync } from 'node:child_process';

import { Color } from '../lib/color.js';
import { rustTrim } from '../lib/rustfmt.js';
import { eqIgnoreAsciiCase } from './clap/arg.js';
import { COLOR_PICKER_TOOLS, PostProcessError } from './colorpicker_tools.js';
import { IoError, PastelError } from './error.js';
import { Canvas } from './hdcanvas.js';
import { environmentBrush, STDERR, STRICT_UTF8 } from './output.js';

/**
 * Print a color spectrum to STDERR. Write errors propagate as `PastelError`.
 * @param {import('./config.js').Config} config
 */
export function printColorspectrum(config) {
  const width = config.colorpickerWidth;

  const canvas = new Canvas(width + 2 * config.padding, width + 2 * config.padding, environmentBrush(2, config.env));
  canvas.drawRect(config.padding, config.padding, width + 2, width + 2, Color.white());

  for (let y = 0; y < width; y++) {
    for (let x = 0; x < width; x++) {
      const rx = x / width;
      const ry = y / width;

      const h = 360.0 * rx;
      const s = 0.6;
      const l = 0.95 * ry;

      // Start with HSL
      const color = Color.fromHsl(h, s, l);

      // But (slightly) normalize the luminance
      const lch = color.toLch();
      lch.l = (lch.l + ry * 100.0) / 2.0;
      const normalized = Color.fromLch(lch.l, lch.c, lch.h, 1.0);

      canvas.drawRect(config.padding + y + 1, config.padding + x + 1, 1, 1, normalized);
    }
  }

  canvas.print(STDERR);
  STDERR.write('\n');
}

/**
 * `Command::output()`: runs a program with stdin connected to /dev/null and captures its output.
 * @param {string} command
 * @param {string[]} args
 * @returns {import('node:child_process').SpawnSyncReturns<Buffer>}
 * @throws {IoError} if the program could not be started
 */
function runCommand(command, args) {
  const result = spawnSync(command, args, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: Infinity });
  if (result.error) {
    throw IoError.fromNodeError(result.error);
  }
  return result;
}

/**
 * Whether a tool is installed: its version check can be run and prints the expected prefix on
 * stdout or stderr. Failing to run the check just means that the tool is not available.
 * @param {import('./colorpicker_tools.js').ColorPickerTool} tool
 * @returns {boolean}
 */
function toolIsAvailable(tool) {
  let check;
  try {
    check = runCommand(tool.command, tool.versionArgs);
  } catch (err) {
    if (err instanceof IoError) {
      return false;
    }
    throw err;
  }
  const expected = Buffer.from(tool.versionOutputStartsWith, 'utf8');
  return startsWith(check.stdout, expected) || startsWith(check.stderr, expected);
}

/**
 * `<[u8]>::starts_with`.
 * @param {Buffer} bytes
 * @param {Buffer} prefix
 * @returns {boolean}
 */
function startsWith(bytes, prefix) {
  return bytes.length >= prefix.length && bytes.subarray(0, prefix.length).equals(prefix);
}

/**
 * Run an external color picker tool (e.g. gpick or xcolor) and get the output as a string.
 * @param {string|null} picker Name of the tool to use, or `null` to use the first available one.
 * @returns {string}
 */
export function runExternalColorpicker(picker) {
  const candidates = COLOR_PICKER_TOOLS.filter((t) => picker === null || eqIgnoreAsciiCase(t.command, picker));
  const tool = candidates.find(toolIsAvailable);
  if (tool === undefined) {
    throw PastelError.noColorPickerFound();
  }

  let result;
  try {
    result = runCommand(tool.command, tool.args);
  } catch (err) {
    throw err instanceof IoError ? PastelError.fromIoError(err) : err;
  }
  if (result.status !== 0) {
    throw PastelError.colorPickerExecutionError(tool.command);
  }

  let color;
  try {
    color = STRICT_UTF8.decode(result.stdout);
  } catch {
    throw PastelError.colorInvalidUtf8();
  }
  color = rustTrim(color);

  // Check if tool requires some post processing of the output
  if (tool.postProcess === null) {
    return color;
  }
  try {
    return tool.postProcess(color);
  } catch (err) {
    throw err instanceof PostProcessError ? PastelError.colorParseError(err.message) : err;
  }
}
