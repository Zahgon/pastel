// Copyright (c) Individual contributors (anstyle-parse, anstream).
// Copyright (c) 2016 Joe Wilm (utf8parse).
// SPDX-License-Identifier: MIT OR Apache-2.0
// Reimplements, for the JavaScript port of sharkdp/pastel v0.12.0, the escape-code stripping clap
// 4.5.56 relies on: the anstyle-parse 0.2.7 state machine (src/state/{definitions,codegen}.rs; the
// crate is forked from vte), the anstream 0.6.20 strip adapter (src/adapter/strip.rs: `strip_str`
// and `StripBytes`) and a minimal `Parser` of utf8parse 0.2.2.

/** anstyle-parse `State`. */
const State = Object.freeze({
  Anywhere: 0,
  CsiEntry: 1,
  CsiIgnore: 2,
  CsiIntermediate: 3,
  CsiParam: 4,
  DcsEntry: 5,
  DcsIgnore: 6,
  DcsIntermediate: 7,
  DcsParam: 8,
  DcsPassthrough: 9,
  Escape: 10,
  EscapeIntermediate: 11,
  Ground: 12,
  OscString: 13,
  SosPmApcString: 14,
  Utf8: 15,
});

/** anstyle-parse `Action`. */
const Action = Object.freeze({
  Nop: 0,
  Clear: 1,
  Collect: 2,
  CsiDispatch: 3,
  EscDispatch: 4,
  Execute: 5,
  Hook: 6,
  Ignore: 7,
  OscEnd: 8,
  OscPut: 9,
  OscStart: 10,
  Param: 11,
  Print: 12,
  Put: 13,
  Unhook: 14,
  BeginUtf8: 15,
});

const S = State;
const A = Action;

