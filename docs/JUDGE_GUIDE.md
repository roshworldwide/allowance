# Judge guide — ALLOWANCE in 90 seconds

**Everything here is PayPal sandbox. Merchants are simulated; payments, approvals and refunds are real sandbox API calls.**

1. **Open the demo URL** (in the Devpost testing instructions). The free server may take about a minute to wake up.
2. **Replay a real sandbox run** (no login): watch the Firewall Lane. Two USB-C cables → **ALLOW**, paid from the saved PayPal wallet (capture id on the card). A product page slips in a $34 USB-C hub → **BLOCK, R02 TASK_BINDING** — the only red lamp. The $48 lamp → **STEP-UP**, approved in PayPal on a phone. Then **Undo** → a real PayPal refund.
3. **Attack Lab** (`/lab`): the same agent with and without ALLOWANCE — attack success <!--lab:unguardedAsr-->pending (no Attack Lab run yet)<!--/lab--> → <!--lab:guardedAsr-->pending (no Attack Lab run yet)<!--/lab-->, false blocks <!--lab:falseBlock-->pending (no Attack Lab run yet)<!--/lab--> on normal errands.
4. **Control Room** (`/control-room`): AG Studio with the custom Allowance Ring, Verdict Stream and Attack Lab Matrix. Enter the passcode on the Errand page first to chat; then try the suggested prompt **"What if I raise the per-purchase cap to $80?"** — the Auditor replays every recorded decision through the real guard and answers with numbers, and can only *propose* the change.

## Run it live (passcode)
`/errand` → passcode → **Create allowance** → **Turn into a task contract** → **Confirm** → **Send the agent**. Step-ups show a QR code for PayPal approval on a phone; "in-app approval (fallback)" is available. Each live session gets its own allowance and ledger.

## Where to look in the code
- The guard: [`lib/guard`](../lib/guard) — rules `rules/R01.ts`…`R12.ts`, `evaluate.ts`, `ledger.ts`, `chain.ts`, `wrap.ts`.
- PayPal: [`lib/paypal`](../lib/paypal) and [`lib/allowance/executor.ts`](../lib/allowance/executor.ts).
- Attack Lab: [`lib/lab`](../lib/lab), results in [`lab/results/latest.json`](../lab/results/latest.json).
- AG Studio: [`lib/studio`](../lib/studio) — widgets, theme, agents, tool components.
- Tests: `npm test` (unit, property, integration with a fake PayPal) and `npm run test:e2e`.
