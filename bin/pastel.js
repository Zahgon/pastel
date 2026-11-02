#!/usr/bin/env node
// Copyright (c) David Peter and pastel contributors.
// SPDX-License-Identifier: MIT OR Apache-2.0
// Entry point of the `pastel` command (JavaScript port of sharkdp/pastel v0.12.0).

import { main } from '../src/cli/main.js';

process.exit(main());
