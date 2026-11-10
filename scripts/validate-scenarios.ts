// Validates Attack Lab scenario files: schema, family/id, SKUs and product types exist in the scenario's
// world, contract lines match the vocabulary, and benign tasks are achievable under the mandate.
//   npm run lab:validate [-- <folder>]       (default: attacks + benign; holdout is validated only by the lab runner)
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { buildWorld } from '../lib/catalog';
import { Scenario } from '../lib/lab/scenario-schema';
import typesJson from '../catalog/product-types.json';

const TYPES = typesJson as Record<string, { category: string }>;
const folders = process.argv[2] ? [process.argv[2]] : ['lib/lab/scenarios/attacks', 'lib/lab/scenarios/benign'];
let errors = 0;
let count = 0;
const ids = new Set<string>();

for (const folder of folders) {
  let files: string[] = [];
  try {
    files = readdirSync(folder).filter((f) => f.endsWith('.json')).sort();
  } catch {
    console.log(`(no folder ${folder})`);
    continue;
  }
  for (const f of files) {
    count++;
    const file = path.join(folder, f);
    const problems: string[] = [];
    let s: Scenario;
    try {
      s = Scenario.parse(JSON.parse(readFileSync(file, 'utf8')));
    } catch (e) {
      console.log(`✗ ${file}\n    ${(e as Error).message.split('\n').slice(0, 6).join('\n    ')}`);
      errors++;
      continue;
    }
    if (f !== `${s.id}.json`) problems.push(`file name should be ${s.id}.json`);
    if (ids.has(s.id)) problems.push(`duplicate id ${s.id}`);
    ids.add(s.id);
    const world = buildWorld([{ items: s.catalogOverrides?.items, display: s.catalogOverrides?.display, pages: s.poisonedPages, reviews: s.reviews }]);
    for (const l of s.contract.lines) if (!TYPES[l.productType]) problems.push(`contract productType "${l.productType}" not in vocabulary`);
    for (const sku of [...(s.attackSkus ?? []), ...Object.keys(s.poisonedPages ?? {}), ...Object.keys(s.reviews ?? {}), ...Object.keys(s.catalogOverrides?.display ?? {})]) {
      if (!world.registry.item(sku)) problems.push(`SKU ${sku} not in the scenario world`);
    }
    for (const it of s.catalogOverrides?.items ?? []) {
      const item = world.registry.item(it.sku);
      if (item && TYPES[item.productType] && TYPES[item.productType]!.category !== item.category) problems.push(`${it.sku}: category ${item.category} ≠ vocabulary ${TYPES[item.productType]!.category}`);
      if (item && !TYPES[item.productType]) problems.push(`${it.sku}: productType ${item.productType} not in vocabulary`);
    }
    if (s.family === 'BENIGN') {
      // Achievable: each expected line has at least one registry item within the line's ceiling.
      for (const e of s.expected!.complete) {
        const line = s.contract.lines.find((l) => l.productType === e.productType);
        if (!line) problems.push(`expected ${e.productType} has no contract line`);
        else if (!world.items().some((i) => i.productType === e.productType && i.currency === 'USD' && i.priceMinor <= line.maxUnitCents && !i.trialConvertsToRecurring && i.recurringMinor === null)) {
          problems.push(`no USD item of type ${e.productType} within ${line.maxUnitCents}`);
        }
      }
    }
    if (problems.length) {
      errors++;
      console.log(`✗ ${file}\n    ${problems.join('\n    ')}`);
    }
  }
}
console.log(`\n${count} scenario file(s) checked, ${errors} with problems.`);
process.exitCode = errors ? 1 : 0;
