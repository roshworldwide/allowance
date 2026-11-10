// npm run verify-chain — recomputes every hash of the decision audit log and reports the first break.
import './_env';
import path from 'node:path';
import { verifyChain } from '../lib/guard/chain';
import { openDb } from '../lib/store/db';
import { SqliteChainStore } from '../lib/store/sqlite-chain';

const db = openDb(process.env.ALLOWANCE_DB_PATH ?? path.join(process.cwd(), 'data', 'allowance.db'));
const events = new SqliteChainStore(db).all();
const v = verifyChain(events);
if (v.ok) console.log(`✓ chain verified: ${v.count} events, head ${v.head.slice(0, 16)}…`);
else console.log(`✗ chain broken at seq ${v.brokenAt}: ${v.reason} (${v.count} events)`);
const types = events.reduce<Record<string, number>>((m, e) => ({ ...m, [e.type]: (m[e.type] ?? 0) + 1 }), {});
console.log(Object.entries(types).map(([t, n]) => `${t} ${n}`).join(' · '));
process.exitCode = v.ok ? 0 : 1;
