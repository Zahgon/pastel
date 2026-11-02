// Copyright (c) David Peter and pastel contributors.
// SPDX-License-Identifier: MIT OR Apache-2.0
// JavaScript port of the tests in src/cli/cli.rs from sharkdp/pastel v0.12.0.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ClapError, ErrorKind } from '../src/cli/clap/index.js';
import { InvalidOsStr, ParsedArg, RawArgs, restoreInvalidUtf8 } from '../src/cli/clap/lex.js';
import { buildCli } from '../src/cli/cli.js';

/** A non-interactive environment: no terminals, no colours, the default terminal width. */
const CTX = Object.freeze({
  env: {},
  stdoutIsTerminal: false,
  stderrIsTerminal: false,
  stdinIsTerminal: false,
});

/**
 * The names of all (nested) subcommands, as argument paths.
 *
 * @param {import('../src/cli/clap/index.js').Command} cmd
 * @param {string[]} prefix
 * @returns {string[][]}
 */
function subcommandPaths(cmd, prefix) {
  return cmd.getSubcommands().flatMap((sc) => {
    const path = [...prefix, sc.getName()];
    return [path, ...subcommandPaths(sc, path)];
  });
}

/**
 * Asserts that `pastel <args>` displays help (on stdout, exit status 0) and returns the text.
 *
 * @param {string[]} args
 * @returns {string}
 */
function renderHelp(args) {
  const invocation = ['pastel', ...args].join(' ');
  let error = null;
  try {
    buildCli().tryGetMatchesFrom(['pastel', ...args], CTX);
  } catch (err) {
    if (!(err instanceof ClapError)) {
      throw err;
    }
    error = err;
  }
  assert.notEqual(error, null, `${invocation}: expected help output`);
  assert.equal(error.kind, ErrorKind.DisplayHelp, `${invocation}: ${error.render(false)}`);
  assert.equal(error.useStderr(), false, invocation);
  assert.equal(error.exitCode(), 0, invocation);
  assert.ok(error.render(true).length > 0, invocation);
  return error.render(false);
}

/**
 * Asserts that within one command, argument ids, short and long flags and subcommand names
 * (including aliases) are unique, like `Command::debug_assert` does.
 *
 * @param {import('../src/cli/clap/index.js').Command} cmd
 * @param {string} name
 */
function assertUniqueNames(cmd, name) {
  const assertUnique = (what, values) => {
    const seen = new Set();
    for (const v of values) {
      assert.ok(!seen.has(v), `${name}: duplicate ${what} ${JSON.stringify(v)}`);
      seen.add(v);
    }
  };
  const args = cmd.getArguments();
  assertUnique('argument id', args.map((a) => a.getId()));
  assertUnique('short flag', args.map((a) => a.getShort()).filter((s) => s !== null));
  assertUnique('long flag', args.map((a) => a.getLong()).filter((l) => l !== null));
  assertUnique('subcommand name', cmd.allSubcommandNames());
  for (const sc of cmd.getSubcommands()) {
    assertUniqueNames(sc, `${name} ${sc.getName()}`);
  }
}

test('verify_cmd', () => {
  const cli = buildCli();
  assertUniqueNames(cli, 'pastel');

  const paths = subcommandPaths(cli, []);
  assert.ok(paths.length > 0, 'pastel has subcommands');

  for (const path of [[], ...paths]) {
    const usage = `Usage: ${['pastel', ...path].join(' ')}`;
    for (const flag of ['-h', '--help']) {
      const help = renderHelp([...path, flag]);
      assert.ok(help.includes(usage), `${usage} missing in:\n${help}`);
    }
  }

  for (const path of paths) {
    const usage = `Usage: ${['pastel', ...path].join(' ')}`;
    const help = renderHelp(['help', ...path]);
    assert.ok(help.includes(usage), `${usage} missing in:\n${help}`);
  }
});

/**
 * An argument that is not valid UTF-8, built from a text and raw bytes.
 *
 * @param {string} text
 * @param {number[]} bytes
 * @returns {InvalidOsStr}
 */
function invalid(text, ...bytes) {
  return new InvalidOsStr(Buffer.concat([Buffer.from(text), Buffer.from(bytes)]));
}

/**
 * The first line of the message and the usage when parsing raw (OS string) arguments.
 *
 * @param {Array<string | InvalidOsStr>} args
 * @returns {string[]}
 */
