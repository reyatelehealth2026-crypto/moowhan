#!/usr/bin/env node
// CLI entry: node scripts/consolidate.mjs --input <dir> --template <template.xlsx> [--out <dir>] ...
// Pure Node, no network. See docs/cli.md. (Not part of the Vite bundle.)
import { main } from '../src/features/import-cli/cli.js';

process.exitCode = await main(process.argv.slice(2));
