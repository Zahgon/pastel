// Copyright (c) Individual contributors (clap).
// Copyright (c) 2015 The terminal-size Developers (terminal_size).
// SPDX-License-Identifier: MIT OR Apache-2.0
// Reimplements clap_builder 4.5.56 src/output/{help,help_template}.rs (auto-generated help with
// the `help` and `wrap_help` features; pastel uses no custom templates, headings, before/after
// help, env values or flattened subcommands) and the terminal lookup of terminal_size 0.4.3 for the
// JavaScript port of sharkdp/pastel v0.12.0.

import tty from 'node:tty';

import { parseUsize } from '../../lib/rustfmt.js';
import { paint } from './styling.js';
import { StyledStr } from './styled_str.js';
import { displayWidth } from './textwrap.js';
import { quoteIfWhitespace } from './error.js';

const TAB = '  ';
const TAB_WIDTH = TAB.length;
const SHORT_SIZE = 4;
const NEXT_LINE_INDENT = '        ';

/**
 * The columns of a terminal, unless it reports zero rows or columns (`terminal_size_of`).
 *
 * @param {{getWindowSize: () => [number, number]}} stream a `tty.WriteStream`
 * @returns {number | null}
 */
function usableColumns(stream) {
  const [columns, rows] = stream.getWindowSize();
  return rows > 0 && columns > 0 ? columns : null;
}

/**
 * The width of the first usable terminal among stdout, stderr and stdin
 * (`terminal_size::terminal_size`). The stream objects are only created for terminals: creating
 * them for pipes would switch the descriptors to non-blocking mode.
 *
 * @param {{stdoutIsTerminal?: boolean, stderrIsTerminal?: boolean, stdinIsTerminal?: boolean}} ctx
 * @returns {number | null}
 */
function terminalColumns(ctx) {
  let columns = null;
  if (ctx.stdoutIsTerminal) {
    columns = usableColumns(process.stdout);
  }
  if (columns === null && ctx.stderrIsTerminal) {
    columns = usableColumns(process.stderr);
  }
  if (columns === null && ctx.stdinIsTerminal) {
    // `process.stdin` is a `tty.ReadStream`, which cannot report its size.
    const stdin = new tty.WriteStream(0);
    columns = usableColumns(stdin);
    stdin.destroy();
  }
  return columns;
}

/**
 * The terminal width clap wraps help at (`HelpTemplate::term_w` and `dimensions()`): the size of
 * the first terminal among stdout/stderr/stdin, else `COLUMNS`, else 100; capped by
 * `max_term_width` (0 or unset = no cap).
 *
 * @param {import('./command.js').Command} cmd
 * @param {{env?: object, stdoutIsTerminal?: boolean, stderrIsTerminal?: boolean,
 *          stdinIsTerminal?: boolean}} ctx
 * @returns {number}
 */
export function termWidth(cmd, ctx) {
  let currentWidth = terminalColumns(ctx);
  if (currentWidth === null) {
    const columns = (ctx.env ?? {}).COLUMNS;
    if (columns !== undefined) {
      currentWidth = parseUsize(columns);
    }
  }
  currentWidth ??= 100;
  const mw = cmd.getMaxTermWidth();
  const maxWidth = mw === null || mw === 0 ? Infinity : mw;
  return Math.min(currentWidth, maxWidth);
}

/**
 * Writes the help of `cmd` (`output::help::write_help`).
 *
 * @param {StyledStr} writer
 * @param {import('./command.js').Command} cmd
 * @param {import('./usage.js').Usage} usage
 * @param {boolean} useLong
 */
export function writeHelp(writer, cmd, usage, useLong) {
  new HelpTemplate(writer, cmd, usage, useLong).writeAutoHelp();
  writer.trimStartLines();
  writer.trimEnd();
  writer.pushStr('\n');
}

function shouldShowArg(arg) {
  return !arg.isHideSet();
}

function shouldShowSubcommand(subcommand) {
  return !subcommand.isHideSet();
}

function positionalSortKey(arg) {
  return [arg.getIndex() ?? 0, ''];
}

