# Devpost submission — ready-to-paste blocks

> Numbers are filled from `lab/results/latest.json` by `npm run docs:sync`. `npm run docs:check` must pass before submitting.

## Project name
ALLOWANCE

## Tagline (≤ 200 characters)
Give your AI agent an allowance, not your wallet. A spending firewall for agents on PayPal: scoped mandates, PayPal step-up, one-click undo — proven in an Attack Lab.

## Inspiration
Agents can now spend money. Today, giving one PayPal access means giving it your wallet — a free-form "pay" tool, a saved payment method, and a prompt asking it to behave. We wanted the opposite: an allowance an agent can't break, built only from PayPal's own primitives.

## What it does
You give your agent an allowance — "$200 this month · max $60 per purchase · office supplies and electronics · no subscriptions · ask me above $40" — and link PayPal once through a Vault saved-wallet consent. Your errand becomes a task contract you confirm. Every money-moving tool call the agent makes then passes 12 deterministic rules and comes back ALLOW (paid from your saved PayPal wallet), STEP-UP (PayPal asks you on your phone) or BLOCK (with the exact rule). Anything paid can be undone for 10 minutes with a real PayPal refund. An Attack Lab proves it: the same OpenAI agent with and without ALLOWANCE — attack success <!--lab:unguardedAsr-->21%<!--/lab--> → <!--lab:guardedAsr-->0%<!--/lab-->, false blocks <!--lab:falseBlock-->0%<!--/lab--> on normal errands. An AG Studio Control Room with custom widgets and an Auditor agent explains every verdict and simulates policy changes against recorded agent behaviour — and can only propose, never apply.

## How we built it
- **PayPal (sandbox):** Vault v3 payment tokens (setup token → approval → payment token, `usage_type: MERCHANT`), Orders v2 with `payment_source.paypal.vault_id` for agent purchases, normal Orders v2 checkouts for step-ups (captured by a poller + `CHECKOUT.ORDER.APPROVED` webhook), Refunds for undo, `PayPal-Request-Id` idempotency on every POST, signature-verified Webhooks, and the **PayPal Agent Toolkit** whose money-moving tools sit behind the same guard.
- **The guard:** framework-free TypeScript — 12 pure rule functions, an atomic SQLite ledger (`BEGIN IMMEDIATE`, tested with racing processes), a SHA-256 hash-chained audit log, and `wrap()` that classifies every tool (read-only / money / default-deny). p95 under 1 ms.
- **OpenAI:** a hand-written Responses API agent loop with function calling; structured outputs for task parsing; one-sentence verdict explanations; the Control Room's agents.
- **AG Studio:** custom theme, four custom widgets with Form Configuration (Allowance Ring, Verdict Stream, Attack Lab Matrix, Chain Seal — which re-verifies the audit log's SHA-256 chain in the browser), a four-page report with drill-through and live data, and a custom agent team (our own lead + an Auditor with `explain_verdict`, `simulate_policy`, `draft_policy_change` and two Tool Components).
- **Next.js 16** on Render, SQLite, Motion for the Firewall Lane, Vitest + fast-check + Playwright + axe.

## Challenges we ran into
- Making task-binding precise: binding by category alone would let a cheap off-task item through, so contract lines carry a product type from the catalog's vocabulary.
- Keeping the comparison fair: both agent configurations share the prompt, model and read tools; only the money tools differ, and success is judged by code.
- Capturing step-ups reliably even when the phone's redirect never lands (poller + webhook).

## Accomplishments that we're proud of
- The guard never reads attacker-writable text, and the agent can't name a price or a payee.
- <!--lab:prevented-->$1245.54<!--/lab--> of unauthorised spend prevented in the Attack Lab; every number reproducible from `lab/results/latest.json`.
- A Control Room agent that can replay recorded decisions against a new policy — and is designed to never apply changes itself.

## What we learned
Safety for agentic payments belongs in capabilities, not prompts: give agents identifiers, not amounts; bind them to what the person confirmed; and make undo a first-class primitive.

## What's next
Vault reference-transaction approval for live, merchant-signed catalogs, per-agent identity and allowances, risk signals, and packaging the guard as a library and an MCP server so any agent host can use it.

## Built with
paypal, paypal-agent-toolkit, paypal-vault, paypal-orders-api, openai, ag-grid, ag-studio, nextjs, react, typescript, sqlite, tailwindcss, render

## Try it out
- Demo: <URL> (replay needs no login; live needs the passcode below)
- Code: <repo URL>
- Video: <YouTube URL>

## Testing instructions (paste into Devpost)
- URL: <URL>. The free server may take ~1 minute to wake up on first visit.
- No login needed for **Replay a real sandbox run** and **Attack Lab**.
- **Run it live**: passcode `<<PASSCODE — Roshan types it here>>`. Live runs make real **PayPal sandbox** payments from a saved sandbox wallet; nothing is real money. Each session gets its own allowance.
- Control Room chat requires the passcode (enter it on the Errand page first).
- Everything is PayPal **sandbox only**; merchants are simulated.

## Tools used (disclosure)
Claude Code (coding assistant) and Claude (UI design and video editing help); OpenAI models for the agent, task parsing, explanations and the Control Room agents; ElevenLabs voice cloning for the demo video's voice-over (an AI clone of my own voice, reading our script; footage is the live app); PayPal REST APIs and @paypal/agent-toolkit (sandbox); AG Studio (trial licence); Next.js and the libraries listed in the README.

## Sponsor tools
AG Grid — AG Studio (Best Use of AG Studio).
