// npm run demo:reset — a clean slate before recording: removes allowances, contracts, decisions, the
// ledger, purchases, refunds and approvals from the local store. Keeps the saved sandbox wallet (kv) and
// the hash-chained audit log (append-only, never deleted). Stop the dev server first.
import './_env';
import path from 'node:path';
import { openDb } from '../lib/store/db';
import { verifyChain } from '../lib/guard/chain';
import { SqliteChainStore } from '../lib/store/sqlite-chain';

const db = openDb(process.env.ALLOWANCE_DB_PATH ?? path.join(process.cwd(), 'data', 'allowance.db'));
const tables = ['rule_results', 'refunds', 'approvals', 'purchases', 'ledger_entries', 'decisions', 'agent_runs', 'contract_lines', 'task_contracts', 'mandates'];
db.transaction(() => {
  for (const t of tables) db.prepare(`DELETE FROM ${t}`).run();
  db.prepare("DELETE FROM kv WHERE key LIKE 'setup:%' OR key LIKE 'replay_imported:%'").run();
})();
const chain = new SqliteChainStore(db);
chain.record('demo.reset', { tables });
const v = verifyChain(chain.all());
console.log(`demo:reset done — cleared ${tables.length} tables; saved wallet kept; audit chain ${v.ok ? `verified (${v.count} events)` : `BROKEN at ${v.brokenAt}`}.`);
