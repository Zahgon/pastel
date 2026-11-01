// Copyright (c) Individual contributors (clap).
// SPDX-License-Identifier: MIT OR Apache-2.0
// Reimplements the parts of clap_builder 4.5.56 src/builder/command.rs that sharkdp/pastel v0.12.0
// uses (building, bin/usage names, the auto-generated help/version flags and help subcommand,
// help/version rendering, `try_get_matches_from`) for its JavaScript port.

import { Arg, ArgAction, ValueRange } from './arg.js';
import { ArgMatcher } from './arg_matcher.js';
import { MKeyMap } from './mkeymap.js';
import { Parser } from './parser.js';
import { ColorChoice } from './stream.js';
import { Styles } from './styling.js';
import { StyledStr } from './styled_str.js';
import { termWidth, writeHelp } from './help_template.js';
import { RawArgs, restoreInvalidUtf8 } from './lex.js';
import { Usage } from './usage.js';

/** Command settings (`AppSettings`). */
const AppSettings = Object.freeze({
  ArgRequiredElseHelp: 'ArgRequiredElseHelp',
  SubcommandRequired: 'SubcommandRequired',
  AllowNegativeNumbers: 'AllowNegativeNumbers',
  DisableHelpFlag: 'DisableHelpFlag',
  DisableVersionFlag: 'DisableVersionFlag',
  DisableHelpSubcommand: 'DisableHelpSubcommand',
  ColorAuto: 'ColorAuto',
  ColorAlways: 'ColorAlways',
  ColorNever: 'ColorNever',
  Hidden: 'Hidden',
  Built: 'Built',
});

const HELP_ABOUT = 'Print this message or the help of the given subcommand(s)';

/**
 * Rust `Path::file_name` of a program path, as a string (or `null`).
 *
 * @param {string} path
 * @returns {string | null}
 */
function fileName(path) {
  const parts = path.split('/').filter((p) => p !== '' && p !== '.');
  if (parts.length === 0) {
    return null;
  }
  const last = parts[parts.length - 1];
  return last === '..' ? null : last;
}

/**
 * A command-line program or subcommand (`clap::Command`).
 */
export class Command {
  /**
   * @param {string} name
   */
  constructor(name) {
    this.name = name;
    this.binName = null;
    this.displayName = null;
    this.usageName = null;
    this.versionValue = null;
    this.aboutValue = null;
    this.longAboutValue = null;
    /** @type {Array<[string, boolean]>} */
    this.aliases = [];
    this.dispOrd = null;
    this.settings = new Set();
    this.gSettings = new Set();
    this.args = new MKeyMap();
    /** @type {Command[]} */
    this.subcommands = [];
    this.currentDispOrd = 0;
    this.longHelpExistsValue = false;
    /** Extensions propagated to subcommands (`app_ext`): styles, max term width, render context. */
    this.appExt = { styles: Styles.styled(), maxTermWidth: null, ctx: {} };
  }

  /** @returns {Command} a deep copy */
  clone() {
    const copy = Object.assign(Object.create(Command.prototype), this);
    copy.aliases = this.aliases.map((a) => [...a]);
    copy.settings = new Set(this.settings);
    copy.gSettings = new Set(this.gSettings);
    copy.args = this.args.clone();
    copy.subcommands = this.subcommands.map((s) => s.clone());
    copy.appExt = { ...this.appExt };
    copy.aboutValue = this.aboutValue === null ? null : this.aboutValue.clone();
    copy.longAboutValue = this.longAboutValue === null ? null : this.longAboutValue.clone();
    return copy;
  }

  // ----- Builder methods -----

  /**
   * Adds an argument (`Command::arg`).
   *
   * @param {Arg} arg
   * @returns {Command} this
   */
  arg(arg) {
    if (this.currentDispOrd !== null && !arg.isPositional()) {
      arg.dispOrd ??= this.currentDispOrd;
      this.currentDispOrd += 1;
    }
    this.args.push(arg);
    return this;
  }

  /**
   * Adds a subcommand (`Command::subcommand`).
   *
   * @param {Command} subcmd
   * @returns {Command} this
   */
  subcommand(subcmd) {
    if (this.currentDispOrd !== null) {
      subcmd.dispOrd ??= this.currentDispOrd;
      this.currentDispOrd += 1;
    }
    this.subcommands.push(subcmd);
    return this;
  }

