// Copyright (c) David Peter and pastel contributors.
// SPDX-License-Identifier: MIT OR Apache-2.0
// JavaScript port of src/cli/main.rs from sharkdp/pastel v0.12.0.

import { isUtf8 } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import tty from 'node:tty';

import { Brush, getColormode, Mode, modeFromModeStr, UnknownColorModeError } from '../lib/ansi.js';
import { Color } from '../lib/color.js';
import { ClapError } from './clap/index.js';
import { buildCli } from './cli.js';
import { Command } from './commands/index.js';
import { Config } from './config.js';
import { ErrorKind, ignoreWriteError, Panic, PastelError } from './error.js';
import { STDERR, STDOUT } from './output.js';

/**
 * Writes `[<title>]: <message>` to stderr, the title painted in the given color if stdout is a
 * terminal.
 * @param {Color} c
 * @param {string} title
 * @param {string} message
 * @param {Record<string, string | undefined>} env
 */
function writeStderr(c, title, message, env) {
  let brush;
  try {
    brush = Brush.fromEnvironment(tty.isatty(1), env);
  } catch (err) {
    if (!(err instanceof UnknownColorModeError)) {
      throw err;
    }
    // `unwrap_or_default()`: an invalid PASTEL_COLOR_MODE gives an uncolored title.
    brush = Brush.fromMode(null);
  }
  // The original ignores a failure to write the message (`.ok()`). `writeln!` writes every piece
  // on its own, which decides how much of a long message fits into a non-blocking pipe.
  ignoreWriteError(() => {
    STDERR.write(brush.paint(`[${title}]`, c));
    STDERR.write(': ');
    STDERR.write(message);
    STDERR.write('\n');
  });
}

/**
 * `std::env::var` reports a value that is not valid UTF-8 as an error, which pastel treats like an
 * unset `PASTEL_COLOR_MODE`, whereas Node.js replaces the invalid bytes. The original bytes are
 * taken from `/proc/self/environ`.
 * @param {Record<string, string | undefined>} env
 */
function unsetInvalidColorMode(env) {
  if (!env.PASTEL_COLOR_MODE?.includes('�')) {
    return;
  }
  let environ;
  try {
    environ = fs.readFileSync('/proc/self/environ');
  } catch {
    // Without a readable /proc the bytes cannot be checked, so the value stays as Node.js decoded
    // it. The original has no such failure: `std::env::var` looks at the raw bytes itself.
    return;
  }
  const prefix = Buffer.from('PASTEL_COLOR_MODE=');
  let start = 0;
  while (start < environ.length) {
    const nul = environ.indexOf(0, start);
    const end = nul === -1 ? environ.length : nul;
    const entry = environ.subarray(start, end);
    if (entry.subarray(0, prefix.length).equals(prefix)) {
      if (!isUtf8(entry)) {
        delete env.PASTEL_COLOR_MODE;
      }
      return;
    }
    start = end + 1;
  }
}

/**
 * Warns that the terminal does not seem to support 24-bit colors.
 * @param {Record<string, string | undefined>} env
 */
function printPastelWarning(env) {
  writeStderr(
    Color.yellow(),
    'pastel warning',
    'Your terminal emulator does not appear to support 24-bit colors ' +
      '(this means that the COLORTERM environment variable is not set to ' +
      "'truecolor' or '24bit'). " +
      'pastel will fall back to 8-bit colors, but you will only be able ' +
      'to see rough approximations of the real colors.\n\n' +
      'To fix this, follow these steps:\n  ' +
      "1. Run 'pastel colorcheck' to test if your terminal\n     " +
      'emulator does support 24-bit colors. If this is the\n     ' +
      "case, set 'PASTEL_COLOR_MODE=24bit' to force 24-bit\n     " +
      'mode and to remove this warning. Alternatively, make\n     ' +
      'sure that COLORTERM is properly set by your terminal\n     ' +
      'emulator.\n  ' +
      '2. If your terminal emulator does not support 24-bit\n     ' +
      "colors, set 'PASTEL_COLOR_MODE=8bit' to remove this\n     " +
      'warning or try a different terminal emulator.\n\n' +
      'For more information, see https://gist.github.com/XVilka/8346728\n',
    env,
  );
}

/**
 * The name the program was invoked with: the file name of the script without a `.js` extension,
 * so that both the `pastel` link and `node bin/pastel.js` report "pastel".
 * @param {string[]} argv `process.argv`
 * @returns {string}
 */
