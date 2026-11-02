// Copyright (c) Individual contributors (clap); ported in sharkdp/pastel.
// SPDX-License-Identifier: MIT OR Apache-2.0
// Reimplements clap_builder 4.5.56 src/error/{mod,format,kind,context}.rs (RichFormatter, with the
// `error-context` and `suggestions` features) and src/output/fmt.rs (Colorizer) for the
// JavaScript port of sharkdp/pastel v0.12.0.

import { isRustWhitespace } from '../../lib/rustfmt.js';
import { paint } from './styling.js';
import { StyledStr } from './styled_str.js';
import { didYouMean } from './suggestions.js';
import { ColorChoice, writeStyled } from './stream.js';

const TAB = '  ';

/** Command-line argument parser error kinds (`ErrorKind`). */
export const ErrorKind = Object.freeze({
  InvalidValue: 'InvalidValue',
  UnknownArgument: 'UnknownArgument',
  InvalidSubcommand: 'InvalidSubcommand',
  TooManyValues: 'TooManyValues',
  ArgumentConflict: 'ArgumentConflict',
  MissingRequiredArgument: 'MissingRequiredArgument',
  MissingSubcommand: 'MissingSubcommand',
  InvalidUtf8: 'InvalidUtf8',
  DisplayHelp: 'DisplayHelp',
  DisplayHelpOnMissingArgumentOrSubcommand: 'DisplayHelpOnMissingArgumentOrSubcommand',
  DisplayVersion: 'DisplayVersion',
});

const KIND_MESSAGES = Object.freeze({
  InvalidValue: "one of the values isn't valid for an argument",
  UnknownArgument: 'unexpected argument found',
  InvalidSubcommand: 'unrecognized subcommand',
  TooManyValues: 'unexpected value for an argument found',
  ArgumentConflict: 'an argument cannot be used with one or more of the other specified arguments',
  MissingRequiredArgument: 'one or more required arguments were not provided',
  MissingSubcommand: 'a subcommand is required but one was not provided',
  InvalidUtf8: 'invalid UTF-8 was detected in one or more arguments',
});

/** Semantics of a piece of error context (`ContextKind`). */
const ContextKind = Object.freeze({
  InvalidSubcommand: 'InvalidSubcommand',
  ValidSubcommand: 'ValidSubcommand',
  InvalidArg: 'InvalidArg',
  PriorArg: 'PriorArg',
  ValidValue: 'ValidValue',
  InvalidValue: 'InvalidValue',
  SuggestedSubcommand: 'SuggestedSubcommand',
  SuggestedArg: 'SuggestedArg',
  SuggestedValue: 'SuggestedValue',
  Suggested: 'Suggested',
  Usage: 'Usage',
});

/** A piece of error context (`ContextValue`): `{ type, value }`. */
const cv = Object.freeze({
  none: () => ({ type: 'None', value: null }),
  string: (value) => ({ type: 'String', value }),
  strings: (value) => ({ type: 'Strings', value }),
  styledStr: (value) => ({ type: 'StyledStr', value }),
  styledStrs: (value) => ({ type: 'StyledStrs', value }),
});

/**
 * Command-line argument parser error (`clap::Error`). Help and version output are "errors" too.
 */
export class ClapError extends Error {
  /**
   * @param {string} kind one of {@link ErrorKind}
   */
  constructor(kind) {
    super(kind);
    this.name = 'ClapError';
    this.kind = kind;
    this.context = [];
    this.messageStyled = null;
    this.styles = null;
    this.colorWhen = ColorChoice.Never;
    this.colorHelpWhen = ColorChoice.Never;
    this.helpFlag = null;
  }

  /**
   * Applies a command's formatting settings (`Error::with_cmd`).
   *
   * @param {import('./command.js').Command} cmd
   * @returns {ClapError} this
   */
  withCmd(cmd) {
    this.styles = cmd.getStyles();
    this.colorWhen = cmd.getColor();
    this.colorHelpWhen = cmd.colorHelp();
    this.helpFlag = getHelpFlag(cmd);
    return this;
  }

  /**
   * @param {string} kind
   * @returns {object | undefined} the context value of that kind
   */
  get(kind) {
    const entry = this.context.find(([k]) => k === kind);
    return entry === undefined ? undefined : entry[1];
  }

