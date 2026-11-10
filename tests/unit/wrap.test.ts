import { describe, expect, it, vi } from 'vitest';
import toolkit from '@/docs/notes/agent-toolkit-1.11.0-tools.json';
import { MemoryLedger, classifyTool, normaliseTool, toIntent, wrap, type Intent, type WrapSession } from '@/lib/guard';
import { contract, guard, mandate } from '../fixtures/guard';

const TOOLKIT_NAMES = (toolkit as { tools: { name: string }[] }).tools.map((t) => t.name);

describe('tool classification', () => {
  it('knows every PayPal Agent Toolkit 1.11.0 tool name (47) as READ, MONEY or default-deny', () => {
    expect(TOOLKIT_NAMES).toHaveLength(47);
    const classes = Object.fromEntries(TOOLKIT_NAMES.map((n) => [n, classifyTool(n)]));
    for (const n of ['create_order', 'pay_order', 'create_refund', 'create_invoice', 'send_invoice', 'create_subscription', 'create_subscription_plan', 'create_recurring_series', 'accept_dispute_claim']) {
      expect(classes[n], n).toBe('MONEY');
    }
    for (const n of ['get_order', 'list_transactions', 'get_refund', 'get_merchant_insights', 'list_invoices', 'show_subscription_details']) {
      expect(classes[n], n).toBe('READ');
    }
    // Remaining write tools that are neither read-only nor mapped are default-deny (UNKNOWN → blocked).
    const unknown = TOOLKIT_NAMES.filter((n) => classes[n] === 'UNKNOWN');
    expect(unknown).toEqual(expect.arrayContaining(['create_product', 'cancel_subscription', 'delete_invoice']));
    expect(unknown.every((n) => !/^(get|list|show|search)_/.test(n))).toBe(true);
  });

  it('our read tools pass through; allowance_checkout is MONEY', () => {
    expect(classifyTool('search_catalog')).toBe('READ');
    expect(classifyTool('view_product')).toBe('READ');
    expect(classifyTool('allowance_checkout')).toBe('MONEY');
  });
});

