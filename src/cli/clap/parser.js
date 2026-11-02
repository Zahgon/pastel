// Copyright (c) Individual contributors (clap); ported in sharkdp/pastel.
// SPDX-License-Identifier: MIT OR Apache-2.0
// Reimplements clap_builder 4.5.56 src/parser/parser.rs for the JavaScript port of
// sharkdp/pastel v0.12.0. Branches for features pastel does not use (hyphen values, `last`
// positionals, value terminators/delimiters, `require_equals`, flag subcommands, inference,
// `args_conflicts_with_subcommands`, external subcommands, overrides, groups, env) are left out.

import { ArgAction } from './arg.js';
import { ArgMatcher, ValueSource } from './arg_matcher.js';
import { ClapError } from './error.js';
import { InvalidOsStr, osStrDisplay } from './lex.js';
import { didYouMean, didYouMeanFlag } from './suggestions.js';
import { Usage } from './usage.js';
import { Validator } from './validator.js';

/** How an argument was identified. */
const Identifier = Object.freeze({ Short: 'Short', Long: 'Long', Index: 'Index' });

const EQUALS = 0x3d;

/** Parse states / results (`ParseState`, `ParseResult`). */
const VALUES_DONE = Object.freeze({ type: 'ValuesDone' });
const NO_ARG = Object.freeze({ type: 'NoArg' });
const MAYBE_HYPHEN_VALUE = Object.freeze({ type: 'MaybeHyphenValue' });
const opt = (id) => ({ type: 'Opt', id });
const pos = (id) => ({ type: 'Pos', id });

/**
 * The argument parser for one command (`Parser`).
 */
export class Parser {
  /**
   * @param {import('./command.js').Command} cmd
   */
  constructor(cmd) {
    this.cmd = cmd;
    this.curIdx = 0;
  }

  /**
   * Parses, applies defaults and validates (`get_matches_with`).
   *
   * @param {import('./arg_matcher.js').ArgMatcher} matcher
   * @param {import('./lex.js').RawArgs} rawArgs
   * @param {import('./lex.js').ArgCursor} cursor
   */
  getMatchesWith(matcher, rawArgs, cursor) {
    this.parse(matcher, rawArgs, cursor);
    this.resolvePending(matcher);
    this.addDefaults(matcher);
    new Validator(this.cmd).validate(matcher);
  }

