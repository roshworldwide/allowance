# Submission checklist (Roshan)

Deadline **Fri 13 Nov 01:30 IST** (Thu 12 Nov 12:00 PST). Target: submitted by **Thu 23:30 IST**. Gates are marked **G#**: each one is yours to do or to say "yes" to.

## 1. Keys → everything automatic (≈ 45–90 min, mostly unattended)
- [ ] Paste into `allowance/.env.local`: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `AG_STUDIO`, `AG_STUDIO_OPENAI_API_KEY` (allowance-dev), `DEMO_PASSCODE`.
- [ ] `cd allowance && npm run go` — probes models (S0), links your sandbox wallet (S1: open the printed link, log in with the **US sandbox Personal** account, approve), $1 smoke charge + refund, Attack Lab quick + full (cost-capped at $8), then writes the numbers into the README / Devpost / judge guide / video script.
- [ ] Check `/lab` and the README numbers look right (`npm run docs:check` → ok).

## 2. G1 — private repo
The session's safety classifier blocked me from creating it; run this yourself from `allowance/`:
```bash
gh repo create roshworldwide/allowance --private --source . --remote origin --push \
  --description "A spending firewall for AI agents on PayPal (sandbox): scoped allowances, PayPal step-up approval, one-click undo — proven in an Attack Lab."
```

## 3. Record the hero run (becomes the judge replay)
- [ ] Phone: log into **sandbox.paypal.com** with the sandbox Personal account.
- [ ] `npm run demo:reset`, then `npm run dev` (`.env.local` has `OWNER_MODE=true`, `RECORD_REPLAYS=true`).
- [ ] `/errand` → Create allowance → (Link PayPal if not ACTIVE) → errand "Get me two USB-C cables under $15 each and a desk lamp under $50." → Confirm → Send the agent → scan the lamp's QR → approve in PayPal → Undo on the cables.
- [ ] `npm run record-replay` shows ✓ for the new file in `replays/` → commit + push it.

## 4. G3 — deploy
- [ ] Follow [`DEPLOY.md`](DEPLOY.md) (Render blueprint, env vars, public URL, `npm run webhook:register`, logged-out checks).

## 5. Media
- [ ] Screenshots at 1280×800 into `docs/media/`: errand lane mid-run, BLOCK card (R02), step-up QR, Attack Lab, Control Room overview, Control Room Auditor proposal card; plus one phone screenshot of `/approve/…`. (I can capture these from the replay and deployed app once it is up.)
- [ ] Hero GIF of the Firewall Lane (≈ 8 s, < 4 MB) → `docs/media/lane.gif`.

## 6. G4 — video
- [ ] Record per [`VIDEO_SCRIPT.md`](VIDEO_SCRIPT.md) (≤ 2:58, captions, no music, no logos).
- [ ] Upload to YouTube as **Unlisted**, check it is under 3:00 and plays logged-out, then set it **Public**.
- [ ] Render → `DEMO_VIDEO_URL` = the YouTube URL → redeploy (the landing page shows "Watch the 3-minute demo").

## 7. Final checks
- [ ] Self-judge pass (I run it: fresh reviewers score README + judge guide + video script against the rubric).
- [ ] Secrets: `npm run secrets:history` and `npm run build && npm run secrets:build` clean; no keys/passcode visible in screenshots or video frames.
- [ ] `npm test`, `npm run test:e2e`, CI green on GitHub.

## 8. G2 — public repo
- [ ] `gh repo edit roshworldwide/allowance --visibility public --accept-visibility-change-consequences`
- [ ] GitHub repo page → About (gear): website = demo URL; topics `paypal`, `ai-agents`, `ag-grid`, `openai`; check the **MIT License** badge shows.
- [ ] Render → `REPO_URL` = the repo URL → redeploy.

## 9. G5 — Devpost
- [ ] Paste the blocks from [`DEVPOST.md`](DEVPOST.md); type the passcode into the testing instructions yourself.
- [ ] Select sponsor tool: **AG Grid / AG Studio**. Add the video URL, demo URL, repo URL.
- [ ] Submit by **Thu 23:30 IST**; open the public project page logged-out to confirm.
- [ ] **After 01:30 IST Fri: change nothing** (repo, video, demo) until winners are announced on 21 Dec. Keep the Render service, OpenAI demo budget and AG Studio trial (expires ~25 Dec) alive until then.