  /**
   * Adds a piece of context without looking for an existing one (`insert_context_unchecked`).
   *
   * @param {string} kind one of {@link ContextKind}
   * @param {object} value a `ContextValue`
   * @returns {ClapError} this
   */
  insert(kind, value) {
    this.context.push([kind, value]);
    return this;
  }

  /** @returns {boolean} whether the message goes to stderr (everything but help and version) */
  useStderr() {
    return this.stream() === 'stderr';
  }

  /** @returns {'stdout' | 'stderr'} */
  stream() {
    return this.kind === ErrorKind.DisplayHelp || this.kind === ErrorKind.DisplayVersion
      ? 'stdout'
      : 'stderr';
  }

  /** @returns {number} the exit status: 2 for stderr messages, 0 for help and version */
  exitCode() {
    return this.useStderr() ? 2 : 0;
  }

  /** @returns {StyledStr} the formatted message including styles */
  formatted() {
    return this.messageStyled ?? formatError(this);
  }

  /**
   * Renders the message.
   *
   * @param {boolean} colored keep the ANSI styles (otherwise they are stripped like anstream does)
   * @returns {string}
   */
  render(colored) {
    const styled = this.formatted();
    return colored ? styled.ansi() : styled.toString();
  }

  /**
   * Prints the message to stdout or stderr, colored or stripped according to anstream's rules
   * (`Error::print`).
   *
   * @param {{env: object, stdoutIsTerminal?: boolean, stderrIsTerminal?: boolean}} ctx
   * @param {(stream: 'stdout'|'stderr', text: string) => void} write
   */
  print(ctx, write) {
    const colorWhen =
      this.kind === ErrorKind.DisplayHelp ||
      this.kind === ErrorKind.DisplayHelpOnMissingArgumentOrSubcommand
        ? this.colorHelpWhen
        : this.colorWhen;
    writeStyled(ctx, write, this.stream(), colorWhen, this.formatted().ansi());
  }

  /**
   * An error whose message is already rendered, such as help (`Error::for_app`).
   *
   * @param {string} kind one of {@link ErrorKind}
   * @param {import('./command.js').Command} cmd
   * @param {StyledStr} styled the message
   * @returns {ClapError}
   */
  static forApp(kind, cmd, styled) {
    const err = new ClapError(kind).withCmd(cmd);
    err.messageStyled = styled;
    return err;
  }

  /**
   * Requested help, written to stdout (`Error::display_help`).
   *
   * @param {import('./command.js').Command} cmd
   * @param {StyledStr} styled the help text
   * @returns {ClapError}
   */
  static displayHelp(cmd, styled) {
    return ClapError.forApp(ErrorKind.DisplayHelp, cmd, styled);
  }

  /**
   * Help shown because no arguments were given, written to stderr (`Error::display_help_error`).
   *
   * @param {import('./command.js').Command} cmd
   * @param {StyledStr} styled the help text
   * @returns {ClapError}
   */
  static displayHelpError(cmd, styled) {
    return ClapError.forApp(ErrorKind.DisplayHelpOnMissingArgumentOrSubcommand, cmd, styled);
  }

  /**
   * Requested version, written to stdout (`Error::display_version`).
   *
   * @param {import('./command.js').Command} cmd
   * @param {StyledStr} styled the version text
   * @returns {ClapError}
   */
  static displayVersion(cmd, styled) {
    return ClapError.forApp(ErrorKind.DisplayVersion, cmd, styled);
  }

  /**
   * `arg` cannot be used with `others`, or more than once if `others` is `arg` itself
   * (`Error::argument_conflict`).
   *
   * @param {import('./command.js').Command} cmd
   * @param {string} arg
   * @param {string[]} others
   * @param {StyledStr | null} usage
   * @returns {ClapError}
   */
  static argumentConflict(cmd, arg, others, usage) {
    const err = new ClapError(ErrorKind.ArgumentConflict).withCmd(cmd);
    let prior;
    if (others.length === 0) {
      prior = cv.none();
    } else if (others.length === 1) {
      prior = cv.string(others[0]);
    } else {
      prior = cv.strings(others);
    }
    err.insert(ContextKind.InvalidArg, cv.string(arg)).insert(ContextKind.PriorArg, prior);
    if (usage !== null) {
      err.insert(ContextKind.Usage, cv.styledStr(usage));
    }
    return err;
  }