function optionSortKey(arg) {
  let key;
  const x = arg.getShort();
  if (x !== null) {
    const isLower = x >= 'a' && x <= 'z';
    key = x.replace(/[A-Z]/, (c) => c.toLowerCase()) + (isLower ? '0' : '1');
  } else if (arg.getLong() !== null) {
    key = arg.getLong();
  } else {
    key = '{' + arg.getId();
  }
  return [arg.getDisplayOrder(), key];
}

/**
 * `(taken as f32 / term_w as f32) > 0.40` evaluated in single precision.
 *
 * @param {number} taken
 * @param {number} termW
 * @returns {boolean}
 */
function exceedsShare(taken, termW) {
  return Math.fround(Math.fround(taken) / Math.fround(termW)) > Math.fround(0.4);
}

/** Compares `(usize, String)` sort keys like Rust's tuple `Ord` (strings byte-wise). */
function compareKeys(a, b) {
  if (a[0] !== b[0]) {
    return a[0] < b[0] ? -1 : 1;
  }
  const ab = Buffer.from(a[1]);
  const bb = Buffer.from(b[1]);
  return Buffer.compare(ab, bb);
}

/**
 * Help template writer (`HelpTemplate` with the default templates).
 */
class HelpTemplate {
  constructor(writer, cmd, usage, useLong) {
    this.writer = writer;
    this.cmd = cmd;
    this.styles = cmd.getStyles();
    this.usage = usage;
    this.nextLineHelp = false;
    this.termW = cmd.helpTermWidth();
    this.useLong = useLong;
  }

  /** `AutoHelp::write_help`: picks the template with or without the arguments section. */
  writeAutoHelp() {
    const pos = this.cmd.getPositionals().some((a) => shouldShowArg(a));
    const nonPos = this.cmd.getNonPositionals().some((a) => shouldShowArg(a));
    const subcmds = this.cmd.hasVisibleSubcommands();
    this.writeAbout(false, true);
    this.writer.pushStr('\n');
    const usage = this.styles.getUsage();
    this.writer.pushStr(`${usage.render()}Usage:${usage.renderReset()}`);
    this.writer.pushStr(' ');
    this.writer.pushStyled(this.usage.createUsageNoTitle([]));
    if (nonPos || pos || subcmds) {
      this.writer.pushStr('\n\n');
      this.writeAllArgs();
    }
  }

  writeAbout(beforeNewLine, afterNewLine) {
    const about = this.useLong ? (this.cmd.getLongAbout() ?? this.cmd.getAbout()) : this.cmd.getAbout();
    if (about !== null) {
      if (beforeNewLine) {
        this.writer.pushStr('\n');
      }
      const output = about.clone();
      output.replaceNewlineVar();
      output.wrap(this.termW);
      this.writer.pushStyled(output);
      if (afterNewLine) {
        this.writer.pushStr('\n');
      }
    }
  }

  /** Writes the subcommands, positionals and options sections (`write_all_args`). */
  writeAllArgs() {
    const header = this.styles.getHeader();
    const pos = this.cmd.getPositionals().filter((a) => shouldShowArg(a));
    const nonPos = this.cmd.getNonPositionals().filter((a) => shouldShowArg(a));
    const subcmds = this.cmd.hasVisibleSubcommands();
    let first = true;

    if (subcmds) {
      if (!first) {
        this.writer.pushStr('\n\n');
      }
      first = false;
      this.writer.pushStr(`${paint(header, 'Commands:')}\n`);
      this.writeSubcommands(this.cmd);
    }
    if (pos.length > 0) {
      if (!first) {
        this.writer.pushStr('\n\n');
      }
      first = false;
      this.writer.pushStr(`${paint(header, 'Arguments:')}\n`);
      this.writeArgs(pos, positionalSortKey);
    }
    if (nonPos.length > 0) {
      if (!first) {
        this.writer.pushStr('\n\n');
      }
      first = false;
      this.writer.pushStr(`${paint(header, 'Options:')}\n`);
      this.writeArgs(nonPos, optionSortKey);
    }
  }

