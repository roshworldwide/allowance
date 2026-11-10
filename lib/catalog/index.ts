// The simulated marketplace. One world has two faces:
//   - TRUSTED: the catalog registry (SKU → merchant, category, product type, price, currency, recurring
//     flags) and the product-type vocabulary. Only these reach the guard and the task parser.
//   - UNTRUSTED: listing names/summaries/prices as displayed, product pages, reviews and seller notes.
//     Only the agent sees these, and every tool result carrying them is marked untrusted.
// Overlays (the live demo, or an Attack Lab scenario) patch either face.
import categoriesJson from '@/catalog/categories.json';
import itemsJson from '@/catalog/items.json';
import merchantsJson from '@/catalog/merchants.json';
import typesJson from '@/catalog/product-types.json';
import { CatalogItem, Merchant, type CatalogRegistry, type Vocabulary } from '@/lib/guard';

export type Review = { author: string; stars: number; text: string };

export type Listing = {
  sku: string;
  name: string;
  merchantName: string;
  summary: string;
  rating: number;
  bullets: string[];
  /** The price as displayed to the agent (may differ from the registry in a price-bait scenario). */
  displayPriceMinor: number;
  displayCurrency: string;
};

type RawItem = (typeof itemsJson)[number] & Record<string, unknown>;

export type CatalogOverlay = {
  id?: string;
  description?: string;
  /** Add or patch registry items (the trusted truth for this world). */
  items?: (Partial<CatalogItem> & { sku: string } & Partial<Pick<Listing, 'summary' | 'rating' | 'bullets'>>)[];
  /** Untrusted: what listings show (names, summaries, displayed prices). */
  display?: Record<string, Partial<Omit<Listing, 'sku' | 'merchantName'>>>;
  /** Untrusted: product page text. */
  pages?: Record<string, { append?: string; replace?: string }>;
  /** Untrusted: reviews and seller Q&A. */
  reviews?: Record<string, { append?: Review[]; replace?: Review[] }>;
  removeSkus?: string[];
};

export type SearchHit = Pick<Listing, 'sku' | 'name' | 'merchantName' | 'summary' | 'rating'> & { price: string };

export type World = {
  registry: CatalogRegistry;
  vocabulary: Vocabulary;
  items(): CatalogItem[];
  merchants(): Merchant[];
  listing(sku: string): Listing | undefined;
  search(query: string, limit?: number): SearchHit[];
  page(sku: string): string | undefined;
  reviews(sku: string): Review[];
};

const MERCHANTS: Merchant[] = merchantsJson.map((m) => Merchant.parse(m));
const TYPES = typesJson as Record<string, { category: string; label: string }>;
const CATEGORIES = categoriesJson as Record<string, string>;

export function label(key: string): string {
  return TYPES[key]?.label ?? CATEGORIES[key] ?? key.replace(/-/g, ' ');
}

export function formatPrice(minor: number, currency: string): string {
  if (currency === 'USD') return `$${(minor / 100).toFixed(2)}`;
  if (currency === 'JPY') return `¥${minor.toLocaleString('en-US')}`;
  if (currency === 'INR') return `₹${(minor / 100).toFixed(2)}`;
  return `${(minor / 100).toFixed(2)} ${currency}`;
}

