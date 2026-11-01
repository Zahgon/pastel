// Copyright (c) David Peter and pastel contributors.
// SPDX-License-Identifier: MIT OR Apache-2.0
// JavaScript port of src/cli/colorpicker_tools.rs from sharkdp/pastel v0.12.0.

import { formatDisplay, parseF64, rustTrim } from '../lib/rustfmt.js';

/**
 * @typedef {object} ColorPickerTool
 * @property {string} command Executable name.
 * @property {string[]} args Arguments to pick a color.
 * @property {string[]} versionArgs Arguments to check whether the tool is available.
 * @property {string} versionOutputStartsWith Expected prefix of stdout or stderr of the check.
 * @property {((raw: string) => string) | null} postProcess Post-processing of the output of the
 *   color picker tool; throws a `PostProcessError` if the output has an unexpected format.
 */

/** The output of a color picker tool could not be post-processed (Rust `Err(&'static str)`). */
export class PostProcessError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'PostProcessError';
  }
}

/**
 * The JavaScript for Automation script of the macOS color picker, exactly as the Rust string
 * literal spells it (every line ends with an escaped and a literal newline).
 */
const MACOS_PICKER_SCRIPT = [
  '\n',
  '                const app = Application.currentApplication();\n\n',
  '                app.includeStandardAdditions = true;\n\n',
  '                const rgb = app.chooseColor({defaultColor: [0.5, 0.5, 0.5]})\n\n',
  '                  .map(n => Math.round(n * 255))\n\n',
  "                  .join(', ');\n\n",
  '                `rgb(${rgb})`;\n\n',
  '            ',
].join('');

/**
 * Parses the output of the GNOME Shell screenshot `PickColor` D-Bus method, e.g.
 * `({'color': <(0.1, 0.2, 0.3)>},)`, into an `rgb(…%,…%,…%)` color string.
 * @param {string} raw
 * @returns {string}
 * @throws {PostProcessError} if the output has an unexpected format
 */
function gdbusParseColor(raw) {
  const PARSE_ERROR = 'Unexpected gdbus output format';
  const parts = raw.split('(');
  if (parts.length < 3) {
    throw new PostProcessError(PARSE_ERROR);
  }
  const rgb = parts[2]
    .split(')')[0]
    .split(',')
    .map((v) => parseF64(rustTrim(v)));
  if (rgb.includes(null) || rgb.length !== 3) {
    throw new PostProcessError(PARSE_ERROR);
  }
  return `rgb(${formatDisplay(rgb[0] * 100)}%,${formatDisplay(rgb[1] * 100)}%,${formatDisplay(rgb[2] * 100)}%)`;
}

/**
 * The supported external color picker tools in the order in which they are tried (`osascript`
 * only on macOS, `gdbus` only on Linux, like the `#[cfg]` attributes of the original).
 * @type {readonly ColorPickerTool[]}
 */
export const COLOR_PICKER_TOOLS = Object.freeze([
  ...(process.platform === 'darwin'
    ? [
        {
          command: 'osascript',
          // This does not use `console.log` to print the value, because that gets written to
          // stderr instead of stdout regardless of the `-s o` flag.
          args: ['-l', 'JavaScript', '-s', 'o', '-e', MACOS_PICKER_SCRIPT],
          versionArgs: ['-l', 'JavaScript', '-s', 'o', '-e', "'ok';"],
          versionOutputStartsWith: 'ok',
          postProcess: null,
        },
      ]
    : []),
  {
    command: 'gpick',
    args: ['--pick', '--single', '--output'],
    versionArgs: ['--version'],
    versionOutputStartsWith: 'Gpick',
    postProcess: null,
  },
  {
    command: 'xcolor',
    args: ['--format', 'hex'],
    versionArgs: ['--version'],
    versionOutputStartsWith: 'xcolor',
    postProcess: null,
  },
  {
    command: 'wcolor',
    args: ['--format', 'hex'],
    versionArgs: ['--version'],
    versionOutputStartsWith: 'wcolor',
    postProcess: null,
  },
  {
    command: 'grabc',
    args: ['-hex'],
    versionArgs: ['-v'],
    versionOutputStartsWith: 'grabc',
    postProcess: null,
  },
  {
    command: 'colorpicker',
    args: ['--one-shot', '--short'],
    versionArgs: ['--help'],
    versionOutputStartsWith: '',
    postProcess: null,
  },
  {
    command: 'chameleon',
    args: [],
    versionArgs: ['-h'],
    versionOutputStartsWith: '',
    postProcess: null,
  },
  {
    command: 'kcolorchooser',
    args: ['--print'],
    versionArgs: ['-v'],
    versionOutputStartsWith: 'kcolorchooser',
    postProcess: null,
  },
  {
    command: 'zenity',
    args: ['--color-selection'],
    versionArgs: ['--version'],
    versionOutputStartsWith: '',
    postProcess: null,
  },
  {
    command: 'yad',
    args: ['--color'],
    versionArgs: ['--version'],
    versionOutputStartsWith: '',
    postProcess: null,
  },
  {
    command: 'hyprpicker',
    args: [],
    versionArgs: ['-h'],
    versionOutputStartsWith: '',
    postProcess: null,
  },
  ...(process.platform === 'linux'
    ? [
        {
          command: 'gdbus',
          args: [
            'call',
            '--session',
            '--dest',
            'org.gnome.Shell.Screenshot',
            '--object-path',
            '/org/gnome/Shell/Screenshot',
            '--method',
            'org.gnome.Shell.Screenshot.PickColor',
          ],
          versionArgs: [
            'introspect',
            '--session',
            '--dest',
            'org.gnome.Shell.Screenshot',
            '--object-path',
            '/org/gnome/Shell/Screenshot',
          ],
          versionOutputStartsWith: 'node /org/gnome/Shell/Screenshot',
          postProcess: gdbusParseColor,
        },
      ]
    : []),
]);

/** Names of all supported color picker tools (the possible values of `--color-picker`). */
export const COLOR_PICKER_TOOL_NAMES = Object.freeze(COLOR_PICKER_TOOLS.map((t) => t.command));
