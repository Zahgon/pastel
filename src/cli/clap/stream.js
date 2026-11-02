// Copyright (c) Individual contributors (clap); ported in sharkdp/pastel.
// Copyright (c) Individual contributors (anstream, anstyle-query); ported in sharkdp/pastel.
// SPDX-License-Identifier: MIT OR Apache-2.0
// Reimplements, for the JavaScript port of sharkdp/pastel v0.12.0, how clap 4.5.56 writes styled
// text: anstream 0.6.20 `AutoStream` (src/auto.rs `choice`) with the anstyle-query 1.1.4 environment
// checks (NO_COLOR, CLICOLOR_FORCE, CLICOLOR, TERM, CI) on a non-Windows target.

import { stripBytes } from './strip.js';

/** When to use colours (`clap::ColorChoice`). */
export const ColorChoice = Object.freeze({
  Auto: 'Auto',
  Always: 'Always',
  Never: 'Never',
});

/**
 * anstyle-query `non_empty`.
 *
 * @param {string | undefined} value
 * @returns {boolean}
 */
function nonEmpty(value) {
  return value !== undefined && value !== '';
}

/**
 * anstream's automatic colour decision for a stream (`auto::choice`).
 *
 * @param {Record<string, string | undefined>} env environment variables
 * @param {boolean} isTerminal whether the stream is a terminal
 * @returns {boolean} whether escape codes are passed through
 */
function autoColorEnabled(env, isTerminal) {
  const clicolor = env.CLICOLOR === undefined ? null : env.CLICOLOR !== '0';
  const clicolorEnabled = clicolor ?? false;
  const clicolorDisabled = !(clicolor ?? true);
  if (nonEmpty(env.NO_COLOR)) {
    return false;
  }
  if (nonEmpty(env.CLICOLOR_FORCE)) {
    return true;
  }
  if (clicolorDisabled) {
    return false;
  }
  const termSupportsColor = env.TERM !== undefined && env.TERM !== 'dumb';
  const isCi = env.CI !== undefined;
  return isTerminal && (termSupportsColor || clicolorEnabled || isCi);
}

/**
 * Writes styled text to a stream like clap's `Colorizer::print` through an anstream `AutoStream`:
 * escape codes are kept when colours are enabled and stripped otherwise.
 *
 * @param {{env?: Record<string, string | undefined>, stdoutIsTerminal?: boolean,
 *          stderrIsTerminal?: boolean}} ctx
 * @param {(stream: 'stdout'|'stderr', text: string) => void} write
 * @param {'stdout'|'stderr'} stream
 * @param {string} colorWhen one of {@link ColorChoice}
 * @param {string} text text with ANSI escape codes
 */
export function writeStyled(ctx, write, stream, colorWhen, text) {
  let colored;
  if (colorWhen === ColorChoice.Always) {
    colored = true;
  } else if (colorWhen === ColorChoice.Never) {
    colored = false;
  } else {
    const isTerminal = Boolean(stream === 'stdout' ? ctx.stdoutIsTerminal : ctx.stderrIsTerminal);
    colored = autoColorEnabled(ctx.env ?? {}, isTerminal);
  }
  write(stream, colored ? text : stripBytes(text));
}