  /** Sorts arguments by display order and writes their help (`write_args`). */
  writeArgs(args, sortKey) {
    let longest = 2;
    const ordV = [];
    for (const arg of args.filter((a) => shouldShowArg(a))) {
      const width = displayWidth(arg.toString());
      const actualWidth = arg.getLong() !== null ? width + SHORT_SIZE : width;
      longest = Math.max(longest, actualWidth);
      const key = sortKey(arg);
      const existing = ordV.findIndex(([k]) => compareKeys(k, key) === 0);
      if (existing >= 0) {
        ordV[existing] = [key, arg];
      } else {
        ordV.push([key, arg]);
      }
    }
    ordV.sort((a, b) => compareKeys(a[0], b[0]));

    const nextLineHelp = this.willArgsWrap(args, longest);
    ordV.forEach(([, arg], i) => {
      if (i !== 0) {
        this.writer.pushStr('\n');
        if (nextLineHelp && this.useLong) {
          this.writer.pushStr('\n');
        }
      }
      this.writeArg(arg, nextLineHelp, longest);
    });
  }

  writeArg(arg, nextLineHelp, longest) {
    const specVals = this.specVals(arg);
    this.writer.pushStr(TAB);
    this.short(arg);
    this.long(arg);
    this.writer.pushStyled(arg.stylizeArgSuffix(this.styles, null));
    this.alignToAbout(arg, nextLineHelp, longest);
    const about = this.useLong
      ? (arg.getLongHelp() ?? arg.getHelp() ?? new StyledStr())
      : (arg.getHelp() ?? arg.getLongHelp() ?? new StyledStr());
    this.help(arg, about, specVals, nextLineHelp, longest);
  }

  short(arg) {
    const literal = this.styles.getLiteral();
    if (arg.getShort() !== null) {
      this.writer.pushStr(paint(literal, `-${arg.getShort()}`));
    } else if (arg.getLong() !== null) {
      this.writer.pushStr('    ');
    }
  }

  long(arg) {
    const literal = this.styles.getLiteral();
    if (arg.getLong() !== null) {
      if (arg.getShort() !== null) {
        this.writer.pushStr(', ');
      }
      this.writer.pushStr(paint(literal, `--${arg.getLong()}`));
    }
  }

  alignToAbout(arg, nextLineHelp, longest) {
    let padding;
    if (this.useLong || nextLineHelp) {
      padding = 0;
    } else if (!arg.isPositional()) {
      const selfLen = displayWidth(arg.toString()) + SHORT_SIZE;
      const pad = arg.getLong() !== null ? TAB_WIDTH : TAB_WIDTH + 4;
      padding = longest + pad - selfLen;
    } else {
      const selfLen = displayWidth(arg.toString());
      padding = longest + TAB_WIDTH - selfLen;
    }
    this.writer.pushStr(' '.repeat(padding));
  }

  /** Writes the help text of an argument or subcommand (`HelpTemplate::help`). */
  help(arg, about, specVals, nextLineHelp, longest) {
    if (nextLineHelp) {
      this.writer.pushStr('\n');
      this.writer.pushStr(TAB);
      this.writer.pushStr(NEXT_LINE_INDENT);
    }
    const spaces = nextLineHelp ? TAB.length + NEXT_LINE_INDENT.length : longest + TAB_WIDTH * 2;
    const trailingIndent = ' '.repeat(spaces);

    const help = about.clone();
    let helpIsEmpty = help.isEmpty();
    help.replaceNewlineVar();

    const nextLineSpecs = this.useLong && arg !== null;
    if (specVals !== '' && !nextLineSpecs) {
      if (!helpIsEmpty) {
        help.pushStr(' ');
      }
      help.pushStr(specVals);
      helpIsEmpty = help.isEmpty();
    }

    const availChars = Math.max(this.termW - spaces, 0);
    help.wrap(availChars);
    help.indent('', trailingIndent);
    this.writer.pushStyled(help);

    if (specVals !== '' && nextLineSpecs) {
      const specs = new StyledStr();
      if (!helpIsEmpty) {
        specs.pushStr('\n\n');
      }
      specs.pushStr(specVals);
      specs.wrap(availChars);
      specs.indent('', trailingIndent);
      this.writer.pushStyled(specs);
    }
  }

