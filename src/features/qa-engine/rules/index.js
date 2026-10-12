// Built-in rule modules. To add rules: create rules/<name>.js exporting an array of rules and list it here.
import { registerRule } from '../registry.js';
import row from './row.js';
import file from './file.js';
import month from './month.js';
import layout from './layout.js';
import consistency from './consistency.js';
import template from './template.js';

export const RULE_MODULES = { row, file, month, layout, consistency, template };
Object.values(RULE_MODULES).flat().forEach(registerRule);
