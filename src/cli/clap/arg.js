// Copyright (c) Individual contributors (clap).
// SPDX-License-Identifier: MIT OR Apache-2.0
// Reimplements the parts of clap_builder 4.5.56 src/builder/{arg,action,range,possible_value,
// value_parser}.rs that sharkdp/pastel v0.12.0 uses, for its JavaScript port.

import { ClapError } from './error.js';
import { Styles, paint } from './styling.js';
import { StyledStr } from './styled_str.js';

/**
 * Behaviour of an argument when it is encountered (`ArgAction`).
 */
export const ArgAction = Object.freeze({
  Set: 'Set',
  Append: 'Append',
  SetTrue: 'SetTrue',
  Help: 'Help',
  Version: 'Version',
});

const TAKES_VALUES = new Set([ArgAction.Set, ArgAction.Append]);

/**
 * Number of values per occurrence (`ValueRange`); `max` is `Infinity` for `usize::MAX`.
 */
export class ValueRange {
  /**
   * @param {number} min
   * @param {number} max
   */
  constructor(min, max) {
    this.min = min;
    this.max = max;
  }

  /** @returns {number} */
  minValues() {
    return this.min;
  }

  /** @returns {number} */
  maxValues() {
    return this.max;
  }

  /** @returns {boolean} */
  takesValues() {
    return this.max !== 0;
  }

  /** @returns {boolean} */
  isUnbounded() {
    return this.max === Infinity;
  }

  /** @returns {boolean} */
  isMultiple() {
    return this.min !== this.max || this.min > 1;
  }

  /** @returns {number | null} the fixed number of values, if any */
  numValues() {
    return this.min === this.max ? this.min : null;
  }

  /**
   * @param {number} current
   * @returns {boolean}
   */
  acceptsMore(current) {
    return current < this.max;
  }

  /**
   * @param {ValueRange} other
   * @returns {boolean}
   */
  equals(other) {
    return this.min === other.min && this.max === other.max;
  }
}

ValueRange.EMPTY = new ValueRange(0, 0);
ValueRange.SINGLE = new ValueRange(1, 1);
ValueRange.FULL = new ValueRange(0, Infinity);

function defaultNumArgs(action) {
  return TAKES_VALUES.has(action) ? ValueRange.SINGLE : ValueRange.EMPTY;
}

/**
 * One possible value of an argument (`PossibleValue`).
 */
class PossibleValue {
  /**
   * @param {string} name
   */
  constructor(name) {
    this.name = name;
    this.help = null;
    this.hide = false;
  }

  /** @returns {string} */
  getName() {
    return this.name;
  }

  /** @returns {boolean} */
  isHideSet() {
    return this.hide;
  }

  /** @returns {boolean} not hidden and has a help text */
  shouldShowHelp() {
    return !this.hide && this.help !== null;
  }

  /**
   * Is `value` this possible value? With `ignoreCase`, ASCII letters compare case-insensitively
   * (`eq_ignore_ascii_case`, since clap's `unicode` feature is off).
   *
   * @param {string} value
   * @param {boolean} ignoreCase
   * @returns {boolean}
   */
  matches(value, ignoreCase) {
    return ignoreCase ? eqIgnoreAsciiCase(this.name, value) : this.name === value;
  }
}

/**
 * Rust `str::eq_ignore_ascii_case`.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function eqIgnoreAsciiCase(a, b) {
  const lower = (s) => s.replace(/[A-Z]/g, (c) => c.toLowerCase());
  return a.length === b.length && lower(a) === lower(b);
}

/**
 * `StringValueParser`: accepts any (UTF-8) value as is.
 */
class StringValueParser {
  /**
   * @param {import('./command.js').Command} _cmd
   * @param {Arg | null} _arg
   * @param {string} value
   * @returns {string}
   */
  parseRef(_cmd, _arg, value) {
    return value;
  }

  /** @returns {null} */
  possibleValues() {
    return null;
  }
}

/**
 * `BoolValueParser` as used by `ArgAction::SetTrue` (only ever sees `true` / `false`).
 */
class BoolValueParser {
  /**
   * @param {import('./command.js').Command} _cmd
   * @param {Arg | null} _arg
   * @param {string} value
   * @returns {boolean}
   */
  parseRef(_cmd, _arg, value) {
    return value === 'true';
  }

  /** @returns {null} */
  possibleValues() {
    return null;
  }
}

/**
 * `PossibleValuesParser`: only accepts one of the given values; the value is kept as typed.
 */
class PossibleValuesParser {
  /**
   * @param {string[]} values
   */
  constructor(values) {
    this.values = values.map((v) => new PossibleValue(v));
  }

  /**
   * @param {import('./command.js').Command} cmd
   * @param {Arg | null} arg
   * @param {string} value
   * @returns {string}
   */
  parseRef(cmd, arg, value) {
    const ignoreCase = arg !== null && arg.isIgnoreCaseSet();
    if (this.values.some((v) => v.matches(value, ignoreCase))) {
      return value;
    }
    const possibleVals = this.values.filter((v) => !v.isHideSet()).map((v) => v.getName());
    throw ClapError.invalidValue(cmd, value, possibleVals, arg !== null ? arg.toString() : '...');
  }

