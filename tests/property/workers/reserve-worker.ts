// Worker process for the multi-process race test: evaluates N purchases against a shared SQLite file.
//   node --import tsx reserve-worker.ts <db file> <worker index> <count>
import { contract, guard, mandate, purchase } from '../../fixtures/guard';
import { openDb } from '../../../lib/store/db';
import { SqliteLedger } from '../../../lib/store/sqlite-ledger';

const [file, worker, count] = process.argv.slice(2);
const ledger = new SqliteLedger(openDb(file!));
let n = 0;
const g = guard(ledger);
const m = mandate({ id: 'mnd_race', budgetCents: 10_000, stepUpAboveCents: 100_000, velocity: { maxPerHour: 1000, maxPerMerchantWindowCents: 1_000_000, windowMinutes: 60 } });
const c = contract({ mandateId: 'mnd_race', lines: [{ id: 'P', category: 'office-supplies', productType: 'printer-paper', description: 'paper', maxQty: 100, maxUnitCents: 1000 }] });
const verdicts: string[] = [];
for (let i = 0; i < Number(count); i++) {
  verdicts.push(g.evaluate({ mandate: m, contract: c, intent: purchase('PT-PAPER-A4'), decisionId: `w${worker}-${n++}` }).verdict);
}
console.log(JSON.stringify(verdicts));
