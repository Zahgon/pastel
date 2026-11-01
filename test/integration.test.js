// Copyright (c) David Peter and pastel contributors.
// SPDX-License-Identifier: MIT OR Apache-2.0
// JavaScript port of the tests in tests/integration_tests.rs from sharkdp/pastel v0.12.0.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { IoError } from '../src/cli/error.js';

const PASTEL = fileURLToPath(new URL('../bin/pastel.js', import.meta.url));

/** A finished `pastel` run (the counterpart of `assert_cmd::assert::Assert`). */
class Assert {
  /**
   * @param {string[]} args
   * @param {import('node:child_process').SpawnSyncReturns<string>} output
   */
  constructor(args, output) {
    this.args = args;
    this.output = output;
  }

  /**
   * @returns {string}
   */
  describe() {
    const { status, signal, stdout, stderr } = this.output;
    return (
      `pastel ${this.args.map((a) => JSON.stringify(a)).join(' ')}\n` +
      `status: ${status}${signal ? ` (signal ${signal})` : ''}\n` +
      `stdout: ${JSON.stringify(stdout)}\nstderr: ${JSON.stringify(stderr)}`
    );
  }

  /**
   * Assert that the command exited with status 0.
   *
   * @returns {this}
   */
  success() {
    assert.equal(this.output.status, 0, `expected success\n${this.describe()}`);
    return this;
  }

  /**
   * Assert that the command exited with a non-zero status.
   *
   * @returns {this}
   */
  failure() {
    assert.ok(
      this.output.status !== null && this.output.status !== 0,
      `expected failure\n${this.describe()}`,
    );
    return this;
  }

  /**
   * Compare a part of the result. A custom message replaces the diff of `assert`, so it has to
   * show the expected value itself.
   *
   * @param {string} what
   * @param {unknown} actual
   * @param {unknown} expected
   * @returns {this}
   */
  check(what, actual, expected) {
    assert.deepEqual(
      actual,
      expected,
      `unexpected ${what}\nexpected ${what}: ${JSON.stringify(expected)}\n${this.describe()}`,
    );
    return this;
  }

  /**
   * Assert that stdout equals `expected`.
   *
   * @param {string} expected
   * @returns {this}
   */
  stdout(expected) {
    return this.check('stdout', this.output.stdout, expected);
  }

  /**
   * Assert that stderr equals `expected`.
   *
   * @param {string} expected
   * @returns {this}
   */
  stderr(expected) {
    return this.check('stderr', this.output.stderr, expected);
  }

  /**
   * Assert that the command exited with the given status and only printed `stderr`.
   *
   * @param {number} status
   * @param {string} stderr
   * @returns {this}
   */
  fails(status, stderr) {
    return this.check('status', this.output.status, status).stdout('').stderr(stderr);
  }

  /**
   * Assert that stdout has `count` lines and begins with the lines `first`.
   *
   * @param {number} count
   * @param {string[]} first
   * @returns {this}
   */
  lines(count, first) {
    const lines = this.output.stdout.split('\n').slice(0, -1);
    return this.check('line count', lines.length, count).check('first lines', lines.slice(0, first.length), first);
  }
}

/** A `pastel` invocation under construction (the counterpart of `assert_cmd::Command`). */
class Command {
  constructor() {
    /** @type {string[]} */
    this.args = [];
    this.stdin = '';
    this.env = { ...process.env };
    delete this.env.PASTEL_COLOR_MODE;
    delete this.env.CLICOLOR_FORCE;
  }

  /**
   * @param {string} arg
   * @returns {this}
   */
  arg(arg) {
    this.args.push(arg);
    return this;
  }

  /**
   * @param {...string} args
   * @returns {this}
   */
  withArgs(...args) {
    this.args.push(...args);
    return this;
  }

  /**
   * @param {string} input
   * @returns {this}
   */
  writeStdin(input) {
    this.stdin = input;
    return this;
  }

