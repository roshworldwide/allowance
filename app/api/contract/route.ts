// POST /api/contract { task } → the parsed task contract (unconfirmed) for the person to check.
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { contractFromDraft, type ContractDraft } from '@/lib/guard';
import { aiAvailable, parseTaskWithAi, parseTaskWithoutAi } from '@/lib/allowance/ai';
import { ctx } from '@/lib/allowance/context';
import { jsonError, readJson, requireLive, sessionMandate } from '@/lib/allowance/http';
import { label } from '@/lib/catalog';
import { insertContract } from '@/lib/store/repo';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const live = requireLive(req);
  if (live instanceof Response) return live;
  const sm = sessionMandate(live);
  if (!sm) return jsonError(404, 'Create an allowance first.');
  const body = await readJson<{ task?: unknown }>(req);
  const task = typeof body?.task === 'string' ? body.task.trim() : '';
  if (task.length < 5 || task.length > 400) return jsonError(400, 'Describe the errand in 5–400 characters.');

  const { db, world } = ctx();
  let draft: ContractDraft;
  let parser: 'ai' | 'keywords' = 'ai';
  try {
    draft = aiAvailable() ? await parseTaskWithAi(task, world.vocabulary, sm.mandate) : ((parser = 'keywords'), parseTaskWithoutAi(task, world.vocabulary, sm.mandate));
  } catch {
    parser = 'keywords';
    draft = parseTaskWithoutAi(task, world.vocabulary, sm.mandate);
  }
  if (draft.lines.length === 0) return jsonError(422, "Couldn't find anything to buy in that task. Try naming the items.", { unmapped: draft.unmapped });

  const id = `tc_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const contract = contractFromDraft({ id, mandateId: sm.mandate.id, draft, vocab: world.vocabulary, newLineId: (i) => `L${i + 1}` });
  insertContract(db, contract, task);
  const warnings = contract.lines
    .filter((l) => !sm.mandate.allowedCategories.includes(l.category))
    .map((l) => `${label(l.category)} isn't allowed by this allowance, so "${l.description}" will be blocked.`);
  return NextResponse.json({ contract, parser, unmapped: draft.unmapped, warnings }, { status: 201 });
}