function binName(argv) {
  if (argv.length < 2) {
    return 'pastel';
  }
  return path.basename(argv[1]).replace(/\.js$/, '');
}

/**
 * Parses the arguments and runs the subcommand.
 * @param {string[]} argv `process.argv`
 * @param {Record<string, string | undefined>} env
 * @returns {number} exit code
 */
function run(argv, env) {
  const stdoutIsTerminal = tty.isatty(1);
  const ctx = {
    env,
    stdoutIsTerminal,
    stderrIsTerminal: tty.isatty(2),
    stdinIsTerminal: tty.isatty(0),
  };

  const app = buildCli();
  let globalMatches;
  try {
    globalMatches = app.tryGetMatchesFrom([binName(argv), ...argv.slice(2)], ctx);
  } catch (err) {
    if (!(err instanceof ClapError)) {
      throw err;
    }
    // `get_matches()` exits through clap's `Error::exit`, which ignores errors while printing
    // the help, version or error message (`let _ = self.print()`).
    ignoreWriteError(() => err.print(ctx, (stream, text) => (stream === 'stderr' ? STDERR : STDOUT).write(text)));
    return err.exitCode();
  }

  const interactiveMode = stdoutIsTerminal;

  let colorMode;
  if (globalMatches.getFlag('force-color')) {
    colorMode = Mode.TrueColor;
  } else {
    switch (globalMatches.getOne('color-mode')) {
      case '24bit':
        colorMode = Mode.TrueColor;
        break;
      case '8bit':
        colorMode = Mode.Ansi8Bit;
        break;
      case 'off':
        colorMode = null;
        break;
      case 'auto':
        if (interactiveMode) {
          const envColorMode = env.PASTEL_COLOR_MODE;
          if (envColorMode !== undefined) {
            try {
              colorMode = modeFromModeStr(envColorMode);
            } catch (err) {
              if (err instanceof UnknownColorModeError) {
                throw PastelError.fromUnknownColorModeError(err);
              }
              throw err;
            }
          } else {
            colorMode = getColormode(env);
            const subcommand = globalMatches.subcommandName();
            if (colorMode === Mode.Ansi8Bit && subcommand !== 'paint' && subcommand !== 'colorcheck') {
              printPastelWarning(env);
            }
          }
        } else {
          colorMode = null;
        }
        break;
      default:
        throw new Panic(
          'internal error: entered unreachable code: Unknown --color-mode argument',
          'src/cli/main.rs:96:18',
        );
    }
  }

  const config = new Config({
    padding: 2,
    colorpickerWidth: 48,
    colorcheckWidth: 8,
    interactiveMode,
    env,
    brush: Brush.fromMode(colorMode),
    colorpicker: globalMatches.getOne('color-picker') ?? null,
  });

  const subcommand = globalMatches.subcommand();
  if (subcommand === null) {
    throw new Panic('internal error: entered unreachable code: Subcommand is required', 'src/cli/main.rs:115:9');
  }
  const [name, matches] = subcommand;
  const command = Command.fromString(name);
  command.execute(matches, config);

  return 0;
}

/**
 * Writes out buffered stdout data. Like the flush in Rust's exit-time cleanup, a failure is
 * ignored.
 */
function flushStdout() {
  ignoreWriteError(() => STDOUT.flush());
}

/**
 * Runs the `pastel` command line tool.
 * @param {string[]} [argv] Defaults to `process.argv`.
 * @param {Record<string, string | undefined>} [env] Defaults to `process.env`.
 * @returns {number} the exit status
 */
export function main(argv = process.argv, env = process.env) {
  unsetInvalidColorMode(env);
  let exitCode;
  try {
    exitCode = run(argv, env);
  } catch (err) {
    if (err instanceof PastelError) {
      if (err.kind === ErrorKind.StdoutClosed) {
        exitCode = 0;
      } else {
        writeStderr(Color.red(), 'pastel error', err.message, env);
        exitCode = 1;
      }
    } else if (err instanceof Panic) {
      // Rust's panic hook ignores a failure to write the panic message.
      ignoreWriteError(() => STDERR.write(err.report()));
      exitCode = 101;
    } else {
      flushStdout();
      throw err;
    }
  }
  flushStdout();
  return exitCode;
}
