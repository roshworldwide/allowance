# Judge guide — ALLOWANCE in 90 seconds

**Everything here is PayPal sandbox. Merchants are simulated; payments, approvals and refunds are real sandbox API calls.**

1. **Open the demo URL** (in the Devpost testing instructions). The free server may take about a minute to wake up.
2. **Replay a real sandbox run** (no login): watch the Firewall Lane. Two USB-C cables → **ALLOW**, paid from the saved PayPal wallet (capture id on the card). The $48 lamp is above the $40 ask-me line → **STEP-UP**, approved in PayPal. Then **Undo** → a real PayPal refund. In this recorded run the agent ignored the injected-hub bait, so there is no BLOCK here; the BLOCKs are in step 3.
3. **Attack Lab** (`/lab`): the same agent with and without ALLOWANCE — attack success <!--lab:unguardedAsr-->21%<!--/lab--> → <!--lab:guardedAsr-->0%<!--/lab-->, false blocks <!--lab:falseBlock-->0%<!--/lab--> on normal errands. <!--lab:stoppedByBlock-->43<!--/lab--> guarded attack runs were stopped by a BLOCK — for example **R02 TASK_BINDING** when a product page slips in an item you never asked for.
4. **Control Room** (`/control-room`): AG Studio with the custom Allowance Ring, Verdict Stream and Attack Lab Matrix. Enter the passcode on the Errand page first to chat; then try the suggested prompt **"What if I raise the per-purchase cap to $80?"** — the Auditor replays every recorded decision through the real guard and answers with numbers, and can only *propose* the change.

## Run it live (passcode)
`/errand` → passcode → **Create allowance** → **Turn into a task contract** → **Confirm** → **Send the agent**. Step-ups show a QR code for PayPal approval on a phone; "in-app approval (fallback)" is available. Each live session gets its own allowance and ledger.

## Where to look in the code
- The guard: [`lib/guard`](../lib/guard) — rules `rules/R01.ts`…`R12.ts`, `evaluate.ts`, `ledger.ts`, `chain.ts`, `wrap.ts`.
- PayPal: [`lib/paypal`](../lib/paypal) and [`lib/allowance/executor.ts`](../lib/allowance/executor.ts).
- Attack Lab: [`lib/lab`](../lib/lab), results in [`lab/results/latest.json`](../lab/results/latest.json).
- AG Studio: [`lib/studio`](../lib/studio) — widgets, theme, agents, tool components.
- Tests: `npm test` (unit, property, integration with a fake PayPal) and `npm run test:e2e`.
