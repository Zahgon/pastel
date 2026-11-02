// Copyright (c) Individual contributors (clap); ported in sharkdp/pastel.
// SPDX-License-Identifier: MIT OR Apache-2.0
// Reimplements clap_builder 4.5.56 src/output/usage.rs (with the `usage` feature; argument groups
// and `requires` relations are not used by pastel) for the JavaScript port of sharkdp/pastel
// v0.12.0.

import { ArgAction } from './arg.js';
import { paint } from './styling.js';
import { StyledStr } from './styled_str.js';

const DEFAULT_SUB_VALUE_NAME = 'COMMAND';

/**
 * Builds usage strings for a command.
 */
export class Usage {
  /**
   * @param {import('./command.js').Command} cmd
   */
  constructor(cmd) {
    this.cmd = cmd;
    this.styles = cmd.getStyles();
    this.requiredIds = null;
  }

  /**
   * Uses an explicit list of required argument ids (`Usage::required`).
   *
   * @param {string[]} required
   * @returns {Usage} this
   */
  required(required) {
    this.requiredIds = required;
    return this;
  }

  /** @returns {string[]} the required argument ids: the explicit list or the command's own */
  getRequired() {
    return this.requiredIds ?? this.cmd.requiredGraph();
  }

  /**
   * `Usage: ...` for errors; `used` are the ids of the arguments already given.
   *
   * @param {string[]} used
   * @returns {StyledStr}
   */
  createUsageWithTitle(used) {
    const usage = this.styles.getUsage();
    const styled = new StyledStr(`${usage.render()}Usage:${usage.renderReset()} `);
    this.writeUsageNoTitle(styled, used);
    styled.trimEnd();
    return styled;
  }

  /**
   * The usage without its title, as shown in help.
   *
   * @param {string[]} used
   * @returns {StyledStr}
   */
  createUsageNoTitle(used) {
    const styled = new StyledStr();
    this.writeUsageNoTitle(styled, used);
    styled.trimEnd();
    return styled;
  }

  /**
   * The smart usage if arguments were `used`, the help usage otherwise (`write_usage_no_title`).
   *
   * @param {StyledStr} styled
   * @param {string[]} used
   */
  writeUsageNoTitle(styled, used) {
    if (used.length === 0) {
      this.writeHelpUsage(styled);
    } else {
      this.writeSmartUsage(styled, used);
    }
  }

  /**
   * The general usage as shown in help messages (`write_help_usage`).
   *
   * @param {StyledStr} styled
   */
  writeHelpUsage(styled) {
    this.writeArgUsage(styled, [], true);
    this.writeSubcommandUsage(styled);
  }

  /**
   * The context-aware usage from the `used` and the required arguments (`write_smart_usage`).
   *
   * @param {StyledStr} styled
   * @param {string[]} used
   */
  writeSmartUsage(styled, used) {
    const placeholder = this.styles.getPlaceholder();
    this.writeArgUsage(styled, used, true);
    if (this.cmd.isSubcommandRequiredSet()) {
      styled.pushStr(paint(placeholder, `<${DEFAULT_SUB_VALUE_NAME}>`));
    }
  }

  /**
   * The binary name, `[OPTIONS]` if needed and the arguments (`write_arg_usage`).
   *
   * @param {StyledStr} styled
   * @param {string[]} used
   * @param {boolean} inclReqs `false` shows every argument as optional
   */
  writeArgUsage(styled, used, inclReqs) {
    const literal = this.styles.getLiteral();
    const placeholder = this.styles.getPlaceholder();
    const binName = this.cmd.getUsageNameFallback();
    if (binName !== '') {
      styled.pushStr(`${paint(literal, binName)} `);
    }
    if (used.length === 0 && this.needsOptionsTag()) {
      styled.pushStr(`${paint(placeholder, '[OPTIONS]')} `);
    }
    this.writeArgs(styled, used, !inclReqs);
  }

  /**
   * The `<COMMAND>` or `[COMMAND]` placeholder, given visible subcommands
   * (`write_subcommand_usage`).
   *
   * @param {StyledStr} styled
   */
  writeSubcommandUsage(styled) {
    if (this.cmd.hasVisibleSubcommands()) {
      const placeholder = this.styles.getPlaceholder();
      if (this.cmd.isSubcommandRequiredSet()) {
        styled.pushStr(paint(placeholder, `<${DEFAULT_SUB_VALUE_NAME}>`));
      } else {
        styled.pushStr(paint(placeholder, `[${DEFAULT_SUB_VALUE_NAME}]`));
      }
    }
  }

  /** @returns {boolean} whether `[OPTIONS]` is needed in the usage string */
  needsOptionsTag() {
    for (const f of this.cmd.getNonPositionals()) {
      if (f.getLong() === 'help' || f.getLong() === 'version') {
        continue;
      }
      const action = f.getAction();
      if (action === ArgAction.Help || action === ArgAction.Version) {
        continue;
      }
      if (f.isHideSet() || f.isRequiredSet()) {
        continue;
      }
      return true;
    }
    return false;
  }

  /**
   * The required arguments plus `incls` in usage form (`Usage::write_args`).
   *
   * @param {StyledStr} styled
   * @param {string[]} incls
   * @param {boolean} forceOptional
   */
  writeArgs(styled, incls, forceOptional) {
    const requiredOpts = [];
    const requiredPositionals = [];
    for (const req of [...this.getRequired(), ...incls]) {
      const arg = this.cmd.find(req);
      if (arg === undefined) {
        continue;
      }
      const stylized = arg.stylized(this.styles, !forceOptional);
      if (arg.getIndex() !== null) {
        requiredPositionals[arg.getIndex()] = stylized;
      } else if (!requiredOpts.some((o) => o.ansi() === stylized.ansi())) {
        requiredOpts.push(stylized);
      }
    }

    for (const pos of this.cmd.getPositionals()) {
      if (pos.isHideSet()) {
        continue;
      }
      const index = pos.getIndex();
      if (requiredPositionals[index] === undefined) {
        requiredPositionals[index] = pos.stylized(this.styles, false);
      }
    }

    if (!forceOptional) {
      for (const arg of requiredOpts) {
        styled.pushStyled(arg);
        styled.pushStr(' ');
      }
    }
    for (const arg of requiredPositionals) {
      if (arg !== undefined) {
        styled.pushStyled(arg);
        styled.pushStr(' ');
      }
    }
  }

  /**
   * The usage forms of the required arguments that are not present (`get_required_usage_from`).
   *
   * @param {string[]} incls
   * @param {import('./arg_matcher.js').ArgMatcher | null} matcher
   * @returns {StyledStr[]}
   */
  getRequiredUsageFrom(incls, matcher) {
    const requiredOpts = [];
    const requiredPositionals = [];
    for (const req of [...this.getRequired(), ...incls]) {
      const arg = this.cmd.find(req);
      if (arg === undefined) {
        continue;
      }
      const isPresent = matcher !== null && matcher.checkExplicit(req);
      if (isPresent) {
        continue;
      }
      const stylized = arg.stylized(this.styles, true);
      if (arg.getIndex() !== null) {
        requiredPositionals[arg.getIndex()] = stylized;
      } else if (!requiredOpts.some((o) => o.ansi() === stylized.ansi())) {
        requiredOpts.push(stylized);
      }
    }
    return [...requiredOpts, ...requiredPositionals.filter((p) => p !== undefined)];
  }
}
