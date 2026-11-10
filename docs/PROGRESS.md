# Progress

> **Single source of truth.** Top block is always current.

| | |
|---|---|
| **Now** | All key-free work complete — Tue 23:55 IST. Waiting on keys (then `npm run go`) and on Roshan's G1 push |
| **Done** | M0 · **M1** guard (p95 0.87 ms) · corpus 60+40 · **M2** code (vault link, executor, step-up poller, undo, routes, security, webhooks) · **M3** Errand + Firewall Lane + cards + phone page + replay · **M4** runner/metrics · **M5** Control Room: 4 custom widgets (Allowance Ring, Verdict Stream, Attack Lab Matrix, Chain Seal) with Form Configuration, 4-page report, drill-through, live data, PayPal Transaction Search, Auditor (explain_verdict, simulate_policy, draft_policy_change, 2 Tool Components) · **M6** landing, /lab, README + all docs (numbers auto-synced), CI, 6 e2e + axe, render.yaml, DEPLOY + SUBMISSION_CHECKLIST, `npm run go`, `npm run media` |
| **In flight** | 10-second test (fresh reviewer) |
| **Next (needs keys)** | `npm run go` (S0, S1, smoke, lab quick + full, docs:sync) → record hero run → `npm run media` → G3 deploy → video (G4) → self-judge → G2 → G5 |
| **Blockers (need Roshan)** | 1) keys in `allowance/.env.local` · 2) **G1**: run the `gh repo create …` command in docs/SUBMISSION_CHECKLIST.md (my attempt was blocked by the session's auto-mode classifier) |
| **Latest numbers** | 165 vitest tests + 6 e2e green · guard p95 0.87 ms · no lab run yet · holdout: not run (logged cut) |

## Milestones

| Milestone | Window (IST) | Status |
|---|---|---|
| M0 Setup + spikes | Tue 18:00–21:00 | done except S0/S1/S3c (waiting on keys) |
| M1 Guard core | Tue 21:00–Wed 01:00 | ✅ done Tue 17:02 |
| Overnight queue | Wed 01:00–09:00 | catalog ✅ · corpus ✅ · holdout ⛔ blocked |
| M2 Real money path + first deploy (G3) | Wed 09:00–13:00 | code complete, tested vs fake PayPal; live sandbox + deploy wait on keys/G3 |
| M3 Experience | Wed 13:00–17:30 | ✅ done Tue 23:10 (verified in browser) |
| M4 Attack Lab | Wed 17:30–21:00 | runner + metrics ready; run waits on OpenAI key |
| M5 Control Room | Wed 21:00–Thu 01:30 | ✅ beyond Minimum Studio (4 widgets incl. Chain Seal, live data, Transaction Search); live chat needs key |
| M6 Ship-ready · **feature freeze Thu 12:00** | Thu 08:00–12:00 | docs, CI, e2e, render.yaml done early |
| M7 Video | Thu 12:00–17:00 | — |
| M8 Submission pack | Thu 17:00–21:00 | — |
| M9 Submit (G5) by 23:30 IST | Thu 21:00–23:30 | — |

## Cuts log
- **Tue 23:40 — Holdout H01–H20: not run (reversible).** The independent holdout author was stopped by a safety filter before writing anything (independence intact) and no human-written holdout exists yet. Effect: README/`/lab`/video report the holdout as "not run" (via `lib/lab` markers); DoD #4 is met without a holdout row; the video script's holdout line is omitted. If Roshan writes H01–H20 with the kit, `npm run lab:holdout` (seal-checked) fills the row and the docs re-sync.

## Log
- **Tue 16:16** Session start. Read the master prompt, Devpost pages, boilerplate.
- **Tue 16:40** M0 scaffold committed (`7a1274c`); gitleaks clean.
- **Tue 16:55** S2 done (47 toolkit tools, Chat Completions format); Studio track started in parallel.
- **Tue 17:15–19:50** Usage limit paused the background tracks; resumed 22:33.
- **Tue 22:40** Corpus (100 scenarios) and Studio foundation committed; ag-grid-community pinned to Studio's 36.3.0 to fix bundle resolution.
- **Tue 22:40** Holdout author refused by a safety filter before writing anything; independence intact; awaiting Roshan's decision.
- **Tue 23:00–23:30** M2 service + routes, M3 UI, M4 runner, M5 real data + policy tools, landing, /lab, webhooks, CI, e2e, docs — all committed.
- **Tue 23:35** Studio widgets + 4-page report committed; removed invented Attack Lab numbers from sample data.
- **Tue 23:55** Transaction Search ledger, live Control Room, current-allowance ring, Chain Seal, media capture, go orchestrator, deploy + submission docs committed. G1 push blocked by the session classifier.
- **Wed 00:25** Design pass "Obsidian & Light" (done from the Cowork session, verified live in Chrome at 1710 px and 1200 px): glass/rim-light design system, aurora + grain, living Gate hero canvas with a 1.4 s CSS intro, titanium allowance card (landing, Errand, Replay), Firewall Lane rebuilt as a ring of 12 rule lamps with verdict halo/shockwave and light-trail packets, NowCaption under the lane, restyled verdict cards, budget dock, approve sheet, Attack Lab and Control Room header. tsc, eslint, 165 vitest and `next build` green; e2e selectors preserved (texts unchanged). Re-run `npm run test:e2e` on the Mac before G3.