/** The state change definitions of anstyle-parse's codegen.rs: [state, from, to, next, action]. */
const DEFINITIONS = [
  [S.Anywhere, 0x18, 0x18, S.Ground, A.Execute],
  [S.Anywhere, 0x1a, 0x1a, S.Ground, A.Execute],
  [S.Anywhere, 0x1b, 0x1b, S.Escape, A.Nop],

  [S.Ground, 0x00, 0x17, S.Anywhere, A.Execute],
  [S.Ground, 0x19, 0x19, S.Anywhere, A.Execute],
  [S.Ground, 0x1c, 0x1f, S.Anywhere, A.Execute],
  [S.Ground, 0x20, 0x7f, S.Anywhere, A.Print],
  [S.Ground, 0x80, 0x8f, S.Anywhere, A.Execute],
  [S.Ground, 0x91, 0x9a, S.Anywhere, A.Execute],
  [S.Ground, 0x9c, 0x9c, S.Anywhere, A.Execute],
  [S.Ground, 0xc2, 0xdf, S.Utf8, A.BeginUtf8],
  [S.Ground, 0xe0, 0xef, S.Utf8, A.BeginUtf8],
  [S.Ground, 0xf0, 0xf4, S.Utf8, A.BeginUtf8],

  [S.Escape, 0x00, 0x17, S.Anywhere, A.Execute],
  [S.Escape, 0x19, 0x19, S.Anywhere, A.Execute],
  [S.Escape, 0x1c, 0x1f, S.Anywhere, A.Execute],
  [S.Escape, 0x7f, 0x7f, S.Anywhere, A.Ignore],
  [S.Escape, 0x20, 0x2f, S.EscapeIntermediate, A.Collect],
  [S.Escape, 0x30, 0x4f, S.Ground, A.EscDispatch],
  [S.Escape, 0x51, 0x57, S.Ground, A.EscDispatch],
  [S.Escape, 0x59, 0x59, S.Ground, A.EscDispatch],
  [S.Escape, 0x5a, 0x5a, S.Ground, A.EscDispatch],
  [S.Escape, 0x5c, 0x5c, S.Ground, A.EscDispatch],
  [S.Escape, 0x60, 0x7e, S.Ground, A.EscDispatch],
  [S.Escape, 0x5b, 0x5b, S.CsiEntry, A.Nop],
  [S.Escape, 0x5d, 0x5d, S.OscString, A.Nop],
  [S.Escape, 0x50, 0x50, S.DcsEntry, A.Nop],
  [S.Escape, 0x58, 0x58, S.SosPmApcString, A.Nop],
  [S.Escape, 0x5e, 0x5e, S.SosPmApcString, A.Nop],
  [S.Escape, 0x5f, 0x5f, S.SosPmApcString, A.Nop],

  [S.EscapeIntermediate, 0x00, 0x17, S.Anywhere, A.Execute],
  [S.EscapeIntermediate, 0x19, 0x19, S.Anywhere, A.Execute],
  [S.EscapeIntermediate, 0x1c, 0x1f, S.Anywhere, A.Execute],
  [S.EscapeIntermediate, 0x20, 0x2f, S.Anywhere, A.Collect],
  [S.EscapeIntermediate, 0x7f, 0x7f, S.Anywhere, A.Ignore],
  [S.EscapeIntermediate, 0x30, 0x7e, S.Ground, A.EscDispatch],

  [S.CsiEntry, 0x00, 0x17, S.Anywhere, A.Execute],
  [S.CsiEntry, 0x19, 0x19, S.Anywhere, A.Execute],
  [S.CsiEntry, 0x1c, 0x1f, S.Anywhere, A.Execute],
  [S.CsiEntry, 0x7f, 0x7f, S.Anywhere, A.Ignore],
  [S.CsiEntry, 0x20, 0x2f, S.CsiIntermediate, A.Collect],
  [S.CsiEntry, 0x30, 0x39, S.CsiParam, A.Param],
  [S.CsiEntry, 0x3a, 0x3b, S.CsiParam, A.Param],
  [S.CsiEntry, 0x3c, 0x3f, S.CsiParam, A.Collect],
  [S.CsiEntry, 0x40, 0x7e, S.Ground, A.CsiDispatch],

  [S.CsiIgnore, 0x00, 0x17, S.Anywhere, A.Execute],
  [S.CsiIgnore, 0x19, 0x19, S.Anywhere, A.Execute],
  [S.CsiIgnore, 0x1c, 0x1f, S.Anywhere, A.Execute],
  [S.CsiIgnore, 0x20, 0x3f, S.Anywhere, A.Ignore],
  [S.CsiIgnore, 0x7f, 0x7f, S.Anywhere, A.Ignore],
  [S.CsiIgnore, 0x40, 0x7e, S.Ground, A.Nop],

  [S.CsiParam, 0x00, 0x17, S.Anywhere, A.Execute],
  [S.CsiParam, 0x19, 0x19, S.Anywhere, A.Execute],
  [S.CsiParam, 0x1c, 0x1f, S.Anywhere, A.Execute],
  [S.CsiParam, 0x30, 0x39, S.Anywhere, A.Param],
  [S.CsiParam, 0x3a, 0x3b, S.Anywhere, A.Param],
  [S.CsiParam, 0x7f, 0x7f, S.Anywhere, A.Ignore],
  [S.CsiParam, 0x3c, 0x3f, S.CsiIgnore, A.Nop],
  [S.CsiParam, 0x20, 0x2f, S.CsiIntermediate, A.Collect],
  [S.CsiParam, 0x40, 0x7e, S.Ground, A.CsiDispatch],

  [S.CsiIntermediate, 0x00, 0x17, S.Anywhere, A.Execute],
  [S.CsiIntermediate, 0x19, 0x19, S.Anywhere, A.Execute],
  [S.CsiIntermediate, 0x1c, 0x1f, S.Anywhere, A.Execute],
  [S.CsiIntermediate, 0x20, 0x2f, S.Anywhere, A.Collect],
  [S.CsiIntermediate, 0x7f, 0x7f, S.Anywhere, A.Ignore],
  [S.CsiIntermediate, 0x30, 0x3f, S.CsiIgnore, A.Nop],
  [S.CsiIntermediate, 0x40, 0x7e, S.Ground, A.CsiDispatch],

  [S.DcsEntry, 0x00, 0x17, S.Anywhere, A.Ignore],
  [S.DcsEntry, 0x19, 0x19, S.Anywhere, A.Ignore],
  [S.DcsEntry, 0x1c, 0x1f, S.Anywhere, A.Ignore],
  [S.DcsEntry, 0x7f, 0x7f, S.Anywhere, A.Ignore],
  [S.DcsEntry, 0x20, 0x2f, S.DcsIntermediate, A.Collect],
  [S.DcsEntry, 0x30, 0x39, S.DcsParam, A.Param],
  [S.DcsEntry, 0x3a, 0x3b, S.DcsParam, A.Param],
  [S.DcsEntry, 0x3c, 0x3f, S.DcsParam, A.Collect],
  [S.DcsEntry, 0x40, 0x7e, S.DcsPassthrough, A.Nop],

  [S.DcsIntermediate, 0x00, 0x17, S.Anywhere, A.Ignore],
  [S.DcsIntermediate, 0x19, 0x19, S.Anywhere, A.Ignore],
  [S.DcsIntermediate, 0x1c, 0x1f, S.Anywhere, A.Ignore],
  [S.DcsIntermediate, 0x20, 0x2f, S.Anywhere, A.Collect],
  [S.DcsIntermediate, 0x7f, 0x7f, S.Anywhere, A.Ignore],
  [S.DcsIntermediate, 0x30, 0x3f, S.DcsIgnore, A.Nop],
  [S.DcsIntermediate, 0x40, 0x7e, S.DcsPassthrough, A.Nop],

  [S.DcsIgnore, 0x00, 0x17, S.Anywhere, A.Ignore],
  [S.DcsIgnore, 0x19, 0x19, S.Anywhere, A.Ignore],
  [S.DcsIgnore, 0x1c, 0x1f, S.Anywhere, A.Ignore],
  [S.DcsIgnore, 0x20, 0x7f, S.Anywhere, A.Ignore],
  [S.DcsIgnore, 0x9c, 0x9c, S.Ground, A.Nop],

  [S.DcsParam, 0x00, 0x17, S.Anywhere, A.Ignore],
  [S.DcsParam, 0x19, 0x19, S.Anywhere, A.Ignore],
  [S.DcsParam, 0x1c, 0x1f, S.Anywhere, A.Ignore],
  [S.DcsParam, 0x30, 0x39, S.Anywhere, A.Param],
  [S.DcsParam, 0x3a, 0x3b, S.Anywhere, A.Param],
  [S.DcsParam, 0x7f, 0x7f, S.Anywhere, A.Ignore],
  [S.DcsParam, 0x3c, 0x3f, S.DcsIgnore, A.Nop],
  [S.DcsParam, 0x20, 0x2f, S.DcsIntermediate, A.Collect],
  [S.DcsParam, 0x40, 0x7e, S.DcsPassthrough, A.Nop],

  [S.DcsPassthrough, 0x00, 0x17, S.Anywhere, A.Put],
  [S.DcsPassthrough, 0x19, 0x19, S.Anywhere, A.Put],
  [S.DcsPassthrough, 0x1c, 0x1f, S.Anywhere, A.Put],
  [S.DcsPassthrough, 0x20, 0x7e, S.Anywhere, A.Put],
  [S.DcsPassthrough, 0x7f, 0x7f, S.Anywhere, A.Ignore],
  [S.DcsPassthrough, 0x9c, 0x9c, S.Ground, A.Nop],

  [S.SosPmApcString, 0x00, 0x17, S.Anywhere, A.Ignore],
  [S.SosPmApcString, 0x19, 0x19, S.Anywhere, A.Ignore],
  [S.SosPmApcString, 0x1c, 0x1f, S.Anywhere, A.Ignore],
  [S.SosPmApcString, 0x20, 0x7f, S.Anywhere, A.Ignore],
  [S.SosPmApcString, 0x9c, 0x9c, S.Ground, A.Nop],

  [S.OscString, 0x00, 0x06, S.Anywhere, A.Ignore],
  [S.OscString, 0x07, 0x07, S.Ground, A.Nop],
  [S.OscString, 0x08, 0x17, S.Anywhere, A.Ignore],
  [S.OscString, 0x19, 0x19, S.Anywhere, A.Ignore],
  [S.OscString, 0x1c, 0x1f, S.Anywhere, A.Ignore],
  [S.OscString, 0x20, 0xff, S.Anywhere, A.OscPut],
];

