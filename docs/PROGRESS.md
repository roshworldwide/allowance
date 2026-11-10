# Progress

> **Single source of truth.** Top block is always current.

| | |
|---|---|
| **Now** | M2 Real money path (service layer + API routes) — Tue 22:45 IST, ~10 h ahead of plan on M1/corpus |
| **Done** | M0 scaffold + sandbox guard + doctor + secret hooks · S2 toolkit schemas · **S3 (a)(b) verified in browser** (Studio boots, Allowance Ring with Form Configuration) · **M1 guard**: 12 rules, atomic ledger, hash chain, wrap(); p95 0.87 ms · catalog (40 items, 6 merchants) · **corpus 60 attacks + 40 benign** (validated + sanity-checked) · agent loop + errand runner · passcode/rate-limit/spend-cap · guarded AI proxy |
| **In flight** | lib/allowance service (vault link, PayPal executor, undo, approvals poller) + API routes |
| **Next** | S0 + S1 the moment keys land · M3 Errand console + Firewall Lane · M4 lab run |
| **Blockers (need Roshan)** | 1) keys in `allowance/.env.local` (S0, S1, S3c) · 2) "yes" for **G1** (private repo) · 3) **holdout H01–H20**: the independent subagent was stopped by a safety filter before writing anything — decide: write them yourself with the kit, or log a cut |
| **Latest numbers** | 148 tests green · guard p95 0.87 ms (SQLite) · no lab run yet |

## Milestones

| Milestone | Window (IST) | Status |
|---|---|---|
| M0 Setup + spikes | Tue 18:00–21:00 | done except S0/S1/S3c (waiting on keys) |
| M1 Guard core | Tue 21:00–Wed 01:00 | ✅ done Tue 17:02 |
| Overnight queue | Wed 01:00–09:00 | catalog ✅ · corpus ✅ · holdout ⛔ blocked |
| M2 Real money path + first deploy (G3) | Wed 09:00–13:00 | in progress (agent loop, security done) |
| M3 Experience | Wed 13:00–17:30 | — |
| M4 Attack Lab | Wed 17:30–21:00 | — |
| M5 Control Room | Wed 21:00–Thu 01:30 | foundation ✅ (S3 a/b) |
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
- **Tue 17:15–19:50** Usage limit paused the background tracks; resumed 22:33.
- **Tue 22:40** Corpus (100 scenarios) and Studio foundation committed; ag-grid-community pinned to Studio's 36.3.0 to fix bundle resolution.
- **Tue 22:40** Holdout author refused by a safety filter before writing anything; independence intact; awaiting Roshan's decision.
