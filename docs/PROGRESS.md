# Progress

> **Single source of truth.** Top block is always current.

| | |
|---|---|
| **Now** | Wed 09:45: e2e green again (6/6) after an accessibility fix; an axe scan of every page and width finds no serious issues. Next: `npm run media` → G3 deploy |
| **Done** | M0 · **M1** guard (p95 0.87 ms) · corpus 60+40 · **M2** code (vault link, executor, step-up poller, undo, routes, security, webhooks) · **M3** Errand + Firewall Lane + cards + phone page + replay · **M4** runner/metrics · **M5** Control Room: 4 custom widgets (Allowance Ring, Verdict Stream, Attack Lab Matrix, Chain Seal) with Form Configuration, 4-page report, drill-through, live data, PayPal Transaction Search, Auditor (explain_verdict, simulate_policy, draft_policy_change, 2 Tool Components) · **M6** landing, /lab, README + all docs (numbers auto-synced), CI, 6 e2e + axe, render.yaml, DEPLOY + SUBMISSION_CHECKLIST, `npm run go`, `npm run media` · **keys run** (Wed 08:52): S0 → `gpt-5.4-mini`, sandbox wallet linked, full Attack Lab (600 runs, ≈ $2.49), docs synced · hero run recorded (`replays/2026-11-11-03-43-5d4c0c.json`) · **G1** repo on GitHub (`roshworldwide/allowance`) |
| **In flight** | 10-second test (fresh reviewer) |
| **Next** | `npm run media` → G3 deploy + `npm run webhook:register` → video (G4) → self-judge → G2 → G5 |
| **Blockers (need Roshan)** | `git push` (main is ahead of origin) · **G3**: approve the Render deploy (docs/DEPLOY.md) |
| **Latest numbers** | 181 vitest + 6 e2e green · stress test passed (Wed 10:40, see log) · axe: no serious/critical issues (all pages, 1280 + 390 px, all 4 Control Room pages) · Attack Lab, 600 runs on `gpt-5.4-mini`: attacks got through 21.1% unguarded (38/180) → 0.0% with ALLOWANCE (0/180); false blocks 0.0% (0/120) · guard p95 0.86 ms (364 decisions) · holdout: not run (logged cut) |

## Milestones

| Milestone | Window (IST) | Status |
|---|---|---|
| M0 Setup + spikes | Tue 18:00–21:00 | done except S3c (live Auditor chat check) |
| M1 Guard core | Tue 21:00–Wed 01:00 | ✅ done Tue 17:02 |
| Overnight queue | Wed 01:00–09:00 | catalog ✅ · corpus ✅ · holdout ⛔ blocked |
| M2 Real money path + first deploy (G3) | Wed 09:00–13:00 | live in sandbox (hero run recorded Wed 09:18); deploy waits on G3 |
| M3 Experience | Wed 13:00–17:30 | ✅ done Tue 23:10 (verified in browser) |
| M4 Attack Lab | Wed 17:30–21:00 | ✅ full run Wed 08:52 (600 runs, ≈ $2.49) |
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
- **Wed 00:45** Apple-style pass (Roshan's direction: minimal, uncongested, Apple-like): pure black, SF Pro system font (Geist fallback), #f5f5f7/#86868b text, Apple blue pills + chevron links, flat #161617 cards, 44 px translucent nav; landing rewritten as one idea per screen (hero + Gate, verdicts, card, principle, numbers, PayPal, CTA); Replay and Errand now single-column (lane → caption → verdict grid → transcript in a disclosure); Attack Lab header centred. Aurora/grain/spotlight/intro removed. tsc, eslint, 165 vitest and `next build` green; e2e texts unchanged.
- **Wed 01:15** Keys in. `go` had stopped at step 1 because `.env.local` wasn't saved yet; step 1 now names the file, its last-saved time and any line that isn't NAME=value, and reads the file with dotenv's grammar (same as Next.js). doctor online: PayPal sandbox OAuth ✓, OpenAI key ✓ (96 models). S0 rebuilt newest-first → `gpt-5.4-mini` (DECISIONS: Models and cost). Cost estimates per model; lab jobs seed-major + interleaved; `go` checks the quick run before the full one; doctor no longer blocks on AG_STUDIO. tsc, eslint, 171 vitest green.
- **Wed 08:52–09:24** (Roshan's run) Full Attack Lab committed, hero run recorded, contract/date/e2e-wallet fixes; repo pushed to GitHub (G1).
- **Wed 09:45** e2e had 2 axe failures, caused by the Apple pass plus the first real lab data. (1) The landing "Method and raw data" link sat inside a grey caption, set apart only by blue (1.2:1 against the grey) → new `.link-inline` (underlined), also used for the footer "Source" link, which appears once REPO_URL is set. (2) The Copy-id chip label (#86868b) on its #242425 fill was 4.28:1 → new token `--al-muted-2` #a1a1a6. A wider axe scan (every page, 1280 + 390 px, all 4 Control Room pages, REPO_URL/DEMO_VIDEO_URL set) found three more problems, all fixed: the /lab family table and the Attack Lab Matrix scroll with no keyboard access → focusable regions (Chain Seal too); Verdict Stream rows' aria-label left out their visible text (WCAG 2.5.3) → name from content, click hint as the description. The e2e lab test now also checks phone width. 6/6 e2e, 174 vitest; scan clean apart from Next's default 404 having no `<main>` (moderate).
- **Wed 10:40** Stress test (Roshan asked). Passed: e2e 84/84 runs, none flaky (8 repeats on 4 parallel workers, each test its own visitor IP; 4× slowed CPU; animations on; 390 px phone). With animations on, axe flags fade-ins mid-entrance, then is clean once they finish. Spending races: 2,000 concurrent purchase checks across 10 allowances and 8 OS processes on one SQLite file each stopped exactly at the budget; 3,000-run ledger property checks. Server (production build, no keys): 4,000 mixed requests at 64 concurrent with 0 errors; 40 judges at once each got their own allowance and event stream; 180–230 open event streams; every live endpoint is 401 without a session; the public Control Room data has no personal fields. Found and fixed: (1) request bodies were read whole before size checks, so one 256 MB POST to the public webhook took the server from 777 to 1,151 MB (the Render free plan has 512 MB) → `lib/security/body.ts` streams with a cap (413); (2) the passcode endpoint returned 500 on a `null` body → objects only; (3) the rate limiter wiped every bucket once it held 10,000 clients, which un-throttled an attacker → it now forgets the fullest buckets first; (4) the public webhook had no rate limit and stored a row for every request → 60/min per IP; (5) simultaneous approval polls (interval + phone + webhook) sent one PayPal capture call each (8 → 8; no double charge thanks to the request id) → one poll at a time (`tests/integration/approval-race.test.ts`). Survives the full load with a 128 MB JS heap (~420 MB resident). Open: confirm after G3 that Render's `X-Forwarded-For` can't be forged (check added to DEPLOY.md §4).
- **Wed 11:40** G3 deployed on Render: https://allowance-8i38.onrender.com (blueprint `allowance`, free, Oregon). Health, landing, replay, /lab, Control Room and the passcode gate checked logged out. `PUBLIC_BASE_URL` set; PayPal sandbox webhook added from the developer dashboard (6 events, id in Render's `PAYPAL_WEBHOOK_ID`). Rate-limit check on the live service failed first (forged first `X-Forwarded-For` = new bucket); fixed in `clientIp` (a2654f6) and re-verified live. Left for Roshan: one live errand with the passcode.