export function buildWorld(overlays: CatalogOverlay[] = []): World {
  const registry = new Map<string, CatalogItem>();
  const listings = new Map<string, Listing>();
  const pages = new Map<string, { append: string[]; replace?: string }>();
  const reviews = new Map<string, Review[]>();
  const merchantName = (id: string) => MERCHANTS.find((m) => m.id === id)?.name ?? id;

  const put = (raw: Partial<RawItem> & { sku: string }) => {
    const prev = registry.get(raw.sku);
    const item = CatalogItem.parse({ ...prev, ...pickRegistry(raw) });
    registry.set(item.sku, item);
    const prevListing = listings.get(item.sku);
    listings.set(item.sku, {
      sku: item.sku,
      name: item.name,
      merchantName: merchantName(item.merchantId),
      summary: (raw.summary as string | undefined) ?? prevListing?.summary ?? '',
      rating: (raw.rating as number | undefined) ?? prevListing?.rating ?? 4.0,
      bullets: (raw.bullets as string[] | undefined) ?? prevListing?.bullets ?? [],
      displayPriceMinor: item.priceMinor,
      displayCurrency: item.currency,
    });
    if (Array.isArray(raw.reviews)) reviews.set(item.sku, raw.reviews as Review[]);
  };

  for (const raw of itemsJson as RawItem[]) put(raw);

  for (const o of overlays) {
    for (const sku of o.removeSkus ?? []) {
      registry.delete(sku);
      listings.delete(sku);
    }
    for (const patch of o.items ?? []) put(patch as Partial<RawItem> & { sku: string });
    for (const [sku, d] of Object.entries(o.display ?? {})) {
      const l = listings.get(sku);
      if (l) listings.set(sku, { ...l, ...d });
    }
    for (const [sku, p] of Object.entries(o.pages ?? {})) {
      const cur = pages.get(sku) ?? { append: [] };
      if (p.replace !== undefined) cur.replace = p.replace;
      if (p.append) cur.append.push(p.append);
      pages.set(sku, cur);
    }
    for (const [sku, r] of Object.entries(o.reviews ?? {})) {
      if (r.replace) reviews.set(sku, r.replace);
      if (r.append) reviews.set(sku, [...(reviews.get(sku) ?? []), ...r.append]);
    }
  }

  const vocabulary: Vocabulary = { productTypes: TYPES };
  const merchants = new Map(MERCHANTS.map((m) => [m.id, m]));

  return {
    registry: { item: (sku) => registry.get(sku), merchant: (id) => merchants.get(id), label },
    vocabulary,
    items: () => [...registry.values()],
    merchants: () => MERCHANTS,
    listing: (sku) => listings.get(sku),
    search(query, limit = 8) {
      const terms = tokens(query);
      const scored = [...listings.values()]
        .map((l) => {
          const item = registry.get(l.sku)!;
          const hay = tokens(`${l.name} ${l.summary} ${label(item.productType)} ${l.merchantName} ${item.productType}`);
          const score = terms.reduce((s, t) => s + (hay.some((h) => h === t || h.startsWith(t) || t.startsWith(h)) ? 1 : 0), 0);
          return { l, score };
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score || a.l.displayPriceMinor - b.l.displayPriceMinor);
      return scored.slice(0, limit).map(({ l }) => ({ sku: l.sku, name: l.name, merchantName: l.merchantName, summary: l.summary, rating: l.rating, price: formatPrice(l.displayPriceMinor, l.displayCurrency) }));
    },
    page(sku) {
      const l = listings.get(sku);
      if (!l) return undefined;
      const p = pages.get(sku);
      const base =
        p?.replace ??
        [
          `# ${l.name}`,
          `Sold by ${l.merchantName} · ★ ${l.rating.toFixed(1)}`,
          ``,
          `**Price:** ${formatPrice(l.displayPriceMinor, l.displayCurrency)}`,
          ``,
          l.summary,
          ``,
          ...l.bullets.map((b) => `- ${b}`),
          ``,
          `Free shipping in 3–5 business days · 30-day returns.`,
        ].join('\n');
      return [base, ...(p?.append ?? [])].join('');
    },
    reviews: (sku) => reviews.get(sku) ?? [],
  };
}

function pickRegistry(raw: Record<string, unknown>) {
  const keys = ['sku', 'name', 'merchantId', 'category', 'productType', 'priceMinor', 'currency', 'trialConvertsToRecurring', 'recurringMinor', 'kind'];
  return Object.fromEntries(Object.entries(raw).filter(([k]) => keys.includes(k)));
}

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9$.\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((t) => t.length > 1);
}

/** The world the live errand runs in (demo overlay: the poisoned cable page). */
export async function demoOverlay(): Promise<CatalogOverlay> {
  return (await import('@/catalog/overlays/demo.json')).default as CatalogOverlay;
}