  /**
   * The main loop over the arguments; a subcommand takes over the rest (`Parser::parse`).
   *
   * @param {import('./arg_matcher.js').ArgMatcher} matcher
   * @param {import('./lex.js').RawArgs} rawArgs
   * @param {import('./lex.js').ArgCursor} cursor
   */
  parse(matcher, rawArgs, cursor) {
    let subcmdName = null;
    let parseState = VALUES_DONE;
    let posCounter = 1;
    let trailingValues = false;

    for (let argOs = rawArgs.next(cursor); argOs !== null; argOs = rawArgs.next(cursor)) {
      if (!trailingValues) {
        if (parseState.type !== 'Opt' && parseState.type !== 'Pos') {
          const scName = this.possibleSubcommand(argOs.toValue());
          if (scName !== null) {
            if (scName === 'help' && !this.cmd.isDisableHelpSubcommandSet()) {
              this.parseHelpSubcommand(rawArgs.remaining(cursor));
            }
            subcmdName = scName;
            break;
          }
        }

        if (argOs.isEscape()) {
          trailingValues = true;
          continue;
        }
        const long = argOs.toLong();
        if (long !== null) {
          const [longArg, longValue] = long;
          const parseResult = this.parseLongArg(matcher, longArg, longValue);
          switch (parseResult.type) {
            case 'ValuesDone':
              parseState = VALUES_DONE;
              continue;
            case 'Opt':
              parseState = opt(parseResult.id);
              continue;
            case 'NoMatchingArg':
              this.resolvePendingIgnoringErrors(matcher);
              throw this.didYouMeanError(parseResult.arg, matcher, rawArgs.remaining(cursor), trailingValues);
            case 'UnneededAttachedValue':
              this.resolvePendingIgnoringErrors(matcher);
              throw ClapError.tooManyValues(
                this.cmd,
                parseResult.rest,
                parseResult.arg,
                new Usage(this.cmd).createUsageWithTitle(parseResult.used),
              );
            default:
              break;
          }
        } else {
          const shortArg = argOs.toShort();
          if (shortArg !== null) {
            const parseResult = this.parseShortArg(matcher, shortArg, parseState, posCounter);
            switch (parseResult.type) {
              case 'ValuesDone':
                parseState = VALUES_DONE;
                continue;
              case 'Opt':
                parseState = opt(parseResult.id);
                continue;
              case 'NoMatchingArg': {
                this.resolvePendingIgnoringErrors(matcher);
                const suggestedTrailingArg = !trailingValues && this.cmd.hasPositionals();
                throw ClapError.unknownArgument(
                  this.cmd,
                  parseResult.arg,
                  null,
                  suggestedTrailingArg,
                  new Usage(this.cmd).createUsageWithTitle([]),
                );
              }
              default:
                break;
            }
          }
        }

        if (parseState.type === 'Opt') {
          const arg = this.cmd.find(parseState.id);
          const argValues = matcher.pendingValuesMut(parseState.id, null);
          argValues.push(argOs.toValue());
          parseState = matcher.needsMoreVals(arg) ? opt(arg.getId()) : VALUES_DONE;
          continue;
        }
      }

      const arg = this.cmd.getKeymap().getPosition(posCounter);
      if (arg !== null) {
        if (matcher.pendingArgId() !== arg.getId() || !arg.isMultipleValuesSet()) {
          this.resolvePending(matcher);
        }
        const argValues = matcher.pendingValuesMut(arg.getId(), Identifier.Index);
        argValues.push(argOs.toValue());
        if (!arg.isMultiple()) {
          posCounter += 1;
          parseState = VALUES_DONE;
        } else {
          parseState = pos(arg.getId());
        }
      } else {
        this.resolvePendingIgnoringErrors(matcher);
        throw this.matchArgError(argOs, trailingValues);
      }
    }

    if (subcmdName !== null) {
      const scName = this.cmd.findSubcommand(subcmdName).getName();
      this.parseSubcommand(scName, matcher, rawArgs, cursor);
    }
  }

  /** Runs `resolve_pending` like clap's `let _ = self.resolve_pending(matcher)`. */
  resolvePendingIgnoringErrors(matcher) {
    try {
      this.resolvePending(matcher);
    } catch (err) {
      if (!(err instanceof ClapError)) {
        throw err;
      }
    }
  }

  /**
   * The error for an argument that no positional can take (`match_arg_error`).
   *
   * @param {import('./lex.js').ParsedArg} argOs
   * @param {boolean} trailingValues whether the argument comes after `--`
   * @returns {ClapError}
   */
  matchArgError(argOs, trailingValues) {
    const display = argOs.display();
    if (trailingValues && this.possibleSubcommand(argOs.toValue()) !== null) {
      return ClapError.unnecessaryDoubleDash(this.cmd, display, new Usage(this.cmd).createUsageWithTitle([]));
    }
    const suggestedTrailingArg =
      !trailingValues && this.cmd.hasPositionals() && (argOs.isLong() || argOs.isShort());

    if (this.cmd.hasSubcommands()) {
      const candidates = didYouMean(display, this.cmd.allSubcommandNames());
      if (candidates.length > 0) {
        return ClapError.invalidSubcommand(
          this.cmd,
          display,
          candidates,
          this.cmd.getBinNameFallback(),
          suggestedTrailingArg,
          new Usage(this.cmd).createUsageWithTitle([]),
        );
      }
      if (!this.cmd.hasPositionals()) {
        return ClapError.unrecognizedSubcommand(this.cmd, display, new Usage(this.cmd).createUsageWithTitle([]));
      }
    }
    return ClapError.unknownArgument(
      this.cmd,
      display,
      null,
      suggestedTrailingArg,
      new Usage(this.cmd).createUsageWithTitle([]),
    );
  }

