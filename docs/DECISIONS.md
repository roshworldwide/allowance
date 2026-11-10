# Decisions

Every non-obvious choice, with a one-line why. Newest at the bottom of each section. Times are IST.

## Devpost facts (verified 2026-11-10 16:20 IST against the overview, rules, FAQ and updates pages)

| Fact | Prompt §1 | Devpost says | Action |
|---|---|---|---|
| Deadline | Thu 12 Nov 12:00 PST = Fri 13 Nov 01:30 IST | Same | Our target stays Thu 23:30 IST |
| Submission | hosted URL and/or run instructions; public repo, licence in About; YouTube < 3 min; tools disclosure; sponsor selection | Same. The video must also "show the project functioning on the device it was built for" | — |
| Judging | Stage 1 pass/fail; Stage 2 five equal criteria 1–5; ties by criterion order | Same; order is Technological Implementation, Design, Potential Impact, Innovation/Idea, Presentation. Judging "may utilize … automated AI-driven analysis" | Keep README and docs machine-readable and evidence-linked |
| Judges may not run it | — | "Judges are not required to test the Project and may choose to judge based solely on the text description, images, and video" | Video + README carry everything |
| Prize stacking | 1 Grand or 1 HM, + 1 Sponsor | Same. HM prizes: Most Creative, Most Impactful, Best Demo Delivery, Best Use of PayPal + AI, Best Use of Agentic Commerce ($5K each) | — |
| AG Grid prize | 1st $5K / 2nd $2K / 3rd–5th $1K | Same (3 × $1K). Criteria quoted in prompt §1 are verbatim | — |
| **Keep alive** | — | "Keep your demo, test credentials, and any trials or credits active until winners are announced on Dec 21." Judging Dec 1–15 | Render service, OpenAI demo budget and AG Studio trial must last to Dec 21 |
| **Lock after deadline** | — | "After the deadline, submissions are locked. Don't edit your repo, video, or linked materials until after the winner announcement." | No commits/redeploys after 01:30 IST Fri; hosted demo must be self-healing (re-seed on boot) |
| Trademarks in video | "Built with PayPal", no endorsement | Video "must not include third party trademarks … unless the Entrant has permission" | Text names only in the video; no PayPal/OpenAI/AG Grid logos |
| Existing projects | Only work created in the period | Rules allow significantly updated existing projects | We keep the stricter rule: everything new, plus the official boilerplate as reference |
| Tips | — | "Open with the problem and who it's for … An AI voiceover is fine." | Script already opens on the problem |

## Licences
- Boilerplate `paypaldev/hackathon-paypal-ag-grid-boilerplate`: GitHub `license: null` (re-checked 2026-11-10). Used as reference; derived files listed in NOTICE; MIT covers only our code.
- AG Studio trial started 10 Nov 2026 → expires about **25 Dec 2026** (45 days). Covers judging and the Dec 21 announcement. The licence key is client-visible by design (it unlocks Studio in the browser): exempt from the build-output secret scan, never in git.

## Stack and versions
- Next.js 16.3.6 + React 19.2.8: same as the boilerplate, so its patterns apply unchanged.
- **AG Studio 3.1.0** (boilerplate pins 3.0.0): prompt allows "latest 3.x"; current docs (and the ag-dev skill) track 3.1.
- **Removed direct `ag-grid-community`/`ag-grid-react`**: AG Studio 3.1.0 bundles AG Grid Enterprise 36.3.0 + AG Charts 14.3.0; the ag-dev skill says not to install grid/charts separately (version skew, bundle bloat). All AG Grid usage goes through Studio.
- TypeScript 5.9 (not 6.0): Next 16.3 documents TS ≥ 5.1; avoids TS 6 default changes (`types`, side-effect imports) on a deadline.
- Node: local 26.13 (current LTS). Render pinned to **Node 24** via `.node-version`; `engines >= 22.12`. better-sqlite3 13 ships prebuilt binaries for linux-x64/arm64 (glibc + musl), so Render needs no native compile.
- npm 11 blocks install scripts by default: `allowScripts` approves `better-sqlite3` and `esbuild` only.
- `motion` (the current name of Framer Motion), `@noble/hashes` for SHA-256 in the guard (isomorphic, sync; the browser verifier uses WebCrypto).
- Fonts via the `geist` package (local files; no Google Fonts fetch at build).

