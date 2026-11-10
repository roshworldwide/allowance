// Studio data sources for the Control Room, built from rows passed in as props (seed data today,
// /api/studio/data later). Rows are passed through untouched; this file only adds field formats,
// AI-facing descriptions and the relationships between tables.
// Docs: https://www.ag-grid.com/studio/archive/3.1.0/react/data/ and .../data-modelling/#relationships

import type { AgDataSourcesDefinition, AgFieldDefinition, AgFormat, AgRelationDefinition } from 'ag-studio';
import type { ControlRoomRegistry } from './registry';
import type { ControlRoomData } from './types';
import type { CellRendererKind } from './widgets/cell-renderers';

type Field = AgFieldDefinition<ControlRoomRegistry>;
type Spec = [id: string, name: string, format: AgFormat<ControlRoomRegistry>, hide?: boolean];
const USD = { format: '$#,##0.00' };

/** Columns the grid widget draws as chips (see ./widgets/cell-renderers.tsx), keyed 'table.field'. */
const CELL_RENDERERS: Record<string, CellRendererKind> = {
  'decisions.verdict': 'verdict',
  'decisions.firstBlock': 'rule',
  'decisions.status': 'status',
  'decisions.paypalConfirmed': 'confirmed',
  'rule_results.outcome': 'outcome',
  'rule_results.ruleId': 'rule',
};

const fields = (table: string, specs: Spec[]): Field[] =>
  specs.map(([id, name, format, hide]) => {
    const cellRenderer = CELL_RENDERERS[`${table}.${id}`];
    return {
      id,
      name,
      format,
      ...(format === 'currencyFormat' && { formatOptions: USD }),
      ...(hide && { hide }),
      ...(cellRenderer && { context: { cellRenderer } }),
    };
  });

/** Foreign key 'table.field' -> primary key 'table.field' (string refs are the 3.1.0 documented form). */
const manyToOne = (id: string, source: string, target: string): AgRelationDefinition => ({ id, source, target, type: 'many-to-one' });

export const CONTROL_ROOM_RELATIONSHIPS: AgRelationDefinition[] = [
  manyToOne('decision-mandate', 'decisions.mandateId', 'mandates.id'),
  manyToOne('decision-merchant', 'decisions.merchantId', 'merchants.id'),
  manyToOne('rule-result-decision', 'rule_results.decisionId', 'decisions.id'),
  manyToOne('paypal-transaction-decision', 'paypal_transactions.decisionId', 'decisions.id'),
];

