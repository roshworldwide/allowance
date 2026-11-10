// The rules in evaluation order. All twelve always run, so every decision carries a full trace.
import type { Rule } from './context';
import { R01 } from './R01';
import { R02 } from './R02';
import { R03 } from './R03';
import { R04 } from './R04';
import { R05 } from './R05';
import { R06 } from './R06';
import { R07 } from './R07';
import { R08 } from './R08';
import { R09 } from './R09';
import { R10 } from './R10';
import { R11 } from './R11';
import { R12 } from './R12';

export const ALL_RULES: readonly Rule[] = [R01, R02, R03, R04, R05, R06, R07, R08, R09, R10, R11, R12];

export { R01, R02, R03, R04, R05, R06, R07, R08, R09, R10, R11, R12 };
export { RULES, RULE_BY_ID } from './meta';
export type { Rule, RuleContext, LedgerFacts, LineResolution } from './context';