  /**
   * @param {string} ver
   * @returns {Command} this
   */
  version(ver) {
    this.versionValue = ver;
    return this;
  }

  /**
   * @param {string} about
   * @returns {Command} this
   */
  about(about) {
    this.aboutValue = new StyledStr(about);
    return this;
  }

  /**
   * @param {string} longAbout
   * @returns {Command} this
   */
  longAbout(longAbout) {
    this.longAboutValue = new StyledStr(longAbout);
    return this;
  }

  /**
   * Adds a hidden alias.
   *
   * @param {string} name
   * @returns {Command} this
   */
  alias(name) {
    this.aliases.push([name, false]);
    return this;
  }

  /**
   * Display order for subsequently added args and subcommands (`null` = unordered, 999).
   *
   * @param {number | null} dispOrd
   * @returns {Command} this
   */
  nextDisplayOrder(dispOrd) {
    this.currentDispOrd = dispOrd;
    return this;
  }

  /**
   * @param {string} color one of {@link ColorChoice}
   * @returns {Command} this
   */
  color(color) {
    for (const s of [AppSettings.ColorAuto, AppSettings.ColorAlways, AppSettings.ColorNever]) {
      this.settings.delete(s);
      this.gSettings.delete(s);
    }
    const setting = { Auto: AppSettings.ColorAuto, Always: AppSettings.ColorAlways, Never: AppSettings.ColorNever }[color];
    this.settings.add(setting);
    this.gSettings.add(setting);
    return this;
  }

  setting(name, yes) {
    if (yes) {
      this.settings.add(name);
    } else {
      this.settings.delete(name);
    }
    return this;
  }

  /**
   * @param {boolean} yes
   * @returns {Command} this
   */
  allowNegativeNumbers(yes) {
    return this.setting(AppSettings.AllowNegativeNumbers, yes);
  }

  /**
   * No-op since clap 4 (always on).
   *
   * @returns {Command} this
   */
  dontCollapseArgsInUsage() {
    return this;
  }

  /**
   * @param {number} width
   * @returns {Command} this
   */
  maxTermWidth(width) {
    this.appExt.maxTermWidth = width;
    return this;
  }

  /**
   * @param {boolean} yes
   * @returns {Command} this
   */
  subcommandRequired(yes) {
    return this.setting(AppSettings.SubcommandRequired, yes);
  }

  /**
   * @param {boolean} yes
   * @returns {Command} this
   */
  argRequiredElseHelp(yes) {
    return this.setting(AppSettings.ArgRequiredElseHelp, yes);
  }

  // ----- Reflection -----

  isSet(s) {
    return this.settings.has(s) || this.gSettings.has(s);
  }

  /** @returns {string} */
  getName() {
    return this.name;
  }

  /** @returns {string} */
  getBinNameFallback() {
    return this.binName ?? this.name;
  }

  /** @returns {string} */
  getUsageNameFallback() {
    return this.usageName ?? this.getBinNameFallback();
  }

  /** @returns {number} */
  getDisplayOrder() {
    return this.dispOrd ?? 999;
  }

  /** @returns {StyledStr | null} */
  getAbout() {
    return this.aboutValue;
  }

  /** @returns {StyledStr | null} */
  getLongAbout() {
    return this.longAboutValue;
  }

  /** @returns {Styles} */
  getStyles() {
    return this.appExt.styles;
  }

  /** @returns {number | null} */
  getMaxTermWidth() {
    return this.appExt.maxTermWidth;
  }

  /** @returns {number} the width help is wrapped at */
  helpTermWidth() {
    return termWidth(this, this.appExt.ctx);
  }

  /** @returns {string} one of {@link ColorChoice} */
  getColor() {
    if (this.isSet(AppSettings.ColorNever)) {
      return ColorChoice.Never;
    }
    if (this.isSet(AppSettings.ColorAlways)) {
      return ColorChoice.Always;
    }
    return ColorChoice.Auto;
  }

  /** @returns {string} the colour choice for help output */
  colorHelp() {
    return this.getColor();
  }

  /** @returns {Command[]} */
  getSubcommands() {
    return this.subcommands;
  }

  /** @returns {boolean} */
  hasSubcommands() {
    return this.subcommands.length > 0;
  }

  /** @returns {Arg[]} */
  getArguments() {
    return this.args.args;
  }

  /** @returns {Arg[]} */
  getPositionals() {
    return this.getArguments().filter((a) => a.isPositional());
  }