  /** @returns {PossibleValue[]} */
  possibleValues() {
    return this.values;
  }
}

/**
 * A command-line argument definition (`clap::Arg`).
 */
export class Arg {
  /**
   * @param {string} id
   */
  constructor(id) {
    this.id = id;
    this.helpValue = null;
    this.longHelpValue = null;
    this.shortName = null;
    this.longName = null;
    this.actionValue = null;
    this.valueParserImpl = null;
    this.numVals = null;
    this.valNames = [];
    this.defaultVals = [];
    this.defaultMissingVals = [];
    this.dispOrd = null;
    this.index = null;
    this.settings = new Set();
  }

  /** @returns {Arg} a deep copy */
  clone() {
    const copy = Object.assign(Object.create(Arg.prototype), this);
    copy.valNames = [...this.valNames];
    copy.defaultVals = [...this.defaultVals];
    copy.defaultMissingVals = [...this.defaultMissingVals];
    copy.settings = new Set(this.settings);
    return copy;
  }

  /**
   * @param {string} s
   * @returns {Arg} this
   */
  short(s) {
    this.shortName = s;
    return this;
  }

  /**
   * @param {string} l
   * @returns {Arg} this
   */
  long(l) {
    this.longName = l;
    return this;
  }

  /**
   * @param {string} h
   * @returns {Arg} this
   */
  help(h) {
    this.helpValue = new StyledStr(h);
    return this;
  }

  /**
   * @param {string} h
   * @returns {Arg} this
   */
  longHelp(h) {
    this.longHelpValue = new StyledStr(h);
    return this;
  }

  /**
   * @param {string} action one of {@link ArgAction}
   * @returns {Arg} this
   */
  action(action) {
    this.actionValue = action;
    return this;
  }

  /**
   * Restricts the values to a list (`value_parser([...])` = `PossibleValuesParser`).
   *
   * @param {string[]} values
   * @returns {Arg} this
   */
  valueParser(values) {
    this.valueParserImpl = new PossibleValuesParser(values);
    return this;
  }

  /**
   * @param {ValueRange} range
   * @returns {Arg} this
   */
  numArgs(range) {
    this.numVals = range;
    return this;
  }

  /**
   * @param {string} name
   * @returns {Arg} this
   */
  valueName(name) {
    this.valNames = [name];
    return this;
  }

  /**
   * @param {string} value
   * @returns {Arg} this
   */
  defaultValue(value) {
    this.defaultVals = [value];
    return this;
  }

  /**
   * @param {boolean} yes
   * @returns {Arg} this
   */
  required(yes) {
    return this.flag('required', yes);
  }

  /**
   * @param {boolean} yes
   * @returns {Arg} this
   */
  hide(yes) {
    return this.flag('hidden', yes);
  }

  /**
   * @param {boolean} yes
   * @returns {Arg} this
   */
  hidePossibleValues(yes) {
    return this.flag('hidePossibleValues', yes);
  }

  /**
   * @param {boolean} yes
   * @returns {Arg} this
   */
  hideDefaultValue(yes) {
    return this.flag('hideDefaultValue', yes);
  }

  /**
   * @param {boolean} yes
   * @returns {Arg} this
   */
  ignoreCase(yes) {
    return this.flag('ignoreCase', yes);
  }

  /**
   * Sets or clears an `ArgSettings` flag.
   *
   * @param {string} name
   * @param {boolean} yes
   * @returns {Arg} this
   */
  flag(name, yes) {
    if (yes) {
      this.settings.add(name);
    } else {
      this.settings.delete(name);
    }
    return this;
  }

  /** @returns {string} */
  getId() {
    return this.id;
  }

  /** @returns {StyledStr | null} */
  getHelp() {
    return this.helpValue;
  }

  /** @returns {StyledStr | null} */
  getLongHelp() {
    return this.longHelpValue;
  }

  /** @returns {number} */
  getDisplayOrder() {
    return this.dispOrd ?? 999;
  }

  /** @returns {string | null} */
  getShort() {
    return this.shortName;
  }

  /** @returns {string | null} */
  getLong() {
    return this.longName;
  }

  /** @returns {PossibleValue[]} */
  getPossibleValues() {
    if (!this.isTakesValueSet()) {
      return [];
    }
    return this.getValueParser().possibleValues() ?? [];
  }

  /** @returns {ValueRange | null} */
  getNumArgs() {
    return this.numVals;
  }

  /** @returns {number} */
  getMinVals() {
    return this.numVals.minValues();
  }

  /** @returns {number | null} */
  getIndex() {
    return this.index;
  }

  /** @returns {boolean} neither a long nor a short name */
  isPositional() {
    return this.longName === null && this.shortName === null;
  }

  /** @returns {boolean} */
  isRequiredSet() {
    return this.settings.has('required');
  }

  /** @returns {boolean} */
  isMultipleValuesSet() {
    return (this.numVals ?? ValueRange.SINGLE).isMultiple();
  }