  /**
   * `arg` needs a value but got none: an empty invalid value (`Error::empty_value`).
   *
   * @param {import('./command.js').Command} cmd
   * @param {string[]} goodVals the possible values
   * @param {string} arg
   * @returns {ClapError}
   */
  static emptyValue(cmd, goodVals, arg) {
    return ClapError.invalidValue(cmd, '', goodVals, arg);
  }

  /**
   * `badVal` is not allowed for `arg`; suggests the most similar value (`Error::invalid_value`).
   *
   * @param {import('./command.js').Command} cmd
   * @param {string} badVal
   * @param {string[]} goodVals the possible values
   * @param {string} arg
   * @returns {ClapError}
   */
  static invalidValue(cmd, badVal, goodVals, arg) {
    const suggestion = didYouMean(badVal, goodVals).pop();
    const err = new ClapError(ErrorKind.InvalidValue).withCmd(cmd);
    err
      .insert(ContextKind.InvalidArg, cv.string(arg))
      .insert(ContextKind.InvalidValue, cv.string(badVal))
      .insert(ContextKind.ValidValue, cv.strings([...goodVals]));
    if (suggestion !== undefined) {
      err.insert(ContextKind.SuggestedValue, cv.string(suggestion));
    }
    return err;
  }

  /**
   * An unknown subcommand with similar ones to suggest (`Error::invalid_subcommand`).
   *
   * @param {import('./command.js').Command} cmd
   * @param {string} subcmd
   * @param {string[]} didYouMeanList the similar subcommands
   * @param {string} name the binary name for the `--` tip
   * @param {boolean} suggestedTrailingArg whether to add a tip to pass it as a value after `--`
   * @param {StyledStr | null} usage
   * @returns {ClapError}
   */
  static invalidSubcommand(cmd, subcmd, didYouMeanList, name, suggestedTrailingArg, usage) {
    const styles = cmd.getStyles();
    const err = new ClapError(ErrorKind.InvalidSubcommand).withCmd(cmd);
    const suggestions = [];
    if (suggestedTrailingArg) {
      suggestions.push(
        new StyledStr(
          `to pass '${paint(styles.getInvalid(), subcmd)}' as a value, use '${paint(
            styles.getValid(),
            `${name} -- ${subcmd}`,
          )}'`,
        ),
      );
    }
    err
      .insert(ContextKind.InvalidSubcommand, cv.string(subcmd))
      .insert(ContextKind.SuggestedSubcommand, cv.strings(didYouMeanList))
      .insert(ContextKind.Suggested, cv.styledStrs(suggestions));
    if (usage !== null) {
      err.insert(ContextKind.Usage, cv.styledStr(usage));
    }
    return err;
  }

  /**
   * An unknown subcommand without suggestions (`Error::unrecognized_subcommand`).
   *
   * @param {import('./command.js').Command} cmd
   * @param {string} subcmd
   * @param {StyledStr | null} usage
   * @returns {ClapError}
   */
  static unrecognizedSubcommand(cmd, subcmd, usage) {
    const err = new ClapError(ErrorKind.InvalidSubcommand).withCmd(cmd);
    err.insert(ContextKind.InvalidSubcommand, cv.string(subcmd));
    if (usage !== null) {
      err.insert(ContextKind.Usage, cv.styledStr(usage));
    }
    return err;
  }

  /**
   * Required arguments were not given (`Error::missing_required_argument`).
   *
   * @param {import('./command.js').Command} cmd
   * @param {string[]} required the missing arguments in usage form
   * @param {StyledStr | null} usage
   * @returns {ClapError}
   */
  static missingRequiredArgument(cmd, required, usage) {
    const err = new ClapError(ErrorKind.MissingRequiredArgument).withCmd(cmd);
    err.insert(ContextKind.InvalidArg, cv.strings(required));
    if (usage !== null) {
      err.insert(ContextKind.Usage, cv.styledStr(usage));
    }
    return err;
  }