  /** @returns {Arg[]} */
  getNonPositionals() {
    return this.getArguments().filter((a) => !a.isPositional());
  }

  /** @returns {MKeyMap} */
  getKeymap() {
    return this.args;
  }

  /**
   * @param {string} id
   * @returns {Arg | undefined}
   */
  find(id) {
    return this.getArguments().find((a) => a.getId() === id);
  }

  /** @returns {boolean} */
  hasPositionals() {
    return this.getPositionals().length > 0;
  }

  /** @returns {boolean} subcommands other than `help` that are not hidden */
  hasVisibleSubcommands() {
    return this.subcommands.some((sc) => sc.name !== 'help' && !sc.isSet(AppSettings.Hidden));
  }

  /** @returns {boolean} */
  isHideSet() {
    return this.isSet(AppSettings.Hidden);
  }

  /** @returns {boolean} */
  isDisableHelpFlagSet() {
    return this.isSet(AppSettings.DisableHelpFlag);
  }

  /** @returns {boolean} */
  isDisableVersionFlagSet() {
    return this.isSet(AppSettings.DisableVersionFlag) || this.versionValue === null;
  }

  /** @returns {boolean} */
  isDisableHelpSubcommandSet() {
    return this.isSet(AppSettings.DisableHelpSubcommand);
  }

  /** @returns {boolean} */
  isArgRequiredElseHelpSet() {
    return this.isSet(AppSettings.ArgRequiredElseHelp);
  }

  /** @returns {boolean} */
  isAllowNegativeNumbersSet() {
    return this.isSet(AppSettings.AllowNegativeNumbers);
  }

  /** @returns {boolean} */
  isSubcommandRequiredSet() {
    return this.isSet(AppSettings.SubcommandRequired);
  }

  /**
   * @param {string} name
   * @returns {boolean} `name` is this command's name or one of its aliases
   */
  aliasesTo(name) {
    return this.name === name || this.aliases.some(([alias]) => alias === name);
  }

  /**
   * @param {string} name
   * @returns {Command | undefined}
   */
  findSubcommand(name) {
    return this.subcommands.find((s) => s.aliasesTo(name));
  }

  /** @returns {string[]} names and aliases of all subcommands, for suggestions */
  allSubcommandNames() {
    return this.subcommands.flatMap((sc) => [sc.name, ...sc.aliases.map(([alias]) => alias)]);
  }

  /** @returns {string[]} the ids of the required arguments (`required_graph`) */
  requiredGraph() {
    return this.getArguments().filter((a) => a.isRequiredSet()).map((a) => a.getId());
  }

  /** @returns {boolean} */
  longHelpExists() {
    return this.longHelpExistsValue;
  }

  // ----- Building -----

  /**
   * Prepares the command for parsing and help rendering (`Command::_build_self`).
   */
  buildSelf() {
    if (this.settings.has(AppSettings.Built)) {
      return;
    }
    for (const s of this.gSettings) {
      this.settings.add(s);
    }
    if (!this.hasSubcommands()) {
      this.settings.add(AppSettings.DisableHelpSubcommand);
    }
    this.propagate();
    this.checkHelpAndVersion();

    let posCounter = 1;
    for (const a of this.args.args) {
      a.build();
      if (a.isPositional() && a.index === null) {
        a.index = posCounter;
        posCounter += 1;
      }
    }
    this.args.build();

    const allowNegative = this.isAllowNegativeNumbersSet();
    for (const arg of this.args.args) {
      if (allowNegative && arg.isTakesValueSet()) {
        arg.settings.add('allowNegativeNumbers');
      }
    }
    this.settings.add(AppSettings.Built);
  }

  /** Propagates global settings and extensions to the subcommands (`_propagate`). */
  propagate() {
    for (const sc of this.subcommands) {
      this.propagateSubcommand(sc);
    }
  }

  propagateSubcommand(sc) {
    for (const s of this.gSettings) {
      sc.settings.add(s);
      sc.gSettings.add(s);
    }
    sc.appExt = { ...sc.appExt, ...this.appExt };
  }