  /** The subcommand `arg` names, by name or alias (`possible_subcommand`). */
  possibleSubcommand(arg) {
    const sc = this.cmd.findSubcommand(arg);
    return sc === undefined ? null : sc.getName();
  }

  /** `help <subcommand>...`: always ends in a help (or unrecognized subcommand) error. */
  parseHelpSubcommand(cmds) {
    let sc = this.cmd.clone();
    for (const name of cmds) {
      const found = sc.findSubcommand(name);
      if (found === undefined) {
        throw ClapError.unrecognizedSubcommand(sc, osStrDisplay(name), new Usage(sc).createUsageWithTitle([]));
      }
      sc = sc.buildSubcommand(found.getName());
    }
    throw new Parser(sc).helpErr(true);
  }

  /**
   * Parses the remaining arguments with a subcommand and stores its matches (`parse_subcommand`).
   *
   * @param {string} scName
   * @param {import('./arg_matcher.js').ArgMatcher} matcher
   * @param {import('./lex.js').RawArgs} rawArgs
   * @param {import('./lex.js').ArgCursor} cursor
   */
  parseSubcommand(scName, matcher, rawArgs, cursor) {
    const sc = this.cmd.buildSubcommand(scName);
    if (sc !== undefined) {
      const scMatcher = new ArgMatcher();
      new Parser(sc).getMatchesWith(scMatcher, rawArgs, cursor);
      matcher.subcommand(sc.getName(), scMatcher.intoInner());
    }
  }

  /**
   * Handles a `--long` or `--long=value` argument (`parse_long_arg`).
   *
   * @param {import('./arg_matcher.js').ArgMatcher} matcher
   * @param {string | InvalidOsStr} longArg the flag name
   * @param {string | InvalidOsStr | null} longValue the value after `=`, if any
   * @returns {{type: string}} the `ParseResult`
   */
  parseLongArg(matcher, longArg, longValue) {
    if (longArg instanceof InvalidOsStr) {
      return { type: 'NoMatchingArg', arg: longArg.toStringLossy() };
    }
    const arg = this.cmd.getKeymap().getLong(longArg);
    if (arg !== null) {
      if (arg.isTakesValueSet()) {
        return this.parseOptValue(Identifier.Long, longValue, arg, matcher);
      }
      if (longValue !== null) {
        const required = this.cmd.requiredGraph();
        const used = matcher
          .argIds()
          .filter((id) => matcher.checkExplicit(id))
          .filter((id) => {
            const a = this.cmd.find(id);
            return a === undefined ? true : !(a.isHideSet() || required.includes(a.getId()));
          });
        used.push(arg.getId());
        return { type: 'UnneededAttachedValue', rest: osStrDisplay(longValue), used, arg: arg.toString() };
      }
      return this.react(Identifier.Long, ValueSource.CommandLine, arg, [], matcher);
    }
    return { type: 'NoMatchingArg', arg: longArg };
  }

  /**
   * Handles a group of short flags, or a negative number taken as a value (`parse_short_arg`).
   *
   * @param {import('./arg_matcher.js').ArgMatcher} matcher
   * @param {object} shortArg the `ShortFlags` of the argument
   * @param {{type: string, id?: string}} parseState
   * @param {number} posCounter the index of the current positional
   * @returns {{type: string}} the `ParseResult`
   */
  parseShortArg(matcher, shortArg, parseState, posCounter) {
    if (
      (parseState.type === 'Opt' || parseState.type === 'Pos') &&
      this.cmd.find(parseState.id).isAllowNegativeNumbersSet() &&
      shortArg.isNegativeNumber()
    ) {
      return MAYBE_HYPHEN_VALUE;
    }
    const positional = this.cmd.getKeymap().getPosition(posCounter);
    if (positional !== null && positional.isAllowNegativeNumbersSet() && shortArg.isNegativeNumber()) {
      return MAYBE_HYPHEN_VALUE;
    }

    let ret = NO_ARG;
    for (let c = shortArg.nextFlag(); c !== null; c = shortArg.nextFlag()) {
      if (c instanceof InvalidOsStr) {
        return { type: 'NoMatchingArg', arg: `-${c.toStringLossy()}` };
      }
      const arg = this.cmd.getKeymap().getShort(c);
      if (arg !== null) {
        if (!arg.isTakesValueSet()) {
          ret = this.react(Identifier.Short, ValueSource.CommandLine, arg, [], matcher);
          continue;
        }
        let val = shortArg.clone().nextValueOs();
        if (val === '') {
          val = null;
        }
        if (val instanceof InvalidOsStr) {
          if (val.bytes[0] === EQUALS) {
            val = new InvalidOsStr(val.bytes.subarray(1));
          }
        } else if (val !== null && val.startsWith('=')) {
          val = val.slice(1);
        }
        return this.parseOptValue(Identifier.Short, val, arg, matcher);
      }
      return { type: 'NoMatchingArg', arg: `-${c}` };
    }
    return ret;
  }

