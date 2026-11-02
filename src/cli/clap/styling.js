// Copyright (c) Individual contributors (clap); ported in sharkdp/pastel.
// Copyright (c) 2022 The rust-cli Developers (anstyle); ported in sharkdp/pastel.
// SPDX-License-Identifier: MIT OR Apache-2.0
// Reimplements the behaviour of clap_builder 4.5.56 src/builder/styling.rs (and the parts of
// anstyle 1.0.10 it relies on) for the JavaScript port of sharkdp/pastel v0.12.0.

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const UNDERLINE = '\x1b[4m';

/** anstyle `AnsiColor` foreground codes used by clap's default styles. */
const AnsiColor = Object.freeze({
  Red: '\x1b[31m',
  Green: '\x1b[32m',
  Yellow: '\x1b[33m',
});

/**
 * An ANSI text style (anstyle `Style`) restricted to what clap's default styles use: the bold and
 * underline effects plus an optional foreground colour.
 */
class Style {
  /**
   * @param {{bold?: boolean, underline?: boolean, fg?: string | null}} [spec] `fg` is an escape code
   */
  constructor({ bold = false, underline = false, fg = null } = {}) {
    this.bold = bold;
    this.underline = underline;
    this.fg = fg;
  }

  /** @returns {boolean} whether this is `Style::new()` (nothing to render) */
  isPlain() {
    return !this.bold && !this.underline && this.fg === null;
  }

  /**
   * The escape sequence that enables this style (`Style::render`): effects in anstyle's bit order,
   * then the colour.
   *
   * @returns {string}
   */
  render() {
    return (this.bold ? BOLD : '') + (this.underline ? UNDERLINE : '') + (this.fg ?? '');
  }

  /**
   * The reset sequence (`Style::render_reset`, i.e. `{style:#}`), elided for a plain style.
   *
   * @returns {string}
   */
  renderReset() {
    return this.isPlain() ? '' : RESET;
  }
}

/**
 * The terminal styling of clap's help and error output (`clap::builder::Styles`).
 */
export class Styles {
  /**
   * @param {{header: Style, error: Style, usage: Style, literal: Style, placeholder: Style,
   *          valid: Style, invalid: Style, context: Style, contextValue: Style}} parts
   */
  constructor(parts) {
    this.header = parts.header;
    this.error = parts.error;
    this.usage = parts.usage;
    this.literal = parts.literal;
    this.placeholder = parts.placeholder;
    this.valid = parts.valid;
    this.invalid = parts.invalid;
    this.context = parts.context;
    this.contextValue = parts.contextValue;
  }

  /**
   * No styling at all (`Styles::plain`).
   *
   * @returns {Styles}
   */
  static plain() {
    const plain = new Style();
    return new Styles({
      header: plain,
      error: plain,
      usage: plain,
      literal: plain,
      placeholder: plain,
      valid: plain,
      invalid: plain,
      context: plain,
      contextValue: plain,
    });
  }

  /**
   * The default styling with the `color` feature (`Styles::styled`).
   *
   * @returns {Styles}
   */
  static styled() {
    return new Styles({
      header: new Style({ bold: true, underline: true }),
      error: new Style({ fg: AnsiColor.Red, bold: true }),
      usage: new Style({ bold: true, underline: true }),
      literal: new Style({ bold: true }),
      placeholder: new Style(),
      valid: new Style({ fg: AnsiColor.Green }),
      invalid: new Style({ fg: AnsiColor.Yellow }),
      context: new Style(),
      contextValue: new Style(),
    });
  }

  /** @returns {Style} section headings such as `Options:` */
  getHeader() {
    return this.header;
  }

  /** @returns {Style} the `error:` label */
  getError() {
    return this.error;
  }

  /** @returns {Style} the `Usage:` label */
  getUsage() {
    return this.usage;
  }

  /** @returns {Style} literal text the user can type, such as flags and command names */
  getLiteral() {
    return this.literal;
  }

  /** @returns {Style} value placeholders such as `<COMMAND>` */
  getPlaceholder() {
    return this.placeholder;
  }

  /** @returns {Style} suggested or accepted values */
  getValid() {
    return this.valid;
  }

  /** @returns {Style} the offending input in error messages */
  getInvalid() {
    return this.invalid;
  }

  /** @returns {Style} the `[default: ...]` / `[possible values: ...]` decoration */
  getContext() {
    return this.context;
  }

  /** @returns {Style} the values inside the decoration */
  getContextValue() {
    return this.contextValue;
  }
}

/**
 * Wraps `text` in a style, like Rust's `format!("{style}{text}{style:#}")`.
 *
 * @param {Style} style
 * @param {string} text
 * @returns {string}
 */
export function paint(style, text) {
  return style.render() + text + style.renderReset();
}
