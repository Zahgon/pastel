// Copyright (c) Individual contributors (clap).
// SPDX-License-Identifier: MIT OR Apache-2.0
// Reimplements clap_builder 4.5.56 src/parser/validator.rs (pastel has no conflicts, groups or
// conditional requirements, so only `arg_required_else_help`, `subcommand_required` and required
// arguments are checked) for the JavaScript port of sharkdp/pastel v0.12.0.

import { ClapError } from './error.js';
import { Usage } from './usage.js';

/**
 * Validates the matches of one command after parsing (`Validator`).
 */
export class Validator {
  /**
   * @param {import('./command.js').Command} cmd
   */
  constructor(cmd) {
    this.cmd = cmd;
    this.required = cmd.requiredGraph();
  }

  /**
   * @param {import('./arg_matcher.js').ArgMatcher} matcher
   * @throws {ClapError}
   */
  validate(matcher) {
    const hasSubcmd = matcher.subcommandName() !== null;
    if (!hasSubcmd && this.cmd.isArgRequiredElseHelpSet()) {
      const numUserValues = matcher.args().filter(([, ma]) => ma.checkExplicit()).length;
      if (numUserValues === 0) {
        throw ClapError.displayHelpError(this.cmd, this.cmd.writeHelpErr(false));
      }
    }
    if (!hasSubcmd && this.cmd.isSubcommandRequiredSet()) {
      throw ClapError.missingSubcommand(
        this.cmd,
        this.cmd.getBinNameFallback(),
        this.cmd.allSubcommandNames(),
        new Usage(this.cmd).required(this.required).createUsageWithTitle([]),
      );
    }
    this.validateRequired(matcher);
  }

  validateRequired(matcher) {
    const missingRequired = [];
    let highestIndex = 0;
    for (const id of this.required.filter((r) => !matcher.checkExplicit(r))) {
      const arg = this.cmd.find(id);
      missingRequired.push(arg.getId());
      highestIndex = Math.max(highestIndex, arg.getIndex() ?? 0);
    }
    // For display purposes, include all of the preceding positional arguments.
    for (const p of this.cmd.getPositionals().filter((a) => !matcher.checkExplicit(a.getId()))) {
      if (p.getIndex() < highestIndex) {
        missingRequired.push(p.getId());
      }
    }
    if (missingRequired.length > 0) {
      this.missingRequiredError(matcher, missingRequired);
    }
  }

  missingRequiredError(matcher, rawReqArgs) {
    const usg = new Usage(this.cmd).required(this.required);
    const reqArgs = usg.getRequiredUsageFrom(rawReqArgs, matcher).map((s) => s.toString());
    const used = matcher
      .args()
      .filter(([, ma]) => ma.checkExplicit())
      .map(([id]) => id)
      .filter((id) => {
        const a = this.cmd.find(id);
        return a !== undefined && !a.isHideSet();
      })
      .concat(rawReqArgs);
    throw ClapError.missingRequiredArgument(this.cmd, reqArgs, usg.createUsageWithTitle(used));
  }
}