/** `STATE_CHANGES[state][byte]` = packed `(action << 4) | next_state` (anstyle-parse table.rs). */
const STATE_CHANGES = (() => {
  const table = Array.from({ length: 16 }, () => new Uint8Array(256));
  for (const [state, from, to, next, action] of DEFINITIONS) {
    for (let byte = from; byte <= to; byte++) {
      table[state][byte] = (action << 4) | next;
    }
  }
  return table;
})();

/**
 * anstyle-parse `state_change`: transitions of the `Anywhere` pseudo-state take precedence.
 *
 * @param {number} state
 * @param {number} byte
 * @returns {[number, number]} the next state (`Anywhere` = keep the current one) and the action
 */
function stateChange(state, byte) {
  let change = STATE_CHANGES[State.Anywhere][byte];
  if (change === 0) {
    change = STATE_CHANGES[state][byte];
  }
  return [change & 0x0f, change >> 4];
}

/** Rust `u8::is_ascii_whitespace`: space, `\t`, `\n`, form feed and `\r` (not vertical tab). */
function isAsciiWhitespaceByte(b) {
  return b === 0x20 || b === 0x09 || b === 0x0a || b === 0x0c || b === 0x0d;
}

function isPrintableBytes(action, byte) {
  const DEL = 0x7f;
  return (
    (action === Action.Print && byte !== DEL) ||
    action === Action.BeginUtf8 ||
    (action === Action.Execute && isAsciiWhitespaceByte(byte))
  );
}

