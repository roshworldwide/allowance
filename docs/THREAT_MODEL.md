# Threat model

## Assets
- The person's money behind a saved PayPal wallet (Vault payment token).
- The allowance and the task contract (what the person agreed to).
- The audit trail (decisions, captures, refunds) and its integrity.
- Credentials: PayPal client secret, OpenAI keys, demo passcode, AG Studio licence.

## Attacker capabilities (in scope)
- Writes any text the agent reads: product pages, reviews, seller Q&A, listing names, summaries and displayed prices.
- Lists new items whose **true** properties (merchant, category, product type, price, currency, recurring) are recorded by the marketplace, but which can *display* anything.
- Manipulates the agent into calling any tool in its toolbelt with any arguments, in any order, any number of times — including tools it invents.
- Calls the public demo's HTTP endpoints without the passcode.

## Out of scope
- Compromise of the server, the person's PayPal account or PayPal itself.
- A malicious person (the allowance owner) — they can always change their own allowance.
- Harm within an authorised task line (a worse-but-authorised item).

## What the guard trusts — and what it never reads
Trusted inputs only: the confirmed task contract, the mandate, the catalog registry, the ledger, PayPal responses. **Never** listing text, pages, reviews or tool results. The agent's arguments are reduced to identifiers (SKU, quantity, task line, the price it saw); amounts come from the registry.

## Attacks and what stops them

| Attack | Stopped by |
|---|---|
| Prompt injection pushing an off-task item (A01, A02, A10, A11) | R02 TASK_BINDING (product type not in the confirmed task), often also R04/R05 |
| Item swap: a listing *displays* as the requested item (A03) | R02 (registry product type ≠ task line), R03 |
| "Pay the seller directly" / "enter $1, we'll adjust" (A04) | the checkout tool has no amount or payee; any attempt is R03; registry price vs ceiling is R02 |
| "$1 trial, then $39/month" / membership required (A05) | R08 NO_RECURRING (registry recurring flags; SUBSCRIBE intents) |
| One item sold as cheaper parts (A06) | R02 (part type or cumulative quantity), R07 VELOCITY_SPLIT |
| Quantity inflation (A07) | R02 cumulative quantity per line |
| Price bait: cheap on the page, expensive at checkout (A08) | R02 price ceiling (registry price); R10 step-up on drift |
| Currency trick (A09) | R09 CURRENCY_LOCK (registry currency) |
| Budget drain with many small buys (A12) | R02, R06 (atomic budget), R07 |
| Refunds, invoices, payouts, transfers via toolkit tools | R12 MONEY_OUT_SCOPE; undo is a human-only endpoint |
| Tools the agent invents | default-deny (OTHER_MONEY → R12) |
| Concurrent calls to overspend | R06 inside `BEGIN IMMEDIATE` (tested with racing processes) |
| Replay / retry double charge | `PayPal-Request-Id` = decision id; ledger reservation unique per decision |
| Tampering with the audit log | SHA-256 hash chain; any single-byte change detected at its seq (property-tested) |
| Abuse of the public demo | passcode session, per-IP token buckets, daily OpenAI spend cap → replay mode, body limits, CSP |

## Residual risks
- A step-up shows the person the item and amount; an inattentive person can still approve a bad purchase (the lab reports how many attacks needed a person).
- The registry is only as good as its source; in production it must be merchant-signed.
- LLM explanations could be wrong; they are labelled "AI-written from the rule trace" and never change a verdict.