describe('toIntent', () => {
  it('maps allowance_checkout to a PURCHASE with identifiers only', () => {
    const i = toIntent('allowance_checkout', { sku: 'VW-CBL-USBC-1M', qty: 2, contractLineId: 'L1', quotedUnitCents: 1199 });
    expect(i).toMatchObject({ kind: 'PURCHASE', sku: 'VW-CBL-USBC-1M', qty: 2, contractLineId: 'L1', quotedUnitCents: 1199, overrides: {} });
    expect(i.rawArgsHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('records smuggled amount, payee and currency as overrides (never honoured)', () => {
    const i = toIntent('allowance_checkout', { sku: 'X', qty: 1, amountCents: 100, payee: 'seller@evil.example', currency: 'INR' });
    expect(i.overrides).toEqual({ amountCents: 100, payee: 'seller@evil.example', currency: 'INR' });
  });

  it('maps toolkit create_order items to an agent-set amount', () => {
    const i = toIntent('create_order', { currencyCode: 'USD', items: [{ name: 'Hub', quantity: 2, itemCost: 17 }] });
    expect(i).toMatchObject({ kind: 'OTHER_MONEY', overrides: { amountCents: 3400, currency: 'USD' } });
  });

  it('maps refunds, invoices and subscriptions to their kinds', () => {
    expect(toIntent('create_refund', { capture_id: 'C1' }).kind).toBe('REFUND');
    expect(toIntent('send_invoice', { invoice_id: 'INV2-1' }).kind).toBe('INVOICE');
    expect(toIntent('create_subscription', { plan_id: 'P-1' })).toMatchObject({ kind: 'SUBSCRIBE', recurring: true });
    expect(toIntent('create_recurring_series', {})).toMatchObject({ kind: 'INVOICE', recurring: true });
  });

  it('treats unknown tools as OTHER_MONEY', () => {
    expect(toIntent('wire_transfer', { to: 'x' }).kind).toBe('OTHER_MONEY');
  });

  it('argument hash is stable regardless of key order', () => {
    expect(toIntent('allowance_checkout', { sku: 'A', qty: 1 }).rawArgsHash).toBe(toIntent('allowance_checkout', { qty: 1, sku: 'A' }).rawArgsHash);
  });
});

describe('normaliseTool', () => {
  it('flattens Chat Completions tools (the toolkit format) into Responses tools', () => {
    const t = normaliseTool({ type: 'function', function: { name: 'get_order', description: 'Get', parameters: { type: 'object', properties: { id: { type: 'string' } } } } });
    expect(t).toEqual({ type: 'function', name: 'get_order', description: 'Get', parameters: { type: 'object', properties: { id: { type: 'string' } } } });
  });
});

describe('wrap()', () => {
  function session(overrides: Partial<WrapSession> = {}) {
    const g = guard(new MemoryLedger());
    const m = mandate();
    const c = contract();
    return {
      evaluate: (intent: Intent) => g.evaluate({ mandate: m, contract: c, intent }),
      execute: vi.fn(async () => ({ orderId: 'ORDER-1', status: 'COMPLETED' })),
      passThrough: vi.fn(async () => ({ results: ['ok'] })),
      ...overrides,
    } satisfies WrapSession;
  }
  const tools = [
    { name: 'search_catalog', description: 'search', parameters: { type: 'object', properties: {} } },
    { name: 'allowance_checkout', description: 'buy', parameters: { type: 'object', properties: {} } },
    { type: 'function' as const, function: { name: 'create_refund', description: 'refund', parameters: { type: 'object', properties: {} } } },
  ];

  it('passes read tools through without evaluating', async () => {
    const s = session();
    const w = wrap(tools, s);
    const out = await w.invoke({ name: 'search_catalog', args: { query: 'usb-c' } });
    expect(out).toEqual({ kind: 'passthrough', tool: 'search_catalog', output: { results: ['ok'] } });
    expect(s.execute).not.toHaveBeenCalled();
  });

  it('executes an ALLOWed purchase', async () => {
    const s = session();
    const out = await wrap(tools, s).invoke({ name: 'allowance_checkout', args: { sku: 'VW-CBL-USBC-1M', qty: 2, contractLineId: 'L1', quotedUnitCents: 1199 } });
    expect(out.kind === 'verdict' && out.verdict.verdict).toBe('ALLOW');
    expect(s.execute).toHaveBeenCalledOnce();
  });

  it('never executes a BLOCKed call', async () => {
    const s = session();
    const out = await wrap(tools, s).invoke({ name: 'allowance_checkout', args: { sku: 'VW-HUB-USBC-7', qty: 1, contractLineId: 'L1', quotedUnitCents: 3400 } });
    expect(out.kind === 'verdict' && out.verdict.firstBlock).toBe('R02');
    expect(s.execute).not.toHaveBeenCalled();
  });

  it('blocks the toolkit refund tool and never executes it', async () => {
    const s = session();
    const out = await wrap(tools, s).invoke({ name: 'create_refund', args: { capture_id: '3B017991HX624902V' } });
    expect(out.kind === 'verdict' && out.verdict.firstBlock).toBe('R12');
    expect(s.execute).not.toHaveBeenCalled();
  });

  it('blocks a tool the agent invented (not in the toolbelt)', async () => {
    const s = session();
    const out = await wrap(tools, s).invoke({ name: 'send_money', args: { to: 'x', amount: '50.00' } });
    expect(out.kind === 'verdict' && out.verdict.verdict).toBe('BLOCK');
    expect(s.execute).not.toHaveBeenCalled();
    expect(s.passThrough).not.toHaveBeenCalled();
  });

  it('reports every outcome to onOutcome', async () => {
    const seen: string[] = [];
    const s = session({ onOutcome: (o) => seen.push(o.kind) });
    const w = wrap(tools, s);
    await w.invoke({ name: 'search_catalog', args: {} });
    await w.invoke({ name: 'create_refund', args: {} });
    expect(seen).toEqual(['passthrough', 'verdict']);
  });
});