function isUtf8Continuation(b) {
  return b >= 0x80 && b <= 0xbf;
}

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

/**
 * The printable chunks of `data` as `strip_str` yields them (anstream `next_str`), as byte ranges
 * into the UTF-8 encoding of `data`.
 *
 * @param {Uint8Array} bytes UTF-8 encoded text
 * @returns {Array<[number, number]>} `[start, end)` byte ranges
 */
export function stripStrRanges(bytes) {
  const ranges = [];
  let pos = 0;
  let state = State.Ground;
  while (pos < bytes.length) {
    while (pos < bytes.length) {
      const [next, action] = stateChange(state, bytes[pos]);
      if (next !== State.Anywhere) {
        state = next;
      }
      if (isPrintableBytes(action, bytes[pos])) {
        break;
      }
      pos++;
    }
    state = State.Ground;
    const start = pos;
    while (pos < bytes.length) {
      const [, action] = stateChange(State.Ground, bytes[pos]);
      if (!(isPrintableBytes(action, bytes[pos]) || isUtf8Continuation(bytes[pos]))) {
        break;
      }
      pos++;
    }
    if (pos === start) {
      break;
    }
    ranges.push([start, pos]);
  }
  return ranges;
}

/**
 * The printable chunks of a string (anstream `strip_str`), e.g. for `StyledStr::iter_text`.
 *
 * @param {string} data
 * @returns {string[]}
 */
export function stripStr(data) {
  const bytes = ENCODER.encode(data);
  return stripStrRanges(bytes).map(([start, end]) => DECODER.decode(bytes.subarray(start, end)));
}

/**
 * Minimal `utf8parse::Parser`: reports when a (valid) UTF-8 sequence is complete.
 */
class Utf8Parser {
  constructor() {
    this.remaining = 0;
  }

  /**
   * @param {number} byte
   * @returns {boolean} true once a code point (or an invalid sequence) is finished
   */
  add(byte) {
    if (this.remaining === 0) {
      if (byte >= 0xc2 && byte <= 0xdf) {
        this.remaining = 1;
      } else if (byte >= 0xe0 && byte <= 0xef) {
        this.remaining = 2;
      } else if (byte >= 0xf0 && byte <= 0xf4) {
        this.remaining = 3;
      } else {
        return true;
      }
      return false;
    }
    if (!isUtf8Continuation(byte)) {
      this.remaining = 0;
      return true;
    }
    this.remaining -= 1;
    return this.remaining === 0;
  }
}

/**
 * Strips escape sequences from text written to a stream (anstream `StripStream` / `StripBytes`).
 *
 * @param {string} data
 * @returns {string} the printable content
 */
export function stripBytes(data) {
  const bytes = ENCODER.encode(data);
  const chunks = [];
  const utf8parser = new Utf8Parser();
  let state = State.Ground;
  let pos = 0;
  for (;;) {
    while (pos < bytes.length) {
      const b = bytes[pos];
      if (state === State.Utf8) {
        break;
      }
      const [next, action] = stateChange(state, b);
      if (next !== State.Anywhere) {
        state = next;
      }
      if (isPrintableBytes(action, b)) {
        break;
      }
      pos++;
    }
    const start = pos;
    while (pos < bytes.length) {
      const b = bytes[pos];
      if (state === State.Utf8) {
        if (utf8parser.add(b)) {
          state = State.Ground;
        }
      } else {
        const [next, action] = stateChange(State.Ground, b);
        if (next !== State.Anywhere) {
          state = next;
        }
        if (state === State.Utf8) {
          utf8parser.add(b);
        } else if (!isPrintableBytes(action, b)) {
          break;
        }
      }
      pos++;
    }
    if (pos === start) {
      break;
    }
    chunks.push(bytes.subarray(start, pos));
  }
  return DECODER.decode(Buffer.concat(chunks));
}