  /** @returns {boolean} */
  isTakesValueSet() {
    return (this.numVals ?? ValueRange.SINGLE).takesValues();
  }

  /** @returns {boolean} */
  isAllowNegativeNumbersSet() {
    return this.settings.has('allowNegativeNumbers');
  }

  /** @returns {string} */
  getAction() {
    return this.actionValue ?? ArgAction.Set;
  }

  /** @returns {StringValueParser | BoolValueParser | PossibleValuesParser} */
  getValueParser() {
    return this.valueParserImpl ?? new StringValueParser();
  }

  /** @returns {boolean} */
  isHideSet() {
    return this.settings.has('hidden');
  }

  /** @returns {boolean} */
  isHideDefaultValueSet() {
    return this.settings.has('hideDefaultValue');
  }

  /** @returns {boolean} */
  isHidePossibleValuesSet() {
    return this.settings.has('hidePossibleValues');
  }

  /** @returns {boolean} */
  isIgnoreCaseSet() {
    return this.settings.has('ignoreCase');
  }

  /** Fills in the implied settings (`Arg::_build`). */
  build() {
    if (this.actionValue === null) {
      if (this.numVals !== null && this.numVals.equals(ValueRange.EMPTY)) {
        this.actionValue = ArgAction.SetTrue;
      } else {
        const unbounded = (this.numVals ?? ValueRange.SINGLE).isUnbounded();
        this.actionValue = this.isPositional() && unbounded ? ArgAction.Append : ArgAction.Set;
      }
    }
    if (this.actionValue === ArgAction.SetTrue) {
      if (this.defaultVals.length === 0) {
        this.defaultVals = ['false'];
      }
      if (this.defaultMissingVals.length === 0) {
        this.defaultMissingVals = ['true'];
      }
    }
    if (this.valueParserImpl === null) {
      this.valueParserImpl =
        this.actionValue === ArgAction.SetTrue ? new BoolValueParser() : new StringValueParser();
    }
    if (this.valNames.length > 1) {
      this.numVals ??= new ValueRange(this.valNames.length, this.valNames.length);
    } else {
      this.numVals ??= defaultNumArgs(this.actionValue);
    }
  }

  /**
   * `--long <value>` / `-s` / `<positional>` with styles (`Arg::stylized`).
   *
   * @param {Styles} styles
   * @param {boolean | null} required
   * @returns {StyledStr}
   */
  stylized(styles, required) {
    const literal = styles.getLiteral();
    const styled = new StyledStr();
    if (this.longName !== null) {
      styled.pushStr(paint(literal, `--${this.longName}`));
    } else if (this.shortName !== null) {
      styled.pushStr(paint(literal, `-${this.shortName}`));
    }
    styled.pushStyled(this.stylizeArgSuffix(styles, required));
    return styled;
  }

  /**
   * The value part after the switch (`Arg::stylize_arg_suffix`).
   *
   * @param {Styles} styles
   * @param {boolean | null} required
   * @returns {StyledStr}
   */
  stylizeArgSuffix(styles, required) {
    const placeholder = styles.getPlaceholder();
    const styled = new StyledStr();
    let needClosingBracket = false;
    if (this.isTakesValueSet() && !this.isPositional()) {
      const isOptionalVal = this.getMinVals() === 0;
      let start = ' ';
      if (isOptionalVal) {
        needClosingBracket = true;
        start = ' [';
      }
      styled.pushStr(paint(placeholder, start));
    }
    if (this.isTakesValueSet() || this.isPositional()) {
      const req = required ?? this.isRequiredSet();
      styled.pushStr(paint(placeholder, this.renderArgVal(req)));
    }
    if (needClosingBracket) {
      styled.pushStr(paint(placeholder, ']'));
    }
    return styled;
  }

  /**
   * Writes the values such as `<name1> <name2>` (`Arg::render_arg_val`).
   *
   * @param {boolean} required
   * @returns {string}
   */
  renderArgVal(required) {
    const numVals = this.numVals ?? ValueRange.SINGLE;
    let valNames = this.valNames.length === 0 ? [this.id] : [...this.valNames];
    if (valNames.length === 1) {
      const min = Math.max(numVals.minValues(), 1);
      valNames = new Array(min).fill(valNames[0]);
    }
    let rendered = valNames
      .map((name) =>
        this.isPositional() && (numVals.minValues() === 0 || !required) ? `[${name}]` : `<${name}>`,
      )
      .join(' ');
    let extraValues = valNames.length < numVals.maxValues();
    if (this.isPositional() && this.getAction() === ArgAction.Append) {
      extraValues = true;
    }
    if (extraValues) {
      rendered += '...';
    }
    return rendered;
  }

  /** @returns {boolean} either multiple values or occurrences */
  isMultiple() {
    return this.isMultipleValuesSet() || this.getAction() === ArgAction.Append;
  }

  /** @returns {string} the plain usage form, e.g. `--number <count>` (Rust `Display`) */
  toString() {
    return this.stylized(Styles.plain(), null).toString();
  }
}
