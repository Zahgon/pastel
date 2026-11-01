// Copyright (c) Individual contributors (clap).
// SPDX-License-Identifier: MIT OR Apache-2.0
// Public API of the minimal reimplementation of clap 4.5.56 (clap_builder, clap_lex, anstream)
// behaviour used by the JavaScript port of sharkdp/pastel v0.12.0.

export { Arg, ArgAction } from './arg.js';
export { Command } from './command.js';
export { ClapError, ErrorKind } from './error.js';
export { ColorChoice } from './stream.js';