  willArgsWrap(args, longest) {
    return args
      .filter((a) => shouldShowArg(a))
      .some((arg) => this.argNextLineHelp(arg, this.specVals(arg), longest));
  }

  argNextLineHelp(arg, specVals, longest) {
    if (this.nextLineHelp || this.useLong) {
      return true;
    }
    const h = arg.getHelp() ?? arg.getLongHelp() ?? new StyledStr();
    const hW = h.displayWidth() + displayWidth(specVals);
    const taken = longest + TAB_WIDTH * 2;
    return this.termW >= taken && exceedsShare(taken, this.termW) && hW > this.termW - taken;
  }

  /** `[default: ...]` and `[possible values: ...]` of an argument (`spec_vals`). */
  specVals(a) {
    const ctx = this.styles.getContext();
    const ctxVal = this.styles.getContextValue();
    const valSep = paint(ctx, ', ');
    const specVals = [];
    if (a.isTakesValueSet() && !a.isHideDefaultValueSet() && a.defaultVals.length > 0) {
      const dvs = a.defaultVals
        .map((dv) => quoteIfWhitespace(dv))
        .join(' ');
      specVals.push(`${paint(ctx, '[default: ')}${paint(ctxVal, dvs)}${paint(ctx, ']')}`);
    }
    if (!a.isHidePossibleValuesSet()) {
      const possibleVals = a.getPossibleValues();
      if (possibleVals.length > 0) {
        const pvs = possibleVals
          .filter((pv) => !pv.isHideSet())
          .map((pv) => paint(ctxVal, quoteIfWhitespace(pv.getName())))
          .join(valSep);
        specVals.push(`${paint(ctx, '[possible values: ')}${pvs}${paint(ctx, ']')}`);
      }
    }
    return specVals.join(this.useLong ? '\n' : ' ');
  }

  /** Writes the list of subcommands (`write_subcommands`). */
  writeSubcommands(cmd) {
    const literal = this.styles.getLiteral();
    let longest = 2;
    const ordV = [];
    for (const subcommand of cmd.getSubcommands().filter(shouldShowSubcommand)) {
      const styled = new StyledStr(paint(literal, subcommand.getName()));
      longest = Math.max(longest, styled.displayWidth());
      ordV.push([[subcommand.getDisplayOrder(), styled.ansi()], styled, subcommand]);
    }
    ordV.sort((a, b) => compareKeys(a[0], b[0]));

    const nextLineHelp = this.willSubcommandsWrap(cmd.getSubcommands(), longest);
    ordV.forEach(([, scStr, sc], i) => {
      if (i > 0) {
        this.writer.pushStr('\n');
      }
      this.writeSubcommand(scStr, sc, nextLineHelp, longest);
    });
  }

  willSubcommandsWrap(subcommands, longest) {
    return subcommands
      .filter(shouldShowSubcommand)
      .some((sc) => this.subcommandNextLineHelp(sc, '', longest));
  }

  writeSubcommand(scStr, cmd, nextLineHelp, longest) {
    const about = cmd.getAbout() ?? cmd.getLongAbout() ?? new StyledStr();
    this.writer.pushStr(TAB);
    this.writer.pushStyled(scStr);
    if (!nextLineHelp) {
      this.writer.pushStr(' '.repeat(longest + TAB_WIDTH - scStr.displayWidth()));
    }
    this.help(null, about, '', nextLineHelp, longest);
  }

  subcommandNextLineHelp(cmd, specVals, longest) {
    if (this.nextLineHelp) {
      return true;
    }
    const h = cmd.getAbout() ?? cmd.getLongAbout() ?? new StyledStr();
    const hW = h.displayWidth() + displayWidth(specVals);
    const taken = longest + TAB_WIDTH * 2;
    return this.termW >= taken && exceedsShare(taken, this.termW) && hW > this.termW - taken;
  }
}
