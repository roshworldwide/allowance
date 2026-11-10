# Architecture

One Next.js 16 service (Node runtime) on Render, SQLite on local disk, PayPal **sandbox** REST APIs and the OpenAI API. The guard is a framework-free TypeScript library at the centre.

```
Browser                    Next.js app (one Node service)                               External
───────                    ─────────────────────────────────────────────────────────    ─────────────
/            landing ───┐  app/api/allowance/*    mandates, Vault link/return, revoke,    PayPal sandbox
/errand      console ───┤                         human-only policy apply                 (Vault v3, Orders v2,
/approve/:id phone   ───┤  app/api/contract/*     parse (OpenAI structured output),        Refunds, Webhooks,
/replay      judge   ───┤                         confirm (locks the task contract)        Transaction Search)
/lab         results ───┤  app/api/agent/run      guarded errand, SSE stream                    ▲
/control-room Studio ───┘  app/api/undo/:id       refund within the undo window                 │ OAuth client-
                           app/api/approvals/:id  step-up status, decline, fallback             │ credentials,
                           app/api/events         SSE: decisions, captures, refunds…            │ PayPal-Request-Id
                           app/api/studio/*       Control Room tables, policy simulation        │
                           app/api/ai/responses   Studio's OpenAI proxy (passcode, rate-limit,  │
                                                  daily spend cap, model allowlist)             │
                           app/api/webhooks/paypal signature-verified events ───────────────────┘
                           ─────────────────────────────────────────────────────────
                           lib/guard     rules R01–R12, evaluate, ledger, chain, wrap, simulate (pure TS)
                           lib/agent     Responses API loop, toolbelts, errand runner
                           lib/allowance service: mandates, PayPal executor, approvals poller, runs, replays
                           lib/paypal    client (sandbox-only), vault, orders, refunds, webhooks, redaction
                           lib/catalog   trusted registry + untrusted listings/pages/reviews (overlays)
                           lib/lab       scenario schema, code-judged success criterion, runner, metrics
                           lib/store     SQLite (WAL, integer cents), repositories, replay seeding
                           lib/studio    AG Studio theme, data, widgets, agents, tools, tool components
```

## A purchase, end to end

1. The agent calls `allowance_checkout({ sku, qty, contractLineId, quotedUnitCents })`.
2. `wrap()` classifies the tool (READ / MONEY / default-deny) and normalises the call into an **Intent** (identifiers only; any amount/payee/currency the agent tried to set is recorded as an override).
3. `guard.evaluate()` reads the ledger facts and runs all 12 rules **inside one `BEGIN IMMEDIATE` transaction**; unless the verdict is BLOCK, it reserves the registry amount in the same transaction. Concurrent calls (even from other processes) cannot overspend — tested with 4 OS processes racing on one database.
4. The decision and its 12 rule results are persisted and appended to the hash chain **before any money moves**.
5. ALLOW → the executor builds the purchase unit **from the registry** and creates an Orders v2 order with `payment_source.paypal.vault_id`, `PayPal-Request-Id = decision id`. On capture COMPLETED the ledger commits; on failure it releases.
6. STEP_UP → a normal checkout order; the phone page links to PayPal's approval; a poller (and the `CHECKOUT.ORDER.APPROVED` webhook) captures as soon as PayPal reports APPROVED — the capture never depends on the redirect landing.
7. Undo → `POST /v2/payments/captures/{id}/refund` with `PayPal-Request-Id = undo-<decision id>`; on COMPLETED the ledger frees the budget.
8. Webhooks (verified with `verify-webhook-signature`) mark captures "PayPal confirmed ✓".

## Trust boundaries

| Data | Who can write it | Read by |
|---|---|---|
| Task contract | the person (confirmed; immutable after) | guard |
| Allowance (mandate) | the person | guard |
| Catalog registry (SKU → merchant, category, product type, price, currency, recurring) | merchants via a trusted channel (simulated) | guard, executor |
| Listings, product pages, reviews, seller notes | **anyone, including attackers** | agent only (marked untrusted) |
| Ledger, decisions, chain | the guard and executor | guard, Control Room |
| PayPal responses and verified webhooks | PayPal | executor, reconcile |

## Data

SQLite (better-sqlite3, WAL). Money is integer cents everywhere; PayPal's decimal strings are converted in exactly one module (`lib/paypal/money.ts`). On Render's free plan the disk is ephemeral: the app re-seeds the demo wallet from env vars and rebuilds its history from recorded sandbox runs in `replays/` at boot.
