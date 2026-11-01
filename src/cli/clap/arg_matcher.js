// Copyright (c) Individual contributors (clap).
// SPDX-License-Identifier: MIT OR Apache-2.0
// Reimplements clap_builder 4.5.56 src/parser/{arg_matcher.rs, matches/{arg_matches,matched_arg,
// value_source}.rs} (the parts sharkdp/pastel v0.12.0 uses) for its JavaScript port.

/** Where a value came from (`ValueSource`), ordered by precedence. */
export const ValueSource = Object.freeze({
  DefaultValue: 0,
  CommandLine: 2,
});

/**
 * The values of one argument (`MatchedArg`), grouped by occurrence.
 */
class MatchedArg {
  constructor() {
    this.source = null;
    this.indices = [];
    this.vals = [];
    this.rawVals = [];
  }

  /**
   * Keeps the source of highest precedence (`set_source`).
   *
   * @param {number} source one of {@link ValueSource}
   */
  setSource(source) {
    this.source = this.source === null ? source : Math.max(this.source, source);
  }

  /** Starts the value group of a new occurrence (`new_val_group`). */
  newValGroup() {
    this.vals.push([]);
    this.rawVals.push([]);
  }

  /**
   * Adds a value to the current group (`append_val`).
   *
   * @param {any} val the parsed value
   * @param {string} rawVal the value as typed
   */
  appendVal(val, rawVal) {
    this.vals[this.vals.length - 1].push(val);
    this.rawVals[this.rawVals.length - 1].push(rawVal);
  }

  /** @returns {boolean} present and not only from a default value (`check_explicit(IsPresent)`) */
  checkExplicit() {
    return this.source !== ValueSource.DefaultValue;
  }
}

/**
 * The result of a successful parse (`ArgMatches`).
 */
export class ArgMatches {
  constructor() {
    /** @type {Map<string, MatchedArg>} insertion-ordered like clap's FlatMap */
    this.args = new Map();
    /** @type {{name: string, matches: ArgMatches} | null} */
    this.subcommandValue = null;
  }

  /**
   * The first value of an argument, defaults included (`get_one`).
   *
   * @param {string} id
   * @returns {any} the value as typed on the command line, or `undefined`
   */
  getOne(id) {
    const ma = this.args.get(id);
    if (ma === undefined) {
      return undefined;
    }
    for (const group of ma.vals) {
      if (group.length > 0) {
        return group[0];
      }
    }
    return undefined;
  }

  /**
   * All values of an argument over all occurrences (`get_many`).
   *
   * @param {string} id
   * @returns {any[] | undefined}
   */
  getMany(id) {
    const ma = this.args.get(id);
    return ma === undefined ? undefined : ma.vals.flat();
  }

  /**
   * The state of an `ArgAction::SetTrue` flag (`get_flag`).
   *
   * @param {string} id
   * @returns {boolean}
   */
  getFlag(id) {
    return this.getOne(id) === true;
  }

  /** @returns {[string, ArgMatches] | null} the name and matches of the used subcommand */
  subcommand() {
    return this.subcommandValue === null ? null : [this.subcommandValue.name, this.subcommandValue.matches];
  }

  /** @returns {string | null} the name of the used subcommand */
  subcommandName() {
    return this.subcommandValue === null ? null : this.subcommandValue.name;
  }
}

/**
 * Collects matches while parsing (`ArgMatcher`), including the values of an option or positional
 * that are still pending.
 */
export class ArgMatcher {
  constructor() {
    this.matches = new ArgMatches();
    this.pending = null;
  }

  /** @returns {ArgMatches} the collected matches (`into_inner`) */
  intoInner() {
    return this.matches;
  }

  /**
   * @param {string} id
   * @returns {MatchedArg | undefined}
   */
  get(id) {
    return this.matches.args.get(id);
  }

  /**
   * @param {string} id
   * @returns {boolean} whether `id` was matched before its removal
   */
  remove(id) {
    return this.matches.args.delete(id);
  }

  /**
   * @param {string} id
   * @returns {boolean}
   */
  contains(id) {
    return this.matches.args.has(id);
  }

  /** @returns {string[]} the ids of all matched arguments, in insertion order */
  argIds() {
    return [...this.matches.args.keys()];
  }

  /** @returns {Array<[string, MatchedArg]>} */
  args() {
    return [...this.matches.args.entries()];
  }

  /**
   * Records the used subcommand and its matches.
   *
   * @param {string} name
   * @param {ArgMatches} matches
   */
  subcommand(name, matches) {
    this.matches.subcommandValue = { name, matches };
  }

  /** @returns {string | null} the name of the used subcommand */
  subcommandName() {
    return this.matches.subcommandName();
  }

  /**
   * @param {string} id
   * @returns {boolean} present and not only from a default value (`check_explicit(IsPresent)`)
   */
  checkExplicit(id) {
    const ma = this.get(id);
    return ma !== undefined && ma.checkExplicit();
  }

  /**
   * Starts an occurrence of `arg`, creating its entry if needed (`start_custom_arg`).
   *
   * @param {import('./arg.js').Arg} arg
   * @param {number} source one of {@link ValueSource}
   */
  startCustomArg(arg, source) {
    let ma = this.matches.args.get(arg.getId());
    if (ma === undefined) {
      ma = new MatchedArg();
      this.matches.args.set(arg.getId(), ma);
    }
    ma.setSource(source);
    ma.newValGroup();
  }

  /**
   * Adds a value to the current occurrence of `id` (`add_val_to`).
   *
   * @param {string} id
   * @param {any} val the parsed value
   * @param {string} rawVal the value as typed
   */
  addValTo(id, val, rawVal) {
    this.get(id).appendVal(val, rawVal);
  }

  /**
   * Records the command-line index of a value of `id` (`add_index_to`).
   *
   * @param {string} id
   * @param {number} idx
   */
  addIndexTo(id, idx) {
    this.get(id).indices.push(idx);
  }

  /**
   * Whether `arg` accepts another value on top of its pending ones (`needs_more_vals`).
   *
   * @param {import('./arg.js').Arg} arg
   * @returns {boolean}
   */
  needsMoreVals(arg) {
    const numPending = this.pending !== null && this.pending.id === arg.getId() ? this.pending.rawVals.length : 0;
    return arg.getNumArgs().acceptsMore(numPending);
  }

  /** @returns {string | null} the id of the argument with pending values (`pending_arg_id`) */
  pendingArgId() {
    return this.pending === null ? null : this.pending.id;
  }

  /**
   * The pending values of `id`, starting a pending entry if there is none.
   *
   * @param {string} id
   * @param {string | null} ident `Short`, `Long` or `Index`
   * @returns {string[]}
   */
  pendingValuesMut(id, ident) {
    if (this.pending === null) {
      this.pending = { id, ident, rawVals: [] };
    }
    return this.pending.rawVals;
  }

  /**
   * Hands over the pending entry and clears it (`take_pending`).
   *
   * @returns {{id: string, ident: string | null,
   *            rawVals: Array<string | import('./lex.js').InvalidOsStr>} | null}
   */
  takePending() {
    const pending = this.pending;
    this.pending = null;
    return pending;
  }
}
