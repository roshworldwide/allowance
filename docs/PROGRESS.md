# Progress

> **Single source of truth.** Top block is always current.

| | |
|---|---|
| **Now** | Waiting on keys for S0/S1/lab; Studio widgets (Verdict Stream, Attack Lab Matrix, 4-page report) in progress — Tue 23:30 IST |
| **Done** | M0 (except key-dependent spikes) · **M1** guard (12 rules, atomic ledger, chain, wrap; p95 0.87 ms) · catalog + **corpus 60+40** · **M2 code complete** (agent loop, vault link, executor, step-up poller, undo, routes, passcode/rate-limit/spend-cap, webhooks) · **M3** Errand console + Firewall Lane + verdict cards + phone approve page + replay (verified in Chromium at 1280×800 and 390×844) · **M4 runner ready** (needs key) · **M5** Control Room on real data + simulate_policy / draft_policy_change + proposal card · landing + /lab · README + all docs (numbers auto-synced) · CI + 6 e2e (prod build, axe) · render.yaml |
| **In flight** | Studio track: Verdict Stream + Attack Lab Matrix widgets, 4-page report |
| **Next (needs keys)** | S0 models → OPENAI_MODELS · S1 Vault link + $1 charge/refund · lab:quick → full lab · record replays · G1 repo · G3 deploy |
| **Blockers (need Roshan)** | 1) keys in `allowance/.env.local` · 2) **G1** yes · 3) holdout decision (write H01–H20 yourself with the kit, or log a cut) |
| **Latest numbers** | 170 tests green (unit, property, integration) + 6 e2e · guard p95 0.87 ms · no lab run yet |

## Milestones

| Milestone | Window (IST) | Status |
|---|---|---|
| M0 Setup + spikes | Tue 18:00–21:00 | done except S0/S1/S3c (waiting on keys) |
| M1 Guard core | Tue 21:00–Wed 01:00 | ✅ done Tue 17:02 |
| Overnight queue | Wed 01:00–09:00 | catalog ✅ · corpus ✅ · holdout ⛔ blocked |
| M2 Real money path + first deploy (G3) | Wed 09:00–13:00 | code complete, tested vs fake PayPal; live sandbox + deploy wait on keys/G3 |
| M3 Experience | Wed 13:00–17:30 | ✅ done Tue 23:10 (verified in browser) |
| M4 Attack Lab | Wed 17:30–21:00 | runner + metrics ready; run waits on OpenAI key |
| M5 Control Room | Wed 21:00–Thu 01:30 | real data + Auditor tools ✅; 2 widgets + report in progress |
| M6 Ship-ready · **feature freeze Thu 12:00** | Thu 08:00–12:00 | docs, CI, e2e, render.yaml done early |
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
- **Tue 23:00–23:30** M2 service + routes, M3 UI, M4 runner, M5 real data + policy tools, landing, /lab, webhooks, CI, e2e, docs — all committed.
