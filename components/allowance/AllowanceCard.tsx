'use client';

import { AnimatePresence, motion } from 'motion/react';
import { Button, usd } from '@/components/ui';
import { TitaniumCard } from './TitaniumCard';

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
      <section className="glass spot rim-accent p-5">
        <p className="eyebrow">Step 1</p>
        <h2 className="display mt-2 text-platinum text-[26px]">Give your agent an allowance</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">$200 this month · max $60 per purchase · office supplies + electronics · no subscriptions · ask me above $40 · expires 30 Nov</p>
        <Button className="mt-4 w-full" onClick={onCreate} disabled={busy}>
          Create allowance
        </Button>
      </section>
    );
  }
  const active = allowance.status === 'ACTIVE';
  const ends = new Date(allowance.periodEnd).toLocaleDateString([], { day: 'numeric', month: 'short' });
  const tone = active ? 'allow' : allowance.status === 'REVOKED' ? 'block' : 'stepup';
  const spent = allowance.budgetCents ? (allowance.committedCents + allowance.reservedCents) / allowance.budgetCents : 0;
  return (
    <AnimatePresence mode="wait">
      <motion.section
        key={allowance.status}
        initial={{ rotateX: -70, opacity: 0, y: 10 }}
        animate={{ rotateX: 0, opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        style={{ transformPerspective: 900 }}
        className="space-y-3"
      >
        <TitaniumCard
          amount={usd(allowance.remainingCents).replace(/\.00$/, '')}
          period="left"
          lines={[`max ${usd(allowance.perPurchaseCapCents).replace(/\.00$/, '')}`, `ask > ${usd(allowance.stepUpAboveCents).replace(/\.00$/, '')}`]}
          status={allowance.status === 'PENDING_LINK' ? 'AWAITING PAYPAL' : allowance.status === 'ACTIVE' ? 'LIVE' : allowance.status}
          statusTone={tone}
          vault={allowance.vaultToken}
          expires={ends}
          spentRatio={spent}
          compact
        />
        <div className={`glass p-4 ${active ? 'rim-allow' : ''}`}>
          <div className="flex items-center justify-between">
            <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-text">{allowance.name}</h2>
            <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold tracking-[0.1em] ${active ? 'border-allow/50 text-allow' : allowance.status === 'REVOKED' ? 'border-block/50 text-block' : 'border-stepup/50 text-stepup'}`}>
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
    <footer className="sticky bottom-0 z-30 px-3 pb-3 sm:px-5" aria-label="Budget">
      <div className="glass mx-auto flex max-w-[1480px] items-center gap-5 !rounded-full bg-[rgba(8,10,18,0.78)] px-5 py-3">
        <span className="eyebrow hidden sm:inline">Allowance</span>
        <div className="relative flex h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]" role="img" aria-label={`${usd(allowance.committedCents)} spent, ${usd(allowance.reservedCents)} awaiting approval, ${usd(allowance.remainingCents)} left`}>
          <div className="h-full bg-[linear-gradient(90deg,#1fb985,var(--al-allow))] shadow-[0_0_14px_var(--al-allow)] transition-[width] duration-700" style={{ width: pc(allowance.committedCents) }} />
          <div className="h-full bg-[linear-gradient(90deg,#d99a2b,var(--al-stepup))] transition-[width] duration-700" style={{ width: pc(allowance.reservedCents) }} />
          <div aria-hidden className="shimmer pointer-events-none absolute inset-0 opacity-30" />
        </div>
        <dl className="flex gap-4 font-mono text-[12px] tabular">
          <div className="flex gap-1.5"><dt className="text-muted">spent</dt><dd className="text-allow">{usd(allowance.committedCents)}</dd></div>
          <div className="flex gap-1.5"><dt className="text-muted">held</dt><dd className="text-stepup">{usd(allowance.reservedCents)}</dd></div>
          <div className="flex gap-1.5"><dt className="text-muted">left</dt><dd className="text-text">{usd(allowance.remainingCents)}</dd></div>
        </dl>
      </div>
    </footer>
  );
}
