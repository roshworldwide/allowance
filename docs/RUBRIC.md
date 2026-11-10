# Rubric traceability

Submission is gated on this file: every row needs evidence that exists (a file, a test, a number from `lab/results/latest.json`, or a timestamp in the video script). Status: ⬜ not started · 🟨 in progress · ✅ evidenced.

| Criterion | What earns a 5 | Where it lives | Proof in video | Status / evidence |
|---|---|---|---|---|
| **Stage 1 gate** (PayPal + AI) | Obvious in the first 20 s | — | Cold open (0:00–0:18) | ⬜ |
| **Technological Implementation** | Real PayPal Vault + Orders v2 + Refunds + Webhooks + idempotency in sandbox; vault checkout and Agent Toolkit money tools wrapped; deterministic guard with full trace; atomic ledger with property tests; hash-chained audit log; Attack Lab with reproducible results; CI green | `lib/paypal`, `lib/guard`, `lib/lab`, `tests/` | Lane run with real sandbox ids; 3 s cut of the PayPal sandbox account showing capture + refund; code shot of the 3-line wrap | 🟨 Vault/Orders/Refunds/Webhooks + idempotency (`lib/paypal`, `lib/allowance/executor.ts`), guard + 161 tests incl. a 4-process race, chain tamper property tests, Attack Lab runner, CI; live sandbox run (S1) pending keys |
| **Design** | Distinct visual identity; Firewall Lane animation; clear verdict cards; mobile approval page; themed AG Studio with custom widgets; accessible | `app/`, `components/`, `lib/studio/theme.ts` | Hero flow; Control Room | 🟨 Firewall Lane, verdict cards, phone approve page, landing, /lab (screens verified 1280×800 + 390×844; axe: 0 serious); themed Studio |
| **Potential Impact** | Every agentic-commerce product needs this; one `wrap()` around any agent's money tools, including `@paypal/agent-toolkit`'s; built only from PayPal primitives; clear path to production | README "Impact", "Path to production" | 15 s narration + primitives table | 🟨 `wrap()` covers all 47 Agent Toolkit tools (`tests/unit/wrap.test.ts`); README Path to production |
| **Quality of the Idea** | Safety moves from prompts to capabilities: task-binding + trusted registry, so the guard can't be talked out of a decision; undo as a first-class agent primitive | README "Why it can't be talked out of it" | Injection blocked; "the guard never reads attacker text" | 🟨 README section + THREAT_MODEL; R02 injection block verified in tests and replay |
| **Presentation** | Under-3-min video, no dead air, numbers on screen, before/after; README passes the 10-second test; judge guide | `docs/VIDEO_SCRIPT.md`, README, `docs/JUDGE_GUIDE.md` | Whole video | ⬜ |
| **AG Studio prize** | 3+ custom widgets with form config; custom theme; layout; custom agent team mixing built-ins + own tools; "how it's built" shown | `lib/studio/*`, README AG Studio section | Control Room segment + code shot | 🟨 theme, Allowance Ring + form config (verified), agent team with 3 custom tools + 2 tool components, real data; 2 widgets + 4-page report in progress |

## Definition of Done (§18) checklist

- [ ] 1. Live sandbox flow end to end (link → contract → ALLOW → BLOCK → STEP-UP → undo) with ids shown and logged
- [x] 2. Guard: 12 rules, full trace, deterministic; ≥ 90 unit tests; property tests green; p95 < 15 ms measured (0.87 ms, `lab/results/guard-latency.json`)
- [x] 3. Ledger atomic (4-process race test); chain verifies; tamper detected (property test)
- [ ] 4. Attack Lab run recorded (model/date/seed/sha); numbers on `/lab`, README, video match `latest.json`
- [ ] 5. Control Room ≥ Minimum Studio; propose-never-apply holds
- [ ] 6. Firewall Lane 60 fps; Lighthouse/axe bars; 1280×800 and 390×844
- [ ] 7. Deployed URL works logged-out; replay without keys; live behind passcode; rate limits + spend cap
- [ ] 8. CI green; README 10-second test; all docs; tools disclosure
- [ ] 9. Video < 3:00, public, captions; DEVPOST.md complete; repo public with MIT in About
- [ ] 10. No secrets anywhere; sandbox only