## Configuration and secrets
- Env var is `PAYPAL_CLIENT_SECRET` (prompt §12), not the boilerplate's `PAYPAL_SECRET`.
- OpenAI key is read **only** from `AG_STUDIO_OPENAI_API_KEY` — no fallback to a globally exported `OPENAI_API_KEY` (the boilerplate has one), so spend always lands on the budgeted `allowance-dev` / `allowance-demo` project keys.
- Optional `SESSION_SECRET` (cookie signing); derived from `DEMO_PASSCODE` when empty. On Render it can use `generateValue: true`.
- Sandbox guard runs in three places: server boot (`instrumentation-node.ts`, exits the process), PayPal client construction, and every script. The API base is a constant; `PAYPAL_API_BASE`, if set, must equal it.
- Scripts run with `tsx --conditions=react-server` so modules marked `import 'server-only'` load outside Next; vitest aliases `server-only` to an empty stub.
- Secret scanning: secretlint (patterns, pre-commit) + `scripts/check-known-secrets.mjs` (compares staged diff / full history / `.next` build output against the real values in `.env.local`, prints names only) + gitleaks (history). M0 gitleaks scan: 1 commit, no leaks.
- AG Grid skills: cloned `github.com/ag-grid/skills` (ag-dev 1.2.1) as read-only reference instead of `npx skills add ag-grid/skills` — the session's auto-mode classifier blocked executing the remote installer; same content, and the Studio track reads it directly.

## S2 — PayPal Agent Toolkit 1.11.0 (inspected the installed package, 2026-11-10)
- Entry points: `@paypal/agent-toolkit/{openai,ai-sdk,langchain,mcp,bedrock}`. OpenAI entry: `new PayPalAgentToolkit({ clientId, clientSecret, configuration: { actions, context: { sandbox: true } } })`, `getTools(): ChatCompletionTool[]`, `handleToolCall(toolCall)`. **Tool format is Chat Completions** (`{ type: 'function', function: { name, description, parameters } }`); for the Responses API we flatten to `{ type: 'function', name, description, parameters }`.
- 47 tools; full schemas in `docs/notes/agent-toolkit-1.11.0-tools.json`. Key ones: `create_order(currencyCode, items, …, returnUrl, cancelUrl)` returns an approval link; `pay_order(id)` captures an order the buyer already approved; `create_refund(capture_id, amount?, invoice_id?, note_to_payer?)`; `create_subscription(plan_id, …)`; `create_invoice(…)`, `send_invoice(invoice_id, …)`; `list_transactions`, `get_order`, `get_merchant_insights` are read-only.
- **What it is**: merchant-side tools. It cannot spend a buyer's money by itself (an order needs buyer approval before `pay_order`). Our buyer-side spending path is the Vault checkout.
- **How the guard wraps it** (`allowance.wrap`): every tool name is classified —
  - read-only → passes through (`get_order`, `list_transactions`, `get_refund`, `get_merchant_insights`, `list_*`, `show_*`, `get_*`);
  - money-moving → evaluated as an Intent: `create_order`/`pay_order` → `OTHER_MONEY` (no registry SKU, agent-named amounts → R03/R12), `create_refund`/`accept_dispute_claim`/`record_refund_for_invoice` → `REFUND` (R12: refunds only via the human undo path), `create_invoice`/`send_invoice`/`send_invoice_reminder`/`create_recurring_series`/`activate_recurring_series`/`record_payment_for_invoice` → `INVOICE` (R12; recurring also R08), `create_subscription`/`create_subscription_plan`/`update_subscription`/`update_plan` → `SUBSCRIBE` (R08);
  - anything unrecognised → default-deny as `OTHER_MONEY`.

## Product and guard design
- **Contract lines carry a `productType`** from the trusted registry's controlled vocabulary (e.g. `usb-c-cable`, `usb-c-hub`, `desk-lamp`), in addition to `category`. Why: binding a purchase only by category would let a cheap off-task item in the same category (a $12 hub instead of a $12 cable) pass R02. The parser can only emit product types that exist in the registry, and the human confirms the card.
- R02 resolves the contract line from the agent's `contractLineId` when valid; otherwise it may infer the single line whose `productType` matches the registry item (trusted data only), to avoid false blocks when the agent fumbles the id.
- The unguarded baseline tool gets an optional `payee` field (a typical "pay" tool has one), so payee-swap attacks are expressible against the baseline.