  /** Adds `--help`, `--version` and the `help` subcommand (`_check_help_and_version`). */
  checkHelpAndVersion() {
    this.longHelpExistsValue = this.computeLongHelpExists();

    if (!this.isDisableHelpFlagSet()) {
      let arg = new Arg('help').short('h').long('help').action(ArgAction.Help);
      if (this.longHelpExistsValue) {
        arg = arg.help("Print help (see more with '--help')").longHelp("Print help (see a summary with '-h')");
      } else {
        arg = arg.help('Print help');
      }
      this.args.push(arg);
    }
    if (!this.isDisableVersionFlagSet()) {
      this.args.push(new Arg('version').short('V').long('version').action(ArgAction.Version).help('Print version'));
    }

    if (!this.isSet(AppSettings.DisableHelpSubcommand)) {
      const helpSubcmd = new Command('help')
        .about(HELP_ABOUT)
        .arg(
          new Arg('subcommand')
            .action(ArgAction.Append)
            .numArgs(ValueRange.FULL)
            .valueName('COMMAND')
            .help('Print help for the subcommand(s)'),
        );
      this.propagateSubcommand(helpSubcmd);
      helpSubcmd.versionValue = null;
      helpSubcmd.settings.add(AppSettings.DisableHelpFlag);
      helpSubcmd.settings.add(AppSettings.DisableVersionFlag);
      this.subcommands.push(helpSubcmd);
    }
  }

  /** `long_help_exists_`: is there anything that only the long help shows? */
  computeLongHelpExists() {
    const shouldLong = (v) =>
      !v.isHideSet() &&
      (v.getLongHelp() !== null ||
        (!v.isHidePossibleValuesSet() && v.getPossibleValues().some((pv) => pv.shouldShowHelp())));
    return this.getLongAbout() !== null || this.getArguments().some(shouldLong);
  }

  /**
   * Builds a subcommand for parsing, setting its bin and usage names (`_build_subcommand`).
   *
   * @param {string} name
   * @returns {Command | undefined}
   */
  buildSubcommand(name) {
    let midString = ' ';
    for (const s of new Usage(this).getRequiredUsageFrom([], null)) {
      midString += s.toString() + ' ';
    }
    const sc = this.subcommands.find((s) => s.name === name);
    if (sc === undefined) {
      return undefined;
    }
    const scNames = sc.name;
    sc.usageName = this.binName !== null ? `${this.binName}${midString}${scNames}` : scNames;
    sc.binName = `${this.binName ?? ''}${this.binName !== null ? ' ' : ''}${sc.name}`;
    if (sc.displayName === null) {
      const selfDisplayName = this.displayName ?? this.name;
      sc.displayName = `${selfDisplayName}${selfDisplayName !== '' ? '-' : ''}${sc.name}`;
    }
    sc.buildSelf();
    return sc;
  }

  // ----- Help and version -----

  /**
   * Renders the help as an error message body (`write_help_err`).
   *
   * @param {boolean} useLong
   * @returns {StyledStr}
   */
  writeHelpErr(useLong) {
    const styled = new StyledStr();
    writeHelp(styled, this, new Usage(this), useLong && this.longHelpExists());
    return styled;
  }

  /**
   * @returns {StyledStr} `<name> <version>\n`
   */
  writeVersionErr() {
    const displayName = this.displayName ?? this.name;
    return new StyledStr(`${displayName} ${this.versionValue ?? ''}\n`);
  }

  // ----- Parsing -----

  /**
   * Parses the arguments (`Command::try_get_matches_from`). The command itself is not modified.
   *
   * @param {string[]} argv the program name (its file name becomes the bin name) and the arguments
   * @param {{env?: object, stdoutIsTerminal?: boolean, stderrIsTerminal?: boolean,
   *          stdinIsTerminal?: boolean}} [ctx]
   * @returns {import('./arg_matcher.js').ArgMatches}
   * @throws {import('./error.js').ClapError} on errors and for help/version output
   */
  tryGetMatchesFrom(argv, ctx = {}) {
    const cmd = this.clone();
    cmd.appExt.ctx = ctx;
    const rawArgs = new RawArgs([argv[0], ...restoreInvalidUtf8(argv.slice(1))]);
    const cursor = rawArgs.cursor();
    const name = rawArgs.nextOs(cursor);
    if (name !== null) {
      const f = fileName(name);
      if (f !== null && cmd.binName === null) {
        cmd.binName = f;
      }
    }
    return cmd.doParse(rawArgs, cursor);
  }

  doParse(rawArgs, cursor) {
    this.buildSelf();
    const matcher = new ArgMatcher();
    new Parser(this).getMatchesWith(matcher, rawArgs, cursor);
    return matcher.intoInner();
  }
}
