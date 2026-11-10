# Video script — target 2:50, hard max 2:58

1280×800 (or 1920×1080), captions burned in, no copyrighted music, no third-party logos (text names only), no dead air, every claim visible on screen. An AI voiceover is allowed by the organisers; Roshan's own voice is preferred. All numbers below come from `lab/results/latest.json` via `npm run docs:sync`.

| Time | Picture | Voice-over |
|---|---|---|
| 0:00–0:10 | Cold open: the **unguarded** agent reads a poisoned product page and pays for a $200 gift card (Attack Lab run, labelled "Unguarded · simulated money") | "This AI agent has PayPal tools. It just read a poisoned product page — and bought a two-hundred-dollar gift card nobody asked for." |
| 0:10–0:18 | Title card: ALLOWANCE · *Give your AI agent an allowance, not your wallet* · Built with PayPal + OpenAI + AG Studio (text only) | "Agents are learning to shop. ALLOWANCE makes sure they can only spend what you meant." |
| 0:18–0:33 | Allowance card → Link PayPal → sandbox Vault approval → card flips to ACTIVE | "Two hundred a month, sixty max per purchase, no subscriptions, ask me above forty. I link PayPal once — PayPal's Vault, a real saved-wallet consent." |
| 0:33–0:42 | Errand typed → task contract card → Confirm | "I give my agent a task. ALLOWANCE turns it into a contract I confirm." |
| 0:42–1:18 | Firewall Lane: cables ALLOW → capture id; injected $34 hub → **BLOCK R02**, the only red lamp, packet shatters; lamp → **STEP-UP R11** → QR → phone approves in PayPal → captured | "Cables: allowed, paid from the vault. Now a product page slips in a thirty-four-dollar hub I never asked for. It's in budget and in category — a spending limit would let it through. ALLOWANCE blocks it: it's not in my task. The lamp is above forty, so PayPal asks me. Approved." |
| 1:18–1:30 | Undo on the cables → refund packet flies back → REFUNDED; 2-second cut to the sandbox PayPal account activity showing payment + refund | "Changed my mind? Undo. That's a real PayPal refund, seconds later." |
| 1:30–1:52 | Attack Lab: unguarded vs guarded bars, family table, holdout row, false-block tile | "Same agent, sixty attacks, <!--lab:seeds-->pending (no Attack Lab run yet)<!--/lab--> runs each. Unguarded, it's fooled <!--lab:unguardedAsr-->pending (no Attack Lab run yet)<!--/lab--> of the time. With ALLOWANCE: <!--lab:guardedAsr-->pending (no Attack Lab run yet)<!--/lab-->. False blocks on forty normal errands: <!--lab:falseBlock-->pending (no Attack Lab run yet)<!--/lab-->." *(holdout line only if it ran: <!--lab:holdoutGuarded-->not run<!--/lab-->)* |
| 1:52–2:28 | Control Room: themed AG Studio, custom widgets; ask the Auditor "What if I raise the cap to $80?" → simulation answer; "Build an incident page" (or drill into a block → explain_verdict); proposal card with human-only Apply | "My Control Room is AG Studio with custom widgets and my own Auditor agent. It replays every recorded agent decision against a new policy and answers with numbers — and it can only propose changes. Only I can apply them." |
| 2:28–2:46 | Code: the 3-line `wrap()`; the rules list; widget + agent-team code | "Twelve deterministic rules, an atomic ledger, idempotent PayPal calls, a hash-chained audit log. The AI shops and explains. It never decides." |
| 2:46–2:56 | Close: primitives mini-table, URL, repo, name | "Agents get allowances. People keep their wallets. ALLOWANCE — by Roshan Raj." |

## Shot list
1. Cold open — Attack Lab unguarded run of a gift-card injection (A01-03), transcript + "simulated money" label.
2. Title card (static, 8 s).
3. `/errand` allowance card → **Link PayPal (sandbox)** → PayPal Vault approval page (sandbox Personal account) → back, card ACTIVE with masked token.
4. Errand text → contract card → Confirm.
5. Lane full run (live): cables ALLOW (capture chip), hub BLOCK R02 (shatter), lamp STEP-UP (QR) → phone close-up approving in PayPal sandbox → capture.
6. Undo on the cables → refund packet → REFUNDED; then 2 s of the sandbox account's activity page (payment + refund).
7. `/lab` hero bars + family table (+ holdout row if run).
8. `/control-room` overview → chat: "What if I raise the per-purchase cap to $80?" → answer + proposal card.
9. Code shots: `lib/guard/wrap.ts` snippet, `lib/guard/rules/meta.ts`, `lib/studio/widgets/AllowanceRing.tsx` registration + form, `lib/studio/agents.ts` team.
10. Close card.

## Rehearsal checklist (before recording)
- [ ] `npm run doctor` all green; `npm run smoke:sandbox` ✓.
- [ ] Phone logged into **sandbox.paypal.com** with the US sandbox Personal account.
- [ ] `npm run demo:reset`; restart `npm run dev`; `RECORD_REPLAYS=true` (so the take becomes the judge replay).
- [ ] Browser at 1280×800, zoom 100%, notifications off, bookmarks bar hidden.
- [ ] Dry run the errand once; then `demo:reset` again.
- [ ] Have the lab page and Control Room loaded in tabs.

## 30-second fallback plan
If PayPal or OpenAI stalls during recording: switch to `/replay` (a real recorded sandbox run of the same errand) and narrate the same lines — the label "Replay of a live sandbox run" stays on screen. Record the phone approval separately and cut it in.