function rawArgsError(args) {
  const cmd = buildCli();
  cmd.binName = 'pastel';
  cmd.appExt.ctx = CTX;
  const rawArgs = new RawArgs(args);
  let error = null;
  try {
    cmd.doParse(rawArgs, rawArgs.cursor());
  } catch (err) {
    if (!(err instanceof ClapError)) {
      throw err;
    }
    error = err;
  }
  assert.notEqual(error, null, `${args.length} arguments: expected an error`);
  const lines = error.render(false).split('\n');
  return [lines[0], lines.find((line) => line.startsWith('Usage: '))];
}

test('arguments that are not valid UTF-8 (compared with the original)', () => {
  const INVALID_UTF8 = 'error: invalid UTF-8 was detected in one or more arguments';
  const COLOR_USAGE = 'Usage: pastel color [color]...';
  const TOP_USAGE = 'Usage: pastel [OPTIONS] <COMMAND>';

  // A value of any argument: clap's error, whichever way the value was given.
  assert.deepEqual(rawArgsError(['color', invalid('', 0xff)]), [INVALID_UTF8, COLOR_USAGE]);
  assert.deepEqual(rawArgsError(['color', '--', invalid('', 0xff)]), [INVALID_UTF8, COLOR_USAGE]);
  assert.deepEqual(rawArgsError(['-m', invalid('', 0xff)]), [INVALID_UTF8, TOP_USAGE]);
  assert.deepEqual(rawArgsError([invalid('-m', 0xff)]), [INVALID_UTF8, TOP_USAGE]);
  assert.deepEqual(rawArgsError([invalid('-m=', 0xff)]), [INVALID_UTF8, TOP_USAGE]);
  assert.deepEqual(rawArgsError([invalid('--color-mode=', 0xff)]), [INVALID_UTF8, TOP_USAGE]);
  assert.deepEqual(rawArgsError(['mix', invalid('-sL', 0xff), 'red']), [INVALID_UTF8, 'Usage: pastel mix [OPTIONS] <color> [color]...']);

  // Never a subcommand: shown lossily.
  assert.deepEqual(rawArgsError([invalid('', 0xff)]), ["error: unrecognized subcommand '�'", TOP_USAGE]);
  assert.deepEqual(rawArgsError(['--', invalid('a', 0xff, 0xfe)]), ["error: unrecognized subcommand 'a��'", TOP_USAGE]);
  assert.deepEqual(rawArgsError(['help', 'format', invalid('', 0xff)]), [
    "error: unrecognized subcommand '�'",
    'Usage: pastel format [type] [color]...',
  ]);

  // Flags: the invalid rest of a short group is reported as one argument.
  assert.deepEqual(rawArgsError([invalid('-', 0xff)]), ["error: unexpected argument '-�' found", TOP_USAGE]);
  assert.deepEqual(rawArgsError([invalid('-f', 0xff, 0x61)]), ["error: unexpected argument '-�a' found", TOP_USAGE]);
  assert.deepEqual(rawArgsError([invalid('-é', 0xff)]), ["error: unexpected argument '-é' found", TOP_USAGE]);
  assert.deepEqual(rawArgsError([invalid('--', 0xff)]), ["error: unexpected argument '--�' found", TOP_USAGE]);
  assert.deepEqual(rawArgsError([invalid('--foo=', 0xff)]), ["error: unexpected argument '--foo' found", TOP_USAGE]);
  assert.deepEqual(rawArgsError([invalid('--force-color=', 0xff)]), [
    "error: unexpected value '�' for '--force-color' found; no more were expected",
    'Usage: pastel --force-color <COMMAND>',
  ]);

  // A literal U+FFFD in the valid prefix is a flag like any other.
  const literal = new ParsedArg(invalid('-�é', 0xff)).toShort();
  assert.equal(literal.isNegativeNumber(), false);
  assert.equal(literal.nextFlag(), '�');
  assert.equal(literal.clone().nextValueOs().toStringLossy(), 'é�');
  assert.equal(literal.nextFlag(), 'é');
  assert.ok(literal.nextFlag() instanceof InvalidOsStr);
  assert.equal(literal.nextFlag(), null);
  assert.equal(literal.isEmpty(), true);
});

test('arguments stay as given if the raw command line does not back them up', () => {
  const given = ['�'];
  assert.equal(restoreInvalidUtf8(given), given);
  const matches = buildCli().tryGetMatchesFrom(['pastel', 'color', '�'], CTX);
  assert.deepEqual(matches.subcommand()[1].getMany('color'), ['�']);
});