export function buildDataSources(data: ControlRoomData): AgDataSourcesDefinition<ControlRoomRegistry> {
  return {
    description:
      'ALLOWANCE: a spending firewall for AI agents on PayPal sandbox. Every money-moving agent tool call gets a deterministic ' +
      'verdict (ALLOW, STEP_UP = the person must approve in PayPal, BLOCK) from 12 rules R01..R12; rule_results holds the full ' +
      'trace (12 rows per decision). Money is in US dollars. Merchants are simulated.',
    sources: [
      {
        id: 'mandates',
        name: 'Allowances',
        description: 'Spending allowances (mandates) given to agents: budget, what is committed (paid) and reserved (awaiting approval).',
        primaryKeyField: 'id',
        transactions: 'all',
        data: data.mandates,
        fields: fields('mandates', [
          ['id', 'Mandate ID', 'textFormat', true],
          ['name', 'Allowance', 'textFormat'],
          ['status', 'Allowance Status', 'textFormat'],
          ['budgetUsd', 'Budget', 'currencyFormat'],
          ['committedUsd', 'Committed', 'currencyFormat'],
          ['reservedUsd', 'Reserved', 'currencyFormat'],
          ['remainingUsd', 'Remaining', 'currencyFormat'],
          ['perPurchaseCapUsd', 'Per-purchase Cap', 'currencyFormat'],
          ['stepUpAboveUsd', 'Ask-me Line', 'currencyFormat'],
          ['periodStart', 'Period Start', 'dateTimeFormat'],
          ['periodEnd', 'Period End', 'dateTimeFormat'],
          ['daysLeft', 'Days Left', 'integerFormat'],
          ['current', 'Current Allowance', 'booleanFormat'],
        ]),
      },
      {
        id: 'decisions',
        description: 'One row per money-moving tool call the guard judged. firstBlock is the first blocking rule that failed (BLOCK only).',
        primaryKeyField: 'id',
        transactions: 'all',
        data: data.decisions,
        fields: fields('decisions', [
          ['id', 'Decision ID', 'textFormat'],
          ['at', 'Decided At', 'dateTimeFormat'],
          ['mandateId', 'Mandate ID', 'textFormat', true],
          ['runId', 'Agent Run', 'textFormat'],
          ['toolName', 'Tool', 'textFormat'],
          ['verdict', 'Verdict', 'textFormat'],
          ['amountUsd', 'Amount', 'currencyFormat'],
          ['merchantId', 'Merchant ID', 'textFormat', true],
          ['merchantName', 'Merchant Name', 'textFormat'],
          ['sku', 'SKU', 'textFormat'],
          ['itemName', 'Item', 'textFormat'],
          ['qty', 'Qty', 'integerFormat'],
          ['firstBlock', 'First Block', 'textFormat'],
          ['firstBlockName', 'First Block Rule', 'textFormat'],
          ['status', 'Decision Status', 'textFormat'],
          ['paypalConfirmed', 'PayPal Confirmed', 'booleanFormat'],
          ['captureId', 'Capture ID', 'textFormat'],
          ['refundId', 'Refund ID', 'textFormat'],
          ['undoExpiresAt', 'Undo Until', 'textFormat', true],
          ['latencyMs', 'Guard Latency (ms)', 'decimalFormat'],
          ['source', 'Source', 'textFormat'],
        ]),
      },
      {
        id: 'rule_results',
        name: 'Rule Results',
        description: 'The rule trace: every rule runs on every call. outcome FAIL on a block rule blocks; STEP_UP sends to the person.',
        transactions: 'add',
        data: data.rule_results,
        fields: fields('rule_results', [
          ['decisionId', 'Decision ID', 'textFormat', true],
          ['ruleId', 'Rule', 'textFormat'],
          ['ruleName', 'Rule Name', 'textFormat'],
          ['kind', 'Rule Kind', 'textFormat'],
          ['outcome', 'Outcome', 'textFormat'],
          ['detail', 'Detail', 'textFormat'],
        ]),
      },
      {
        id: 'merchants',
        description: 'Simulated merchants in the trusted catalog.',
        primaryKeyField: 'id',
        data: data.merchants,
        fields: fields('merchants', [
          ['id', 'Merchant ID', 'textFormat', true],
          ['name', 'Merchant', 'textFormat'],
          ['category', 'Merchant Category', 'textFormat'],
          ['riskFlags', 'Risk Flags', 'textFormat'],
        ]),
      },
      {
        id: 'paypal_transactions',
        name: 'PayPal Transactions',
        description: "PayPal's own record from the Transaction Search API (new activity can take up to 3 hours to appear). invoiceId is the ALLOWANCE decision id; refunds have negative amounts.",
        primaryKeyField: 'id',
        data: data.paypal_transactions,
        fields: fields('paypal_transactions', [
          ['id', 'PayPal Transaction ID', 'textFormat'],
          ['at', 'PayPal Time', 'dateTimeFormat'],
          ['eventCode', 'Event Code', 'textFormat'],
          ['eventName', 'PayPal Event', 'textFormat'],
          ['status', 'PayPal Status', 'textFormat'],
          ['amountUsd', 'PayPal Amount', 'currencyFormat'],
          ['currency', 'Currency', 'textFormat', true],
          ['invoiceId', 'Invoice ID', 'textFormat'],
          ['decisionId', 'Decision ID', 'textFormat', true],
          ['matched', 'Matched to a decision', 'booleanFormat'],
        ]),
      },
      {
        id: 'lab_results',
        name: 'Attack Lab',
        description: 'Attack Lab: attack success rate (asr) per attack family, unguarded vs guarded agent.',
        data: data.lab_results,
        fields: fields('lab_results', [
          ['family', 'Attack Family ID', 'textFormat', true],
          ['familyName', 'Attack Family', 'textFormat'],
          ['config', 'Configuration', 'textFormat'],
          ['scenarios', 'Scenarios', 'integerFormat'],
          ['runs', 'Runs', 'integerFormat'],
          ['successes', 'Successful Attacks', 'integerFormat'],
          ['asr', 'Attack Success Rate', 'percentageFormat'],
          ['holdout', 'Held Out', 'booleanFormat'],
        ]),
      },
    ],
    relationships: CONTROL_ROOM_RELATIONSHIPS,
  };
}
