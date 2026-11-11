# Deploy to Render (gate G3)

One free Node web service from [`render.yaml`](../render.yaml). You do the clicks and type every secret; nothing secret is in the repo.

**Before you start:** the repo is on GitHub (G1), `npm run go` has finished (so `data/vault-token.json` exists), and you have the **allowance-demo** OpenAI key (the separate $15-budget project — not the dev key).

## 1. Create the service
1. render.com → **New +** → **Blueprint** → connect GitHub → pick **roshworldwide/allowance** → **Connect**.
2. Render reads `render.yaml` and proposes the web service **allowance** (Free). Click **Apply**.
3. It asks for the `sync: false` variables. Fill them in (values from your `.env.local` unless noted):

| Variable | Value |
|---|---|
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | your sandbox app "ALLOWANCE" |
| `AG_STUDIO` | AG Studio licence key |
| `AG_STUDIO_OPENAI_API_KEY` | the **allowance-demo** key |
| `OPENAI_MODELS`, `AGENT_MODEL` | same as `.env.local` (written there by `npm run go`) |
| `DEMO_PASSCODE` | your passcode (also goes in Devpost's testing instructions) |
| `DEMO_VAULT_TOKEN_ID`, `DEMO_VAULT_CUSTOMER_ID` | open `data/vault-token.json` locally and copy `paymentTokenId` and `customerId` |
| `PUBLIC_BASE_URL` | leave blank for now (step 2) |
| `PAYPAL_WEBHOOK_ID`, `DEMO_VIDEO_URL`, `REPO_URL` | leave blank for now |

Fixed in the blueprint: `PAYPAL_ENV=sandbox`, `OWNER_MODE=false`, `RECORD_REPLAYS=false`, `DAILY_OPENAI_USD_CAP=2`, `SESSION_SECRET` (generated), Node 24.

## 2. Set the public URL
After the first deploy finishes, copy the service URL (e.g. `https://allowance-xxxx.onrender.com`) → **Environment** → `PUBLIC_BASE_URL` = that URL (no trailing slash) → **Save, rebuild and deploy**.

## 3. Register the PayPal webhook
On your machine, from `allowance/`:
```bash
PUBLIC_BASE_URL=https://allowance-xxxx.onrender.com npm run webhook:register
```
It prints `PAYPAL_WEBHOOK_ID=…` → paste it into Render → **Save, rebuild and deploy**.

## 4. Check it logged out (private window)
- `/api/health` → `"sandbox": true, "db": "ok", "paypal": "ok"`.
- `/` loads; **Replay a real sandbox run** plays; `/lab` shows the numbers; `/control-room` shows live data.
- `/errand` → passcode → **Create allowance** → card is **ACTIVE** (the demo wallet is bound) → run the demo errand once.
- Rate limits must see your real IP, not a made-up header. From your laptop, send 6 wrong passcodes, each with a different fake `X-Forwarded-For`:
  ```bash
  for i in 1 2 3 4 5 6; do curl -s -o /dev/null -w "%{http_code} " -X POST -H 'content-type: application/json' -H "X-Forwarded-For: 10.0.0.$i" --data '{"passcode":"wrong"}' https://allowance-xxxx.onrender.com/api/auth/passcode; done; echo
  ```
  Expect `401 401 401 401 401 429`. Six `401`s mean Render passed the fake header to the app as your IP, so anyone could dodge the limits. Wait a minute before you enter the real passcode.
  *Checked on the live service, Wed 11 Nov:* the first run gave six `401`s (Render appends to `X-Forwarded-For` without clearing it), so `clientIp` now trusts Cloudflare's `True-Client-IP` / `CF-Connecting-IP`, then the **last** `X-Forwarded-For` hop. Re-run: `401 401 401 401 401 429`; forged `True-Client-IP` values stay in the same bucket, and a forged `CF-Connecting-IP` is refused by Cloudflare (403).

## Notes
- Free services sleep after ~15 minutes idle; the first visit takes about a minute (disclosed on the landing page and in Devpost).
- The free disk is wiped on spin-down: on boot the app re-seeds the demo wallet from env vars and rebuilds history from `replays/`.
- Later pushes redeploy automatically (`autoDeploy: true`). **After the deadline (Fri 01:30 IST) push nothing** until winners are announced (21 Dec).
