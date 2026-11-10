import { describe, expect, it } from 'vitest';
import { confirmContract, contractDraftSchema, contractFromDraft, resolveLine, type Vocabulary } from '@/lib/guard';
import { contract, purchase, registry } from '../fixtures/guard';

const vocab: Vocabulary = {
  productTypes: {
    'usb-c-cable': { category: 'electronics', label: 'USB-C cable' },
    'desk-lamp': { category: 'office-supplies', label: 'desk lamp' },
  },
};

describe('contract draft schema (structured output of the task parser)', () => {
  const schema = contractDraftSchema(vocab);

  it('accepts lines whose product type exists in the registry vocabulary', () => {
    const d = schema.parse({ lines: [{ productType: 'usb-c-cable', description: 'USB-C cable', maxQty: 2, maxUnitCents: 1500 }], unmapped: [] });
    expect(d.lines).toHaveLength(1);
  });

  it('rejects product types the registry does not know (the parser cannot invent categories)', () => {
    expect(() => schema.parse({ lines: [{ productType: 'gift-card', description: 'gift card', maxQty: 1, maxUnitCents: 20000 }], unmapped: [] })).toThrow();
  });

  it('rejects zero quantities and fractional cents', () => {
    expect(() => schema.parse({ lines: [{ productType: 'usb-c-cable', description: 'x', maxQty: 0, maxUnitCents: 100 }], unmapped: [] })).toThrow();
    expect(() => schema.parse({ lines: [{ productType: 'usb-c-cable', description: 'x', maxQty: 1, maxUnitCents: 10.5 }], unmapped: [] })).toThrow();
  });
});

describe('contractFromDraft / confirmContract', () => {
  it('takes the category from the registry vocabulary, not from the parser', () => {
    const c = contractFromDraft({
      id: 'tc1',
      mandateId: 'm1',
      vocab,
      newLineId: (i) => `L${i + 1}`,
      draft: { lines: [{ productType: 'desk-lamp', description: 'Desk lamp under $50', maxQty: 1, maxUnitCents: 5000 }], unmapped: [] },
    });
    expect(c.lines[0]).toEqual({ id: 'L1', category: 'office-supplies', productType: 'desk-lamp', description: 'Desk lamp under $50', maxQty: 1, maxUnitCents: 5000 });
    expect(c.confirmedAt).toBeNull();
  });

  it('confirming is idempotent and stamps the time once', () => {
    const t1 = new Date('2026-11-11T10:00:00Z');
    const c = confirmContract(contract({ confirmedAt: null }), t1);
    expect(c.confirmedAt).toBe(t1.toISOString());
    expect(confirmContract(c, new Date('2026-12-01T00:00:00Z')).confirmedAt).toBe(t1.toISOString());
  });
});

describe('resolveLine', () => {
  const reg = registry();
  it('uses the named line when it matches the registry item', () => {
    expect(resolveLine(contract(), purchase('VW-CBL-USBC-1M', 1, { contractLineId: 'L1' }), reg.item('VW-CBL-USBC-1M'))).toMatchObject({ resolution: 'explicit', line: { id: 'L1' } });
  });
  it('infers the matching line when the named one does not match', () => {
    expect(resolveLine(contract(), purchase('NW-LAMP-LED', 1, { contractLineId: 'L1' }), reg.item('NW-LAMP-LED'))).toMatchObject({ resolution: 'inferred', line: { id: 'L2' } });
  });
  it('returns no line for an item that is not in the task', () => {
    expect(resolveLine(contract(), purchase('VW-HUB-USBC-7', 1, { contractLineId: 'L1' }), reg.item('VW-HUB-USBC-7'))).toEqual({ resolution: 'invalid' });
    expect(resolveLine(contract(), purchase('VW-HUB-USBC-7'), reg.item('VW-HUB-USBC-7'))).toEqual({ resolution: 'none' });
  });
  it('with two lines of the same type, picks the one whose ceiling fits', () => {
    const c = contract({
      lines: [
        { id: 'A', category: 'electronics', productType: 'usb-c-cable', description: 'short cable', maxQty: 1, maxUnitCents: 1200 },
        { id: 'B', category: 'electronics', productType: 'usb-c-cable', description: 'long cable', maxQty: 1, maxUnitCents: 2000 },
      ],
    });
    expect(resolveLine(c, purchase('VW-CBL-USBC-2M'), reg.item('VW-CBL-USBC-2M'))).toMatchObject({ line: { id: 'B' } });
  });
});