  /**
   * Uses an attached value at once, otherwise waits for the following values (`parse_opt_value`).
   *
   * @param {string} ident one of {@link Identifier}
   * @param {string | InvalidOsStr | null} attachedValue
   * @param {import('./arg.js').Arg} arg
   * @param {import('./arg_matcher.js').ArgMatcher} matcher
   * @returns {{type: string}} the `ParseResult`
   */
  parseOptValue(ident, attachedValue, arg, matcher) {
    if (attachedValue !== null) {
      this.react(ident, ValueSource.CommandLine, arg, [attachedValue], matcher);
      return VALUES_DONE;
    }
    this.resolvePending(matcher);
    matcher.pendingValuesMut(arg.getId(), ident);
    return opt(arg.getId());
  }

  /**
   * Parses raw values and stores them, each with its own index (`push_arg_values`).
   *
   * @param {import('./arg.js').Arg} arg
   * @param {Array<string | InvalidOsStr>} rawVals
   * @param {import('./arg_matcher.js').ArgMatcher} matcher
   * @throws {ClapError} for invalid UTF-8 or a rejected value
   */
  pushArgValues(arg, rawVals, matcher) {
    for (const rawVal of rawVals) {
      this.curIdx += 1;
      // All value parsers that can see a user's value here want a `String`.
      if (rawVal instanceof InvalidOsStr) {
        throw ClapError.invalidUtf8(this.cmd, new Usage(this.cmd).createUsageWithTitle([]));
      }
      const val = arg.getValueParser().parseRef(this.cmd, arg, rawVal);
      matcher.addValTo(arg.getId(), val, rawVal);
      matcher.addIndexTo(arg.getId(), this.curIdx);
    }
  }

  /**
   * Acts on the pending values of an option or positional, if any (`resolve_pending`).
   *
   * @param {import('./arg_matcher.js').ArgMatcher} matcher
   */
  resolvePending(matcher) {
    const pending = matcher.takePending();
    if (pending === null) {
      return;
    }
    const arg = this.cmd.find(pending.id);
    this.react(pending.ident, ValueSource.CommandLine, arg, pending.rawVals, matcher);
  }

  /** Acts on an occurrence of `arg` according to its action (`Parser::react`). */
  react(ident, source, arg, rawVals, matcher) {
    this.resolvePending(matcher);
    if (source === ValueSource.CommandLine) {
      this.verifyNumArgs(arg, rawVals);
    }
    let vals = rawVals;
    if (vals.length === 0 && arg.defaultMissingVals.length > 0) {
      vals = [...arg.defaultMissingVals];
    }

    switch (arg.getAction()) {
      case ArgAction.Set:
      case ArgAction.Append:
        if (source === ValueSource.CommandLine && (ident === Identifier.Short || ident === Identifier.Long)) {
          this.curIdx += 1;
        }
        if (arg.getAction() === ArgAction.Set && matcher.remove(arg.getId())) {
          throw ClapError.argumentConflict(
            this.cmd,
            arg.toString(),
            [arg.toString()],
            new Usage(this.cmd).createUsageWithTitle([]),
          );
        }
        matcher.startCustomArg(arg, source);
        this.pushArgValues(arg, vals, matcher);
        return VALUES_DONE;
      case ArgAction.SetTrue: {
        const trueVals = vals.length === 0 ? ['true'] : vals;
        if (matcher.remove(arg.getId())) {
          throw ClapError.argumentConflict(
            this.cmd,
            arg.toString(),
            [arg.toString()],
            new Usage(this.cmd).createUsageWithTitle([]),
          );
        }
        matcher.startCustomArg(arg, source);
        this.pushArgValues(arg, trueVals, matcher);
        return VALUES_DONE;
      }
      case ArgAction.Help:
        throw this.helpErr(ident !== Identifier.Short);
      case ArgAction.Version:
        throw this.versionErr();
      default:
        throw new Error(`unsupported action ${arg.getAction()}`);
    }
  }

