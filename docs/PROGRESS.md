# Progress

> **Single source of truth.** Top block is always current.

| | |
|---|---|
| **Now** | M0 Setup + spikes (started Tue 10 Nov 16:16 IST, ~2 h ahead of plan) → M1 Guard core in parallel |
| **Done** | Devpost facts re-verified · scaffold (Next 16.3.6, AG Studio 3.1.0) · sandbox boot guard (tested: refuses `PAYPAL_ENV=live`) · PayPal client + Vault/Orders/Refunds modules · SQLite schema · `npm run doctor` · secretlint + known-secrets pre-commit · gitleaks scan (clean) · Playwright · **S2** toolkit schemas recorded |
| **In flight** | S3 Studio spike + Control Room foundation (parallel track) · M1 guard core |
| **Next** | S0 models + S1 Vault spike as soon as keys are in `.env.local` · G1 private repo |
| **Blockers (need Roshan)** | 1) paste keys into `allowance/.env.local` · 2) "yes" for **G1** (private GitHub repo `allowance`) · 3) approve the S1 Vault link with the US sandbox Personal account |
| **Latest numbers** | none yet (no lab run) |

## Milestones

| Milestone | Window (IST) | Status |
|---|---|---|
| M0 Setup + spikes | Tue 18:00–21:00 | in progress (S2 ✓, S3 running, S0/S1 waiting on keys) |
| M1 Guard core | Tue 21:00–Wed 01:00 | started early |
| Overnight queue | Wed 01:00–09:00 | — |
| M2 Real money path + first deploy (G3) | Wed 09:00–13:00 | — |
| M3 Experience | Wed 13:00–17:30 | — |
| M4 Attack Lab | Wed 17:30–21:00 | — |
| M5 Control Room | Wed 21:00–Thu 01:30 | foundation started in M0 |
| M6 Ship-ready · **feature freeze Thu 12:00** | Thu 08:00–12:00 | — |
| M7 Video | Thu 12:00–17:00 | — |
| M8 Submission pack | Thu 17:00–21:00 | — |
| M9 Submit (G5) by 23:30 IST | Thu 21:00–23:30 | — |

## Cuts log
_None yet._

## Log
- **Tue 16:16** Session start. Read the master prompt, Devpost pages, boilerplate.
- **Tue 16:40** M0 scaffold committed (`7a1274c`); gitleaks clean.
- **Tue 16:55** S2 done (47 toolkit tools, Chat Completions format); Studio track started in parallel.