  /**
   * `parent` needs a subcommand but none was given (`Error::missing_subcommand`).
   *
   * @param {import('./command.js').Command} cmd
   * @param {string} parent the name of the command
   * @param {string[]} available the subcommand names
   * @param {StyledStr | null} usage
   * @returns {ClapError}
   */
  static missingSubcommand(cmd, parent, available, usage) {
    const err = new ClapError(ErrorKind.MissingSubcommand).withCmd(cmd);
    err
      .insert(ContextKind.InvalidSubcommand, cv.string(parent))
      .insert(ContextKind.ValidSubcommand, cv.strings(available));
    if (usage !== null) {
      err.insert(ContextKind.Usage, cv.styledStr(usage));
    }
    return err;
  }

  /**
   * A value is not valid UTF-8 (`Error::invalid_utf8`).
   *
   * @param {import('./command.js').Command} cmd
   * @param {StyledStr | null} usage
   * @returns {ClapError}
   */
  static invalidUtf8(cmd, usage) {
    const err = new ClapError(ErrorKind.InvalidUtf8).withCmd(cmd);
    if (usage !== null) {
      err.insert(ContextKind.Usage, cv.styledStr(usage));
    }
    return err;
  }

  /**
   * `val` is one value too many for `arg` (`Error::too_many_values`).
   *
   * @param {import('./command.js').Command} cmd
   * @param {string} val
   * @param {string} arg
   * @param {StyledStr | null} usage
   * @returns {ClapError}
   */
  static tooManyValues(cmd, val, arg, usage) {
    const err = new ClapError(ErrorKind.TooManyValues).withCmd(cmd);
    err.insert(ContextKind.InvalidArg, cv.string(arg)).insert(ContextKind.InvalidValue, cv.string(val));
    if (usage !== null) {
      err.insert(ContextKind.Usage, cv.styledStr(usage));
    }
    return err;
  }

  /**
   * An argument that does not exist, with optional tips (`Error::unknown_argument`).
   *
   * @param {import('./command.js').Command} cmd
   * @param {string} arg
   * @param {[string, string | null] | null} didYouMeanArg a similar flag and the subcommand with it
   * @param {boolean} suggestedTrailingArg whether to add a tip to pass it as a value after `--`
   * @param {StyledStr | null} usage
   * @returns {ClapError}
   */
  static unknownArgument(cmd, arg, didYouMeanArg, suggestedTrailingArg, usage) {
    const styles = cmd.getStyles();
    const invalid = styles.getInvalid();
    const valid = styles.getValid();
    const err = new ClapError(ErrorKind.UnknownArgument).withCmd(cmd);
    const suggestions = [];
    if (suggestedTrailingArg) {
      suggestions.push(
        new StyledStr(`to pass '${paint(invalid, arg)}' as a value, use '${paint(valid, `-- ${arg}`)}'`),
      );
    }
    err.insert(ContextKind.InvalidArg, cv.string(arg));
    if (usage !== null) {
      err.insert(ContextKind.Usage, cv.styledStr(usage));
    }
    if (didYouMeanArg !== null) {
      const [flag, sub] = didYouMeanArg;
      if (sub !== null) {
        suggestions.push(new StyledStr(`'${paint(valid, `${sub} ${flag}`)}' exists`));
      } else {
        err.insert(ContextKind.SuggestedArg, cv.string(flag));
      }
    }
    if (suggestions.length > 0) {
      err.insert(ContextKind.Suggested, cv.styledStrs(suggestions));
    }
    return err;
  }

  /**
   * A subcommand name after `--`, with a tip to remove the `--` (`Error::unnecessary_double_dash`).
   *
   * @param {import('./command.js').Command} cmd
   * @param {string} arg
   * @param {StyledStr | null} usage
   * @returns {ClapError}
   */
  static unnecessaryDoubleDash(cmd, arg, usage) {
    const styles = cmd.getStyles();
    const err = new ClapError(ErrorKind.UnknownArgument).withCmd(cmd);
    const suggestion = new StyledStr(
      `subcommand '${paint(styles.getValid(), arg)}' exists; to use it, remove the '${paint(
        styles.getInvalid(),
        '--',
      )}' before it`,
    );
    err.insert(ContextKind.InvalidArg, cv.string(arg)).insert(ContextKind.Suggested, cv.styledStrs([suggestion]));
    if (usage !== null) {
      err.insert(ContextKind.Usage, cv.styledStr(usage));
    }
    return err;
  }
}

/**
 * The flag to suggest in "For more information, try ..." (`format::get_help_flag`).
 *
 * @param {import('./command.js').Command} cmd
 * @returns {string | null}
 */
