// Copyright (c) David Peter and pastel contributors.
// SPDX-License-Identifier: MIT OR Apache-2.0
// JavaScript port of src/cli/commands/show.rs from sharkdp/pastel v0.12.0.

/** `pastel color`: shows the given colors. */
export class ShowCommand {
  /**
   * @param {import('../output.js').Output} out
   * @param {object} _matches
   * @param {import('../config.js').Config} config
   * @param {import('../../lib/color.js').Color} color
   */
  run(out, _matches, config, color) {
    out.showColor(config, color);
  }
}
