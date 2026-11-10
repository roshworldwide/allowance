'use client';

import { AnimatePresence, motion } from 'motion/react';
import { Button, usd } from '@/components/ui';

export type PublicAllowance = {
  id: string;
  name: string;
  status: 'PENDING_LINK' | 'ACTIVE' | 'PAUSED' | 'REVOKED' | 'EXPIRED';
  budgetCents: number;
  perPurchaseCapCents: number;
  stepUpAboveCents: number;
  allowedCategories: string[];
  allowRecurring: boolean;
  periodEnd: string;
  vaultToken: string | null;
  committedCents: number;
  reservedCents: number;
  remainingCents: number;
};

const CAT: Record<string, string> = { 'office-supplies': 'office supplies', electronics: 'electronics', 'home-lighting': 'home lighting', services: 'services', 'gift-cards': 'gift cards', subscriptions: 'subscriptions' };

export function AllowanceCard({
  allowance,
  owner,
  busy,
  onCreate,
  onLink,
  onRevoke,
}: {
  allowance: PublicAllowance | null;
  owner: boolean;
  busy: boolean;
  onCreate: () => void;
  onLink: () => void;
  onRevoke: () => void;
}) {
  if (!allowance) {
    return (
      <section className="rounded-card border border-dashed border-line bg-surface p-4">
        <h2 className="text-sm font-semibold text-text">Give your agent an allowance</h2>
        <p className="mt-1 text-[13px] text-muted">$200 this month · max $60 per purchase · office supplies + electronics · no subscriptions · ask me above $40 · expires 30 Nov</p>
        <Button className="mt-3 w-full" onClick={onCreate} disabled={busy}>
          Create allowance
        </Button>
      </section>
    );
  }
  const active = allowance.status === 'ACTIVE';
  const ends = new Date(allowance.periodEnd).toLocaleDateString([], { day: 'numeric', month: 'short' });
  return (
    <AnimatePresence mode="wait">
      <motion.section
        key={allowance.status}
        initial={{ rotateX: -80, opacity: 0 }}
        animate={{ rotateX: 0, opacity: 1 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        style={{ transformPerspective: 800 }}
        className={`rounded-card border p-4 ${active ? 'border-allow/40 bg-surface' : 'border-line bg-surface'}`}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text">{allowance.name}</h2>
          <span className={`rounded-full border px-2 py-0.5 font-mono text-[10.5px] font-semibold ${active ? 'border-allow/50 text-allow' : allowance.status === 'REVOKED' ? 'border-block/50 text-block' : 'border-stepup/50 text-stepup'}`}>
            {allowance.status.replace('_', ' ')}
          </span>
        </div>
        <ul className="mt-2.5 space-y-1 text-[13px] text-muted">
          <li>
            <span className="font-mono text-text">{usd(allowance.budgetCents)}</span> this period · max <span className="font-mono text-text">{usd(allowance.perPurchaseCapCents)}</span> per purchase
          </li>
          <li>{allowance.allowedCategories.map((c) => CAT[c] ?? c).join(' + ')} only</li>
          <li>
            {allowance.allowRecurring ? 'subscriptions allowed' : 'no subscriptions'} · ask me above <span className="font-mono text-text">{usd(allowance.stepUpAboveCents)}</span>
          </li>
          <li>expires {ends}</li>
        </ul>
        {allowance.vaultToken && (
          <p className="mt-2.5 flex items-center gap-1.5 font-mono text-[11px] text-muted">
            <span className="text-allow">●</span> PayPal wallet (Vault) {allowance.vaultToken}
          </p>
        )}
        <div className="mt-3 flex gap-2">
          {allowance.status === 'PENDING_LINK' &&
            (owner ? (
              <Button className="flex-1" onClick={onLink} disabled={busy}>
                Link PayPal (sandbox)
              </Button>
            ) : (
              <p className="text-[12px] text-muted">The demo wallet isn&apos;t linked on this server yet.</p>
            ))}
          {active && (
            <Button tone="danger" size="sm" onClick={onRevoke} disabled={busy} title={owner ? 'Deletes the saved wallet at PayPal' : 'Stops this allowance'}>
              Revoke
            </Button>
          )}
          {(allowance.status === 'REVOKED' || allowance.status === 'EXPIRED') && (
            <Button tone="quiet" size="sm" onClick={onCreate} disabled={busy}>
              New allowance
            </Button>
          )}
        </div>
      </motion.section>
    </AnimatePresence>
  );
}

export function BudgetBar({ allowance }: { allowance: PublicAllowance | null }) {
  if (!allowance) return null;
  const b = Math.max(1, allowance.budgetCents);
  const pc = (n: number) => `${Math.min(100, (n / b) * 100)}%`;
  return (
    <footer className="sticky bottom-0 z-10 border-t border-line bg-ink/95 px-4 py-2.5 backdrop-blur sm:px-6" aria-label="Budget">
      <div className="mx-auto flex max-w-[1400px] items-center gap-4">
        <div className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`${usd(allowance.committedCents)} spent, ${usd(allowance.reservedCents)} awaiting approval, ${usd(allowance.remainingCents)} left`}>
          <div className="h-full bg-allow transition-[width] duration-500" style={{ width: pc(allowance.committedCents) }} />
          <div className="h-full bg-stepup transition-[width] duration-500" style={{ width: pc(allowance.reservedCents) }} />
        </div>
        <dl className="flex gap-4 font-mono text-[12px]">
          <div className="flex gap-1.5"><dt className="text-muted">spent</dt><dd className="text-allow">{usd(allowance.committedCents)}</dd></div>
          <div className="flex gap-1.5"><dt className="text-muted">held</dt><dd className="text-stepup">{usd(allowance.reservedCents)}</dd></div>
          <div className="flex gap-1.5"><dt className="text-muted">left</dt><dd className="text-text">{usd(allowance.remainingCents)}</dd></div>
        </dl>
      </div>
    </footer>
  );
}