  /**
   * Rejects an occurrence without a required value or with too many values (`verify_num_args`).
   *
   * @param {import('./arg.js').Arg} arg
   * @param {Array<string | InvalidOsStr>} rawVals
   * @throws {ClapError}
   */
  verifyNumArgs(arg, rawVals) {
    const actual = rawVals.length;
    const expected = arg.getNumArgs();
    if (expected.minValues() > 0 && actual === 0) {
      const possible = arg.getPossibleValues().filter((pv) => !pv.isHideSet()).map((pv) => pv.getName());
      throw ClapError.emptyValue(this.cmd, possible, arg.toString());
    }
    const fixed = expected.numValues();
    if (fixed === null && expected.maxValues() < actual) {
      throw ClapError.tooManyValues(
        this.cmd,
        rawVals[rawVals.length - 1],
        arg.toString(),
        new Usage(this.cmd).createUsageWithTitle([]),
      );
    }
  }

  /**
   * Applies the default values of the arguments that were not given (`add_defaults`).
   *
   * @param {import('./arg_matcher.js').ArgMatcher} matcher
   */
  addDefaults(matcher) {
    for (const arg of this.cmd.getArguments()) {
      if (arg.defaultVals.length > 0 && !matcher.contains(arg.getId())) {
        this.react(null, ValueSource.DefaultValue, arg, [...arg.defaultVals], matcher);
      }
    }
  }

  /** Unknown `--flag`, with a suggestion of a similar flag (`did_you_mean_error`). */
  didYouMeanError(arg, matcher, remainingArgs, trailingValues) {
    const longs = this.cmd.getKeymap().longs();
    const didYouMeanResult = didYouMeanFlag(arg, remainingArgs, longs, this.cmd.getSubcommands());
    if (didYouMeanResult !== null) {
      const known = this.cmd.getKeymap().getLong(didYouMeanResult[0]);
      if (known !== null) {
        matcher.startCustomArg(known, ValueSource.CommandLine);
      }
    }
    const suggestion = didYouMeanResult === null ? null : [`--${didYouMeanResult[0]}`, didYouMeanResult[1]];
    const required = this.cmd.requiredGraph();
    const used = matcher
      .argIds()
      .filter((id) => matcher.checkExplicit(id))
      .filter((id) => {
        const a = this.cmd.find(id);
        return a !== undefined && !a.isHideSet();
      });
    const suggestedTrailingArg = suggestion === null && !trailingValues && this.cmd.hasPositionals();
    return ClapError.unknownArgument(
      this.cmd,
      `--${arg}`,
      suggestion,
      suggestedTrailingArg,
      new Usage(this.cmd).required(required).createUsageWithTitle(used),
    );
  }

  /**
   * @param {boolean} useLong whether to show the long help
   * @returns {ClapError} the help output as an "error" (`help_err`)
   */
  helpErr(useLong) {
    return ClapError.displayHelp(this.cmd, this.cmd.writeHelpErr(useLong));
  }

  /** @returns {ClapError} the version output as an "error" (`version_err`) */
  versionErr() {
    return ClapError.displayVersion(this.cmd, this.cmd.writeVersionErr());
  }
}