  /**
   * Run the command (stdin is a pipe, stdout and stderr are captured).
   *
   * @returns {Assert}
   */
  assert() {
    const output = spawnSync(process.execPath, [PASTEL, ...this.args], {
      input: this.stdin,
      env: this.env,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (output.error) {
      throw output.error;
    }
    return new Assert(this.args, output);
  }
}

/**
 * @returns {Command}
 */
function pastel() {
  return new Command();
}

test('color_reads_colors_from_args', () => {
  pastel().arg('color').arg('red').assert().success().stdout('hsl(0,100.0%,50.0%)\n');

  pastel()
    .arg('color')
    .arg('red')
    .arg('blue')
    .assert()
    .success()
    .stdout('hsl(0,100.0%,50.0%)\nhsl(240,100.0%,50.0%)\n');

  pastel().arg('color').arg('no color').assert().failure();
});

test('color_reads_colors_from_stdin', () => {
  pastel()
    .arg('color')
    .writeStdin('red\nblue\n')
    .assert()
    .success()
    .stdout('hsl(0,100.0%,50.0%)\nhsl(240,100.0%,50.0%)\n');

  pastel().arg('color').writeStdin('no color').assert().failure();
});

test('format_basic', () => {
  pastel().arg('format').arg('hex').arg('red').assert().success().stdout('#ff0000\n');

  pastel()
    .arg('format')
    .arg('rgb')
    .arg('red')
    .arg('blue')
    .assert()
    .success()
    .stdout('rgb(255, 0, 0)\nrgb(0, 0, 255)\n');
});

test('pipe_into_format_command', () => {
  const first = pastel().arg('color').arg('red').arg('teal').arg('hotpink').assert().success();

  pastel()
    .arg('format')
    .arg('name')
    .writeStdin(first.output.stdout)
    .assert()
    .success()
    .stdout('red\nteal\nhotpink\n');
});

test('sort_by_basic', () => {
  pastel()
    .arg('sort-by')
    .arg('luminance')
    .arg('gray')
    .arg('white')
    .arg('black')
    .assert()
    .success()
    .stdout('hsl(0,0.0%,0.0%)\nhsl(0,0.0%,50.2%)\nhsl(0,0.0%,100.0%)\n');
});

test('set_basic', () => {
  pastel()
    .arg('set')
    .arg('hsl-hue')
    .arg('120')
    .arg('red')
    .assert()
    .success()
    .stdout('hsl(120,100.0%,50.0%)\n');

  pastel()
    .arg('set')
    .arg('hsl-saturation')
    .arg('0.1')
    .arg('red')
    .assert()
    .success()
    .stdout('hsl(0,10.0%,50.0%)\n');

  pastel()
    .arg('set')
    .arg('hsl-lightness')
    .arg('0.5')
    .arg('white')
    .assert()
    .success()
    .stdout('hsl(0,0.0%,50.0%)\n');
});

// Process-level behaviour of the Rust runtime and standard library (not in the upstream tests).

const LINUX_ONLY = { skip: process.platform !== 'linux' };

/**
 * Runs pastel from a shell, so that its streams can be redirected in ways a test process cannot
 * set up itself. The script runs pastel as `"$1" "$0"`, with `node` as `$1`.
 * @param {string} script
 * @returns {import('node:child_process').SpawnSyncReturns<string>}
 */
function runInShell(script) {
  return spawnSync('sh', ['-c', script, PASTEL, process.execPath], { encoding: 'utf8' });
}

test('write_errors_report_the_os_error', LINUX_ONLY, () => {
  const output = runInShell('exec "$1" "$0" color red >/dev/full');
  assert.equal(output.stderr, '[pastel error]: I/O error: No space left on device (os error 28)\n');
  assert.equal(output.status, 1);
});

test('an_unfinished_line_fails_silently_at_exit', LINUX_ONLY, () => {
  const output = runInShell('exec "$1" "$0" paint -n red hi >/dev/full');
  assert.equal(output.stderr, '');
  assert.equal(output.status, 0);
});

test('a_writer_accepting_no_bytes_fails_in_the_buffer_or_the_direct_write', LINUX_ONLY, () => {
  // After the `exec`, /proc/self/mem refers to the address space of the shell, which is gone.
  const buffered = runInShell('exec "$1" "$0" color red >/proc/self/mem');
  assert.equal(buffered.stderr, '[pastel error]: I/O error: failed to write the buffered data\n');
  assert.equal(buffered.status, 1);

  const direct = runInShell(`exec "$1" "$0" paint red ${'x'.repeat(1024)} >/proc/self/mem`);
  assert.equal(direct.stderr, '[pastel error]: I/O error: failed to write whole buffer\n');
  assert.equal(direct.status, 1);
});

test('exceeding_the_file_size_limit_ends_the_process_with_sigxfsz', LINUX_ONLY, () => {
  const directory = mkdtempSync(join(tmpdir(), 'pastel-test-'));
  try {
    // The limit would also leave the coverage file of this child empty, which
    // --experimental-test-coverage cannot parse. The shell has to drop the variable, as
    // child_process adds NODE_V8_COVERAGE back to an `env` option that lacks it.
    const output = runInShell(
      `unset NODE_V8_COVERAGE; ulimit -c 0; ulimit -f 0; exec "$1" "$0" color red >"${join(directory, 'out')}"`,
    );
    assert.equal(output.signal, 'SIGXFSZ');
    assert.equal(output.stderr, '');
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test('a_directory_as_stdin', LINUX_ONLY, () => {
  const paint = runInShell('exec "$1" "$0" paint red </');
  assert.equal(paint.stderr, '[pastel error]: I/O error: Is a directory (os error 21)\n');
  assert.equal(paint.status, 1);

  const color = runInShell('exec "$1" "$0" color </');
  assert.equal(color.stderr, '[pastel error]: Color input contains invalid UTF8\n');
  assert.equal(color.status, 1);
});

test('os_errors_are_displayed_with_the_strerror_text', () => {
  assert.equal(
    IoError.fromNodeError({ code: 'ENOTCONN', errno: -107 }).message,
    'Transport endpoint is not connected (os error 107)',
  );
  assert.equal(IoError.fromNodeError({ code: 'ENOSPC', errno: -28 }).message, 'No space left on device (os error 28)');
  assert.equal(IoError.fromNodeError({ code: 'Unknown', errno: -41 }).message, 'Unknown error 41 (os error 41)');
});

// The other subcommands (not in the upstream tests). All expected values were recorded from the
// original binary of sharkdp/pastel v0.12.0, not from this port. Random colors, `distinct`
// computations, color pickers and `colorcheck` boards are deliberately not run.

const NOT_A_NUMBER = "[pastel error]: Could not parse number 'abc'\n";
const NOT_A_COLOR = "[pastel error]: Could not parse color 'nocolor'\n";

/**
 * The text of an error reported by clap.
 *
 * @param {string} message
 * @param {string} [usage]
 * @returns {string}
 */
function clapError(message, usage) {
  const usageSection = usage === undefined ? '' : `Usage: ${usage}\n\n`;
  return `error: ${message}\n\n${usageSection}For more information, try '--help'.\n`;
}

/**
 * @param {string} argument
 * @param {string} usage
 * @returns {string}
 */
function missingArgument(argument, usage) {
  return clapError(`the following required arguments were not provided:\n  ${argument}`, usage);
}

/**
 * The error for an unknown option with the tip to use `--`. A negative number counts as one in
 * the subcommands, named only up to the digit after the sign.
 *
 * @param {string} option
 * @param {string} usage
 * @returns {string}
 */
function unexpectedOption(option, usage) {
  const tip = `tip: to pass '${option}' as a value, use '-- ${option}'`;
  return clapError(`unexpected argument '${option}' found\n\n  ${tip}`, usage);
}

const COLORSPACE_VALUES = '[possible values: Lab, LCh, RGB, HSL, OkLab]';

test('mix_in_each_colorspace', () => {
  pastel().withArgs('mix', 'red', 'blue').assert().success().stdout('hsl(320,100.0%,39.6%)\n');

  const expected = {
    Lab: 'hsl(320,100.0%,39.6%)\n',
    LCh: 'hsl(329,100.0%,49.2%)\n',
    RGB: 'hsl(300,100.0%,25.1%)\n',
    HSL: 'hsl(300,100.0%,50.0%)\n',
    OkLab: 'hsl(283,32.2%,48.0%)\n',
  };
  for (const [colorspace, stdout] of Object.entries(expected)) {
    pastel().withArgs('mix', '-s', colorspace, 'red', 'blue').assert().success().stdout(stdout);
  }

  pastel().withArgs('mix', '--colorspace=rgb', 'red', 'blue').assert().success().stdout('hsl(300,100.0%,25.1%)\n');
});

test('mix_fraction', () => {
  pastel().withArgs('mix', '-f', '0.25', 'red', 'blue').assert().success().stdout('hsl(287,100.0%,38.2%)\n');
  pastel().withArgs('mix', '--fraction=0', 'red', 'blue').assert().success().stdout('hsl(240,100.0%,50.0%)\n');
  pastel().withArgs('mix', '--fraction', '1', 'red', 'blue').assert().success().stdout('hsl(0,100.0%,50.0%)\n');
  pastel().withArgs('mix', '-f', '2', 'red', 'blue').assert().success().stdout('hsl(0,100.0%,50.0%)\n');
});

test('mix_several_colors_and_stdin', () => {
  const stdout = 'hsl(320,100.0%,39.6%)\nhsl(51,100.0%,39.4%)\n';

  pastel().withArgs('mix', 'red', 'blue', 'lime').assert().success().stdout(stdout);
  pastel().withArgs('mix', 'red').writeStdin('blue\nlime\n').assert().success().stdout(stdout);
  pastel().withArgs('mix', '-', 'blue').writeStdin('red\n').assert().success().stdout('hsl(320,100.0%,39.6%)\n');
});

test('mix_errors', () => {
  pastel()
    .withArgs('mix', '-s', 'OkLCh', 'red', 'blue')
    .assert()
    .fails(
      2,
      clapError(
        `invalid value 'OkLCh' for '--colorspace <name>'\n  ${COLORSPACE_VALUES}\n\n` +
          "  tip: a similar value exists: 'OkLab'",
      ),
    );
  pastel()
    .withArgs('mix', '-s', 'nope', 'red', 'blue')
    .assert()
    .fails(2, clapError(`invalid value 'nope' for '--colorspace <name>'\n  ${COLORSPACE_VALUES}`));
  pastel().withArgs('mix', '-f', 'abc', 'red', 'blue').assert().fails(1, NOT_A_NUMBER);
  pastel()
    .withArgs('mix', '-f', '-1', 'red', 'blue')
    .assert()
    .fails(2, unexpectedOption('-1', 'pastel mix [OPTIONS] <color> [color]...'));
  pastel().withArgs('mix', 'nocolor', 'blue').assert().fails(1, NOT_A_COLOR);
  pastel().withArgs('mix', 'red', 'nocolor').assert().fails(1, NOT_A_COLOR);
  pastel().withArgs('mix').assert().fails(2, missingArgument('<color>', 'pastel mix <color> [color]...'));
});

test('gradient_number_of_colors', () => {
  pastel()
    .withArgs('gradient', 'red', 'blue')
    .assert()
    .success()
    .stdout(
      'hsl(0,100.0%,50.0%)\nhsl(349,100.0%,48.0%)\nhsl(341,100.0%,46.1%)\nhsl(333,100.0%,43.7%)\n' +
        'hsl(324,100.0%,41.0%)\nhsl(314,100.0%,37.8%)\nhsl(299,100.0%,34.3%)\nhsl(284,100.0%,39.4%)\n' +
        'hsl(269,100.0%,44.7%)\nhsl(240,100.0%,50.0%)\n',
    );
  pastel()
    .withArgs('gradient', '-n', '2', 'red', 'blue')
    .assert()
    .success()
    .stdout('hsl(0,100.0%,50.0%)\nhsl(240,100.0%,50.0%)\n');
  pastel()
    .withArgs('gradient', '-n', '3', 'red', 'blue')
    .assert()
    .success()
    .stdout('hsl(0,100.0%,50.0%)\nhsl(320,100.0%,39.6%)\nhsl(240,100.0%,50.0%)\n');
  pastel()
    .withArgs('gradient', '--number=4', 'red', 'blue')
    .assert()
    .success()
    .stdout('hsl(0,100.0%,50.0%)\nhsl(333,100.0%,43.7%)\nhsl(299,100.0%,34.3%)\nhsl(240,100.0%,50.0%)\n');
  pastel()
    .withArgs('gradient', 'red', 'white', 'blue', '-n', '5')
    .assert()
    .success()
    .stdout(
      'hsl(0,100.0%,50.0%)\nhsl(14,100.0%,75.3%)\nhsl(0,0.0%,100.0%)\nhsl(261,100.0%,77.3%)\n' +
        'hsl(240,100.0%,50.0%)\n',
    );
});

test('gradient_in_each_colorspace', () => {
  const middle = {
    Lab: 'hsl(320,100.0%,39.6%)',
    LCh: 'hsl(329,100.0%,49.2%)',
    RGB: 'hsl(300,100.0%,25.1%)',
    HSL: 'hsl(300,100.0%,50.0%)',
    OkLab: 'hsl(283,32.2%,48.0%)',
  };
  for (const [colorspace, color] of Object.entries(middle)) {
    pastel()
      .withArgs('gradient', '-n', '3', '-s', colorspace, 'red', 'blue')
      .assert()
      .success()
      .stdout(`hsl(0,100.0%,50.0%)\n${color}\nhsl(240,100.0%,50.0%)\n`);
  }

  pastel()
    .withArgs('gradient', '--colorspace=hsl', '-n', '3', 'red', 'blue')
    .assert()
    .success()
    .stdout('hsl(0,100.0%,50.0%)\nhsl(300,100.0%,50.0%)\nhsl(240,100.0%,50.0%)\n');
});

test('gradient_count_errors', () => {
  const tooFewSamples = '[pastel error]: The specified color count must be larger than one\n';

  pastel().withArgs('gradient', '-n', '1', 'red', 'blue').assert().fails(1, tooFewSamples);
  pastel().withArgs('gradient', '-n', '0', 'red', 'blue').assert().fails(1, tooFewSamples);
  pastel().withArgs('gradient', '-n', '1', 'red').assert().fails(1, tooFewSamples);
  pastel().withArgs('gradient', '-n', 'abc', 'red', 'blue').assert().fails(1, NOT_A_NUMBER);
  pastel()
    .withArgs('gradient', '-n', '2.5', 'red', 'blue')
    .assert()
    .fails(1, "[pastel error]: Could not parse number '2.5'\n");
  pastel()
    .withArgs('gradient', '--number=-3', 'red', 'blue')
    .assert()
    .fails(1, "[pastel error]: Could not parse number '-3'\n");
  pastel()
    .withArgs('gradient', '-n', '-3', 'red', 'blue')
    .assert()
    .fails(2, unexpectedOption('-3', 'pastel gradient [OPTIONS] <color>...'));
  pastel()
    .withArgs('gradient', 'red')
    .assert()
    .fails(1, '[pastel error]: The number of color arguments must be larger than one\n');
});

test('gradient_argument_errors', () => {
  pastel().withArgs('gradient').assert().fails(2, missingArgument('<color>...', 'pastel gradient <color>...'));
  pastel()
    .withArgs('gradient', '-s', 'nope', 'red', 'blue')
    .assert()
    .fails(2, clapError(`invalid value 'nope' for '--colorspace <name>'\n  ${COLORSPACE_VALUES}`));
  pastel().withArgs('gradient', 'nocolor', 'blue').assert().fails(1, NOT_A_COLOR);
});

test('gray_from_a_lightness', () => {
  pastel().withArgs('gray', '0').assert().success().stdout('hsl(0,0.0%,0.0%)\n');
  pastel().withArgs('gray', '0.25').assert().success().stdout('hsl(0,0.0%,25.0%)\n');
  pastel().withArgs('gray', '0.5').assert().success().stdout('hsl(0,0.0%,50.0%)\n');
  pastel().withArgs('gray', '1').assert().success().stdout('hsl(0,0.0%,100.0%)\n');
  pastel().withArgs('gray', '2').assert().success().stdout('hsl(0,0.0%,100.0%)\n');
  pastel().withArgs('gray', '--', '-1').assert().success().stdout('hsl(0,0.0%,0.0%)\n');
});

test('gray_errors', () => {
  pastel().withArgs('gray', 'abc').assert().fails(1, NOT_A_NUMBER);
  pastel().withArgs('gray', '-1').assert().fails(2, unexpectedOption('-1', 'pastel gray <lightness>'));
  pastel().withArgs('gray').assert().fails(2, missingArgument('<lightness>', 'pastel gray <lightness>'));
});

/** The number of lines of `pastel list` in a fixed sort order (one name per color). */
const LIST_LENGTH = 139;
const LIST_BY_HUE = ['black', 'palevioletred', 'pink', 'lightpink', 'snow', 'rosybrown', 'lightcoral', 'crimson'];
const LIST_BY_BRIGHTNESS = ['black', 'navy', 'darkblue', 'mediumblue', 'blue', 'midnightblue', 'indigo', 'maroon'];
const LIST_BY_LUMINANCE = ['black', 'navy', 'darkblue', 'midnightblue', 'indigo', 'mediumblue', 'maroon', 'darkred'];
const LIST_BY_CHROMA = ['black', 'dimgray', 'gray', 'darkgray', 'silver', 'gainsboro', 'lightgray', 'white'];

test('list_in_each_fixed_sort_order', () => {
  pastel().withArgs('list').assert().success().lines(LIST_LENGTH, LIST_BY_HUE);
  pastel().withArgs('list', '-s', 'hue').assert().success().lines(LIST_LENGTH, LIST_BY_HUE);
  pastel().withArgs('list', '-s', 'brightness').assert().success().lines(LIST_LENGTH, LIST_BY_BRIGHTNESS);
  pastel().withArgs('list', '-s', 'luminance').assert().success().lines(LIST_LENGTH, LIST_BY_LUMINANCE);
  pastel().withArgs('list', '-s', 'chroma').assert().success().lines(LIST_LENGTH, LIST_BY_CHROMA);
  pastel().withArgs('list', '--sort', 'chroma').assert().success().lines(LIST_LENGTH, LIST_BY_CHROMA);
  pastel().withArgs('list', '--sort=luminance').assert().success().lines(LIST_LENGTH, LIST_BY_LUMINANCE);
});

test('list_in_random_order', () => {
  // There are no first lines to compare. The original has 148 names, 9 of them aliases, and an
  // alias is only dropped when the shuffle puts it next to the other name of its color.
  const { stdout } = pastel().withArgs('list', '-s', 'random').assert().success().output;
  const lines = stdout.split('\n').slice(0, -1);

  assert.ok(
    lines.length >= LIST_LENGTH && lines.length <= 148,
    `expected ${LIST_LENGTH} to 148 lines, got ${lines.length}`,
  );
  assert.equal(new Set(lines).size, lines.length);
  assert.notDeepEqual(lines.slice(0, LIST_BY_HUE.length), LIST_BY_HUE);
});

test('list_errors', () => {
  pastel()
    .withArgs('list', '-s', 'nope')
    .assert()
    .fails(
      2,
      clapError(
        "invalid value 'nope' for '--sort <sort-order>'\n" +
          '  [possible values: brightness, luminance, hue, chroma, random]',
      ),
    );
});

const AMOUNT_COMMANDS = {
  lighten: {
    steelblue: 'hsl(207,44.0%,59.0%)\n',
    several: 'hsl(0,100.0%,75.0%)\nhsl(207,44.0%,74.0%)\n',
    stdin: 'hsl(207,44.0%,59.0%)\nhsl(0,100.0%,60.0%)\n',
    full: 'hsl(207,44.0%,100.0%)\n',
    negative: 'hsl(207,44.0%,39.0%)\n',
  },
  darken: {
    steelblue: 'hsl(207,44.0%,39.0%)\n',
    several: 'hsl(0,100.0%,25.0%)\nhsl(207,44.0%,24.0%)\n',
    stdin: 'hsl(207,44.0%,39.0%)\nhsl(0,100.0%,40.0%)\n',
    full: 'hsl(207,44.0%,0.0%)\n',
    negative: 'hsl(207,44.0%,59.0%)\n',
  },
  saturate: {
    steelblue: 'hsl(207,54.0%,49.0%)\n',
    several: 'hsl(0,100.0%,50.0%)\nhsl(207,69.0%,49.0%)\n',
    stdin: 'hsl(207,54.0%,49.0%)\nhsl(0,100.0%,50.0%)\n',
    full: 'hsl(207,100.0%,49.0%)\n',
    negative: 'hsl(207,34.0%,49.0%)\n',
  },
  desaturate: {
    steelblue: 'hsl(207,34.0%,49.0%)\n',
    several: 'hsl(0,75.0%,50.0%)\nhsl(207,19.0%,49.0%)\n',
    stdin: 'hsl(207,34.0%,49.0%)\nhsl(0,90.0%,50.0%)\n',
    full: 'hsl(207,0.0%,49.0%)\n',
    negative: 'hsl(207,54.0%,49.0%)\n',
  },
};

for (const [command, expected] of Object.entries(AMOUNT_COMMANDS)) {
  test(`${command}_by_an_amount`, () => {
    pastel().withArgs(command, '0.1', 'steelblue').assert().success().stdout(expected.steelblue);
    pastel().withArgs(command, '0.25', 'red', 'steelblue').assert().success().stdout(expected.several);
    pastel().withArgs(command, '0.1').writeStdin('steelblue\nred\n').assert().success().stdout(expected.stdin);
    pastel().withArgs(command, '1', 'steelblue').assert().success().stdout(expected.full);
    pastel().withArgs(command, '--', '-0.1', 'steelblue').assert().success().stdout(expected.negative);
  });

  test(`${command}_errors`, () => {
    const usage = `pastel ${command} <amount> [color]...`;

    pastel().withArgs(command, 'abc', 'steelblue').assert().fails(1, NOT_A_NUMBER);
    pastel().withArgs(command, '0.1', 'nocolor').assert().fails(1, NOT_A_COLOR);
    pastel().withArgs(command, '-0.1', 'steelblue').assert().fails(2, unexpectedOption('-0', usage));
    pastel().withArgs(command).assert().fails(2, missingArgument('<amount>', usage));
  });
}

test('rotate_by_an_angle', () => {
  pastel().withArgs('rotate', '90', 'red').assert().success().stdout('hsl(90,100.0%,50.0%)\n');
  pastel().withArgs('rotate', '--', '-90', 'red').assert().success().stdout('hsl(270,100.0%,50.0%)\n');
  pastel().withArgs('rotate', '360', 'steelblue').assert().success().stdout('hsl(207,44.0%,49.0%)\n');
  pastel()
    .withArgs('rotate', '180', 'red', 'steelblue')
    .assert()
    .success()
    .stdout('hsl(180,100.0%,50.0%)\nhsl(27,44.0%,49.0%)\n');
  pastel().withArgs('rotate', '45').writeStdin('steelblue\n').assert().success().stdout('hsl(252,44.0%,49.0%)\n');
});

test('rotate_errors', () => {
  const usage = 'pastel rotate <degrees> [color]...';

  pastel().withArgs('rotate', 'abc', 'red').assert().fails(1, NOT_A_NUMBER);
  pastel().withArgs('rotate', '-90', 'red').assert().fails(2, unexpectedOption('-9', usage));
  pastel().withArgs('rotate').assert().fails(2, missingArgument('<degrees>', usage));
});

test('complement_of_colors', () => {
  pastel().withArgs('complement', 'red').assert().success().stdout('hsl(180,100.0%,50.0%)\n');
  pastel()
    .withArgs('complement', 'steelblue', 'white')
    .assert()
    .success()
    .stdout('hsl(27,44.0%,49.0%)\nhsl(180,0.0%,100.0%)\n');
  pastel()
    .withArgs('complement')
    .writeStdin('red\nsteelblue\n')
    .assert()
    .success()
    .stdout('hsl(180,100.0%,50.0%)\nhsl(27,44.0%,49.0%)\n');
  pastel().withArgs('complement', 'nocolor').assert().fails(1, NOT_A_COLOR);
});

test('to_gray_of_colors', () => {
  pastel().withArgs('to-gray', 'red').assert().success().stdout('hsl(0,0.0%,49.8%)\n');
  pastel()
    .withArgs('to-gray', 'steelblue', 'white')
    .assert()
    .success()
    .stdout('hsl(207,0.0%,49.0%)\nhsl(0,0.0%,100.0%)\n');
  pastel()
    .withArgs('to-gray')
    .writeStdin('red\nsteelblue\n')
    .assert()
    .success()
    .stdout('hsl(0,0.0%,49.8%)\nhsl(207,0.0%,49.0%)\n');
  pastel().withArgs('to-gray', 'nocolor').assert().fails(1, NOT_A_COLOR);
});

test('textcolor_of_colors', () => {
  pastel().withArgs('textcolor', 'white').assert().success().stdout('hsl(0,0.0%,0.0%)\n');
  pastel().withArgs('textcolor', 'black').assert().success().stdout('hsl(0,0.0%,100.0%)\n');
  pastel()
    .withArgs('textcolor', 'steelblue', 'yellow', 'navy')
    .assert()
    .success()
    .stdout('hsl(0,0.0%,0.0%)\nhsl(0,0.0%,0.0%)\nhsl(0,0.0%,100.0%)\n');
  pastel()
    .withArgs('textcolor')
    .writeStdin('white\nblack\n')
    .assert()
    .success()
    .stdout('hsl(0,0.0%,0.0%)\nhsl(0,0.0%,100.0%)\n');
  pastel().withArgs('textcolor', 'nocolor').assert().fails(1, NOT_A_COLOR);
});

test('colorblind_for_each_type', () => {
  pastel()
    .withArgs('colorblind', 'prot', 'red', 'steelblue')
    .assert()
    .success()
    .stdout('hsl(53,100.0%,24.7%)\nhsl(253,28.6%,58.8%)\n');
  pastel()
    .withArgs('colorblind', 'deuter', 'red', 'steelblue')
    .assert()
    .success()
    .stdout('hsl(54,100.0%,32.7%)\nhsl(250,32.4%,57.1%)\n');
  pastel()
    .withArgs('colorblind', 'trit', 'red', 'steelblue')
    .assert()
    .success()
    .stdout('hsl(354,100.0%,50.0%)\nhsl(177,48.4%,36.5%)\n');
  pastel().withArgs('colorblind', 'PROT', 'red').assert().success().stdout('hsl(53,100.0%,24.7%)\n');
  pastel().withArgs('colorblind', 'Deuter', 'red').assert().success().stdout('hsl(54,100.0%,32.7%)\n');
  pastel().withArgs('colorblind', 'trit').writeStdin('red\n').assert().success().stdout('hsl(354,100.0%,50.0%)\n');
});

test('colorblind_errors', () => {
  pastel()
    .withArgs('colorblind', 'nope', 'red')
    .assert()
    .fails(2, clapError("invalid value 'nope' for '<type>'\n  [possible values: prot, deuter, trit]"));
  pastel().withArgs('colorblind').assert().fails(2, missingArgument('<type>', 'pastel colorblind <type> [color]...'));
  pastel().withArgs('colorblind', 'prot', 'nocolor').assert().fails(1, NOT_A_COLOR);
});

test('random_with_a_count_of_zero', () => {
  pastel().withArgs('random', '-n', '0').assert().success().stdout('').stderr('');
  for (const strategy of ['vivid', 'rgb', 'gray', 'lch_hue']) {
    pastel().withArgs('random', '-n', '0', '-s', strategy).assert().success().stdout('').stderr('');
  }
  pastel().withArgs('random', '--number=0', '--strategy=gray').assert().success().stdout('').stderr('');
});

test('random_errors', () => {
  const strategyValues = '[possible values: vivid, rgb, gray, lch_hue]';
  const usage = 'pastel random [OPTIONS]';

  pastel().withArgs('random', '-n', 'abc').assert().fails(1, NOT_A_NUMBER);
  pastel().withArgs('random', '-n', '1.5').assert().fails(1, "[pastel error]: Could not parse number '1.5'\n");
  pastel().withArgs('random', '--number=-1').assert().fails(1, "[pastel error]: Could not parse number '-1'\n");
  pastel().withArgs('random', '-n', '-1').assert().fails(2, clapError("unexpected argument '-1' found", usage));
  pastel()
    .withArgs('random', '-n')
    .assert()
    .fails(2, clapError("a value is required for '--number <count>' but none was supplied"));
  pastel()
    .withArgs('random', '-s', 'nope', '-n', '0')
    .assert()
    .fails(2, clapError(`invalid value 'nope' for '--strategy <strategy>'\n  ${strategyValues}`));
  pastel()
    .withArgs('random', '-s')
    .assert()
    .fails(2, clapError(`a value is required for '--strategy <strategy>' but none was supplied\n  ${strategyValues}`));
  pastel()
    .withArgs('random', '-n', '0', 'extra')
    .assert()
    .fails(2, clapError("unexpected argument 'extra' found", usage));
});

test('distinct_errors', () => {
  const usage = 'pastel distinct [OPTIONS] [count] [color]...';
  const tooFewColors = '[pastel error]: The number of colors must be larger than one\n';

  pastel().withArgs('distinct', '1').assert().fails(1, tooFewColors);
  pastel().withArgs('distinct', '0').assert().fails(1, tooFewColors);
  pastel().withArgs('distinct', 'abc').assert().fails(1, NOT_A_NUMBER);
  pastel().withArgs('distinct', '--', '-1').assert().fails(1, "[pastel error]: Could not parse number '-1'\n");
  pastel().withArgs('distinct', '-1').assert().fails(2, unexpectedOption('-1', usage));
  pastel()
    .withArgs('distinct', '2', 'red', 'lime', 'blue')
    .assert()
    .fails(1, '[pastel error]: The number of fixed colors must be smaller than the total number of colors\n');
  pastel().withArgs('distinct', '2', 'nocolor').assert().fails(1, NOT_A_COLOR);
  pastel()
    .withArgs('distinct', '-m', 'nope', '2')
    .assert()
    .fails(2, clapError("invalid value 'nope' for '--metric <name>'\n  [possible values: CIEDE2000, CIE76]"));
  pastel().withArgs('distinct', '--nope').assert().fails(2, unexpectedOption('--nope', usage));
});

test('pick_help', () => {
  const longHelp =
    'Print a spectrum of colors to choose from. This command requires an external color picker tool to be\n' +
    'installed.\n\n' +
    'Supported tools:\n' +
    '  - gpick (https://github.com/thezbyg/gpick)\n' +
    '  - xcolor (https://github.com/Soft/xcolor)\n' +
    '  - wcolor (https://github.com/Elvyria/wcolor)\n' +
    '  - grabc (https://www.muquit.com/muquit/software/grabc/grabc.html)\n' +
    '  - colorpicker (https://github.com/Jack12816/colorpicker)\n' +
    '  - chameleon (https://github.com/seebye/chameleon)\n' +
    '  - KColorChooser (https://kde.org/applications/graphics/org.kde.kcolorchooser)\n' +
    '  - zenity (https://wiki.gnome.org/Projects/Zenity)\n' +
    '  - yad (https://github.com/v1cont/yad)\n' +
    '  - hyprpicker (https://github.com/hyprwm/hyprpicker)\n' +
    '  - macOS built-in color picker\n\n' +
    'Usage: pastel pick [count]\n\n' +
    'Arguments:\n' +
    '  [count]\n' +
    '          Number of colors to pick\n' +
    '          \n' +
    '          [default: 1]\n\n' +
    'Options:\n' +
    '  -h, --help\n' +
    "          Print help (see a summary with '-h')\n";

  pastel().withArgs('pick', '--help').assert().success().stdout(longHelp);
  pastel().withArgs('help', 'pick').assert().success().stdout(longHelp);
  pastel()
    .withArgs('pick', '-h')
    .assert()
    .success()
    .stdout(
      'Interactively pick a color from the screen (pipette)\n\n' +
        'Usage: pastel pick [count]\n\n' +
        'Arguments:\n' +
        '  [count]  Number of colors to pick [default: 1]\n\n' +
        'Options:\n' +
        "  -h, --help  Print help (see more with '--help')\n",
    );
});

test('pick_errors', () => {
  const usage = 'pastel pick [count]';

  pastel().withArgs('pick', 'abc').assert().fails(1, NOT_A_NUMBER);
  pastel().withArgs('pick', '--', '-1').assert().fails(1, "[pastel error]: Could not parse number '-1'\n");
  pastel().withArgs('pick', '-1').assert().fails(2, unexpectedOption('-1', usage));
  pastel().withArgs('pick', '--nope').assert().fails(2, unexpectedOption('--nope', usage));
  pastel().withArgs('pick', '1', '2').assert().fails(2, clapError("unexpected argument '2' found", usage));
  pastel()
    .withArgs('--color-picker', 'nope', 'pick')
    .assert()
    .fails(
      2,
      clapError(
        "invalid value 'nope' for '--color-picker <color-picker>'\n" +
          '  [possible values: gpick, xcolor, wcolor, grabc, colorpicker, chameleon, kcolorchooser, ' +
          'zenity, yad, hyprpicker, gdbus]',
      ),
    );
});

test('colorcheck_help', () => {
  const help =
    'Check if your terminal emulator supports 24-bit colors.\n\n' +
    'Usage: pastel colorcheck\n\n' +
    'Options:\n' +
    '  -h, --help  Print help\n';

  pastel().withArgs('colorcheck', '--help').assert().success().stdout(help);
  pastel().withArgs('colorcheck', '-h').assert().success().stdout(help);
  pastel().withArgs('help', 'colorcheck').assert().success().stdout(help);
});

test('colorcheck_errors', () => {
  const usage = 'pastel colorcheck';

  pastel().withArgs('colorcheck', 'extra').assert().fails(2, clapError("unexpected argument 'extra' found", usage));
  pastel().withArgs('colorcheck', '--nope').assert().fails(2, clapError("unexpected argument '--nope' found", usage));
});