function getHelpFlag(cmd) {
  if (!cmd.isDisableHelpFlagSet()) {
    return '--help';
  }
  if (cmd.hasSubcommands() && !cmd.isDisableHelpSubcommandSet()) {
    return 'help';
  }
  return null;
}

/**
 * Rust `Debug` formatting of a string (used to quote values containing whitespace).
 *
 * @param {string} s
 * @returns {string}
 */
function rustDebugStr(s) {
  const escaped = s.replace(/[\\"\n\r\t\0]/g, (c) => ({ '\\': '\\\\', '"': '\\"', '\n': '\\n', '\r': '\\r', '\t': '\\t', '\0': '\\0' })[c]);
  return `"${escaped}"`;
}

/**
 * Quotes a value with Rust `Debug` formatting if it contains Unicode whitespace (`format::Escape`,
 * `PossibleValue::get_visible_quoted_name`).
 *
 * @param {string} value
 * @returns {string}
 */
export function quoteIfWhitespace(value) {
  return Array.from(value).some((ch) => isRustWhitespace(ch.codePointAt(0)))
    ? rustDebugStr(value)
    : value;
}

/**
 * `RichFormatter::format_error`.
 *
 * @param {ClapError} error
 * @returns {StyledStr}
 */
function formatError(error) {
  const styles = error.styles;
  const valid = styles.getValid();
  const styled = new StyledStr();
  startError(styled, styles);

  if (!writeDynamicContext(error, styled, styles)) {
    styled.pushStr(KIND_MESSAGES[error.kind]);
  }

  let suggested = false;
  const suggestedSub = error.get(ContextKind.SuggestedSubcommand);
  if (suggestedSub !== undefined) {
    styled.pushStr('\n');
    if (!suggested) {
      styled.pushStr('\n');
      suggested = true;
    }
    didYouMeanTip(styled, styles, 'subcommand', suggestedSub);
  }
  const suggestedArg = error.get(ContextKind.SuggestedArg);
  if (suggestedArg !== undefined) {
    styled.pushStr('\n');
    if (!suggested) {
      styled.pushStr('\n');
      suggested = true;
    }
    didYouMeanTip(styled, styles, 'argument', suggestedArg);
  }
  const suggestedValue = error.get(ContextKind.SuggestedValue);
  if (suggestedValue !== undefined) {
    styled.pushStr('\n');
    if (!suggested) {
      styled.pushStr('\n');
      suggested = true;
    }
    didYouMeanTip(styled, styles, 'value', suggestedValue);
  }
  const suggestions = error.get(ContextKind.Suggested);
  if (suggestions !== undefined && suggestions.type === 'StyledStrs') {
    if (!suggested) {
      styled.pushStr('\n');
    }
    for (const suggestion of suggestions.value) {
      styled.pushStr(`\n${TAB}${paint(valid, 'tip:')} `);
      styled.pushStyled(suggestion);
    }
  }

  const usage = error.get(ContextKind.Usage);
  if (usage !== undefined && usage.type === 'StyledStr') {
    styled.pushStr('\n\n');
    styled.pushStyled(usage.value);
  }

  tryHelp(styled, styles, error.helpFlag);
  return styled;
}

function startError(styled, styles) {
  styled.pushStr(`${paint(styles.getError(), 'error:')} `);
}

function writeDynamicContext(error, styled, styles) {
  const valid = styles.getValid();
  const invalid = styles.getInvalid();
  const literal = styles.getLiteral();
  const invalidArg = error.get(ContextKind.InvalidArg);
  const invalidValue = error.get(ContextKind.InvalidValue);
  const invalidSub = error.get(ContextKind.InvalidSubcommand);

  switch (error.kind) {
    case ErrorKind.ArgumentConflict: {
      let prior = error.get(ContextKind.PriorArg);
      if (invalidArg !== undefined && invalidArg.type === 'String') {
        if (prior !== undefined && prior.type === 'String' && prior.value === invalidArg.value) {
          prior = undefined;
          styled.pushStr(`the argument '${paint(invalid, invalidArg.value)}' cannot be used multiple times`);
        } else {
          styled.pushStr(`the argument '${paint(invalid, invalidArg.value)}' cannot be used with`);
        }
      } else if (invalidSub !== undefined && invalidSub.type === 'String') {
        styled.pushStr(`the subcommand '${paint(invalid, invalidSub.value)}' cannot be used with`);
      } else {
        styled.pushStr(KIND_MESSAGES[error.kind]);
      }
      if (prior !== undefined) {
        if (prior.type === 'Strings') {
          styled.pushStr(':');
          for (const v of prior.value) {
            styled.pushStr(`\n${TAB}${paint(invalid, v)}`);
          }
        } else if (prior.type === 'String') {
          styled.pushStr(` '${paint(invalid, prior.value)}'`);
        } else {
          styled.pushStr(' one or more of the other specified arguments');
        }
      }
      return true;
    }
    case ErrorKind.InvalidValue: {
      if (invalidArg?.type === 'String' && invalidValue?.type === 'String') {
        if (invalidValue.value === '') {
          styled.pushStr(
            `a value is required for '${paint(invalid, invalidArg.value)}' but none was supplied`,
          );
        } else {
          styled.pushStr(
            `invalid value '${paint(invalid, invalidValue.value)}' for '${paint(literal, invalidArg.value)}'`,
          );
        }
        writeValuesList('possible values', styled, valid, error.get(ContextKind.ValidValue));
        return true;
      }
      return false;
    }
    case ErrorKind.InvalidSubcommand: {
      if (invalidSub?.type === 'String') {
        styled.pushStr(`unrecognized subcommand '${paint(invalid, invalidSub.value)}'`);
        return true;
      }
      return false;
    }
    case ErrorKind.MissingRequiredArgument: {
      if (invalidArg?.type === 'Strings') {
        styled.pushStr('the following required arguments were not provided:');
        for (const v of invalidArg.value) {
          styled.pushStr(`\n${TAB}${paint(valid, v)}`);
        }
        return true;
      }
      return false;
    }
    case ErrorKind.MissingSubcommand: {
      if (invalidSub?.type === 'String') {
        styled.pushStr(
          `'${paint(invalid, invalidSub.value)}' requires a subcommand but one was not provided`,
        );
        writeValuesList('subcommands', styled, valid, error.get(ContextKind.ValidSubcommand));
        return true;
      }
      return false;
    }
    case ErrorKind.TooManyValues: {
      if (invalidArg?.type === 'String' && invalidValue?.type === 'String') {
        styled.pushStr(
          `unexpected value '${paint(invalid, invalidValue.value)}' for '${paint(
            literal,
            invalidArg.value,
          )}' found; no more were expected`,
        );
        return true;
      }
      return false;
    }
    case ErrorKind.UnknownArgument: {
      if (invalidArg?.type === 'String') {
        styled.pushStr(`unexpected argument '${paint(invalid, invalidArg.value)}' found`);
        return true;
      }
      return false;
    }
    default:
      return false;
  }
}

function writeValuesList(listName, styled, valid, possibleValues) {
  if (possibleValues !== undefined && possibleValues.type === 'Strings' && possibleValues.value.length > 0) {
    styled.pushStr(`\n${TAB}[${listName}: `);
    possibleValues.value.forEach((val, idx) => {
      if (idx > 0) {
        styled.pushStr(', ');
      }
      styled.pushStr(paint(valid, quoteIfWhitespace(val)));
    });
    styled.pushStr(']');
  }
}

function tryHelp(styled, styles, help) {
  if (help !== null) {
    styled.pushStr(`\n\nFor more information, try '${paint(styles.getLiteral(), help)}'.\n`);
  } else {
    styled.pushStr('\n');
  }
}

function didYouMeanTip(styled, styles, context, possibles) {
  const valid = styles.getValid();
  styled.pushStr(`${TAB}${paint(valid, 'tip:')}`);
  if (possibles.type === 'String') {
    styled.pushStr(` a similar ${context} exists: '${paint(valid, possibles.value)}'`);
  } else if (possibles.type === 'Strings') {
    if (possibles.value.length === 1) {
      styled.pushStr(` a similar ${context} exists: `);
    } else {
      styled.pushStr(` some similar ${context}s exist: `);
    }
    possibles.value.forEach((possible, i) => {
      if (i !== 0) {
        styled.pushStr(', ');
      }
      styled.pushStr(`'${paint(valid, possible)}'`);
    });
  }
}
