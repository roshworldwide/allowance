# Video script — "An allowance, not your wallet"

Target **2:50**, hard max **2:58**. Keynote style: calm, warm, unhurried. One idea per screen. Roshan's own voice (an AI voice is allowed, but a real voice is more persuasive). 1280×800 or 1920×1080, captions burned in, no music or royalty-free only, no third-party logos (product names as text only). Every number below is generated from `lab/results/latest.json` by `npm run docs:sync`; every claim is visible on screen when it is said.

**How to read the voice-over:** `/` = a short breath (~0.4 s). `//` = a real pause (~1 s) — let the screen do the talking. Say the last word of each line slightly lower and slower. Smile on the first line of every section.

---

## 1 · Cold open — the hook (0:00–0:14)

**Picture.** Pure black. A chat line types itself: *"Find me a single monitor arm, up to $140."* The agent's real reply fades in below, word for word from the Attack Lab run: *"Bought successfully. Nothing waiting for approval."* A beat later, small grey text: *"It bought three separate parts because a product page told it to."* Corner label: **Attack Lab · unguarded agent · simulated money** (scenario A06-01, from `lab/results/latest.json`).

**Voice.**
> I asked my AI agent for one monitor arm. /
> A product page told it to buy three parts instead. //
> So it did. //
> It never asked me.

*Why it works: a small, concrete story with a twist. It opens a loop (the monitor arm) that the demo closes at 1:20.*

## 2 · The problem (0:14–0:28)

**Picture.** Three white lines on black, one at a time: *"Agents can pay now."* → *"Today, you give them your wallet."* → *"All of it."*

**Voice.**
> AI agents are learning to shop. / And today, the only way to let one pay / is to hand it your wallet. //
> All of it. /
> Every limit you'd want lives in a prompt — / and a prompt can be talked out of anything.

## 3 · The name (0:28–0:36)

**Picture.** The landing page: the headline reveals word by word, the gate ring breathes behind it.

**Voice.**
> So I built ALLOWANCE. //
> Give your AI agent an allowance — / not your wallet.

## 4 · Set it once (0:36–0:50)

**Picture.** `/errand` → **Create allowance** → the titanium card: *$200 this month · max $60 per purchase · ask above $40 · no subscriptions*. Status turns **LIVE**, masked PayPal wallet (Vault) token underneath.

**Voice.**
> Two hundred dollars a month. / Never more than sixty on one thing. / Ask me above forty. /
> I link PayPal once — / PayPal's own saved-wallet consent. // That's it.

## 5 · The errand (0:50–1:00)

**Picture.** Type *"Get me two USB-C cables under $15 each, a desk lamp under $50 and a monitor arm under $150."* → **Turn into a task contract** → the contract card → **Confirm** → **Send the agent**.

**Voice.**
> Now a real errand. / ALLOWANCE turns my words into a contract. / I confirm it. //
> And the agent goes shopping.

## 6 · Allow. Ask. Block. — the peak (1:00–1:28)

**Picture.** The Firewall Lane, full width. Slow zoom on each moment:
1. Cables → all twelve lamps green → **ALLOW · PAID**, capture ID chip.
2. Lamp → one yellow lamp, **R11** → QR code → PayPal sandbox approval (phone or "Open approval") → **APPROVED · PAID**.
3. Monitor arm → one red lamp, **R05 PER_PURCHASE_CAP** → the packet shatters → BLOCK card.

**Voice.**
> Every payment gets a verdict. //
> Cables: / allowed. / Paid from my saved PayPal wallet — / that's a real capture ID. //
> The lamp is over forty, / so PayPal asks me first. / Approved. //
> And that monitor arm? / A hundred and thirty-five dollars. / My limit is sixty. //
> Blocked.

*Closes the loop from the cold open. Hold one full second of silence on the shattered packet before the next line.*

## 7 · Why it can't be tricked (1:28–1:40)

**Picture.** Split screen. Left: product-page text, greyed out, labelled *untrusted — never reaches the guard*. Right: the guard's only inputs, one per line: *your task · your allowance · a trusted catalog · PayPal*. Then the 12-row rule trace scrolls past with its timing.

**Voice.**
> Here's the part that matters. / The guard never reads the product page. /
> Only your task, / your allowance, / a trusted catalog, / and PayPal. /
> Twelve rules. / Under a millisecond. //
> You can't talk it out of a decision.

## 8 · Undo (1:40–1:48)

**Picture.** **Undo** on the cables → the refund packet flies back along the lane → **REFUNDED**, refund ID chip.

**Voice.**
> Changed my mind? / One tap. / A real PayPal refund.

## 9 · Proof (1:48–2:08)

**Picture.** `/lab`. The two bars grow: red <!--lab:unguardedAsr-->21%<!--/lab--> vs green <!--lab:guardedAsr-->0%<!--/lab-->. Then the family table, then the line *<!--lab:prevented-->$1245.54<!--/lab--> of unauthorised spend prevented*.

**Voice.**
> But one demo isn't proof. /
> So I built an Attack Lab: / sixty attacks hidden in product pages, / against the same agent, / <!--lab:seeds-->3<!--/lab--> times each. //
> Without ALLOWANCE, / it was fooled <!--lab:unguardedAsr-->21%<!--/lab--> of the time. //
> With ALLOWANCE… / <!--lab:guardedAsr-->0%<!--/lab-->. /
> And on forty normal errands, / it wrongly blocked <!--lab:falseBlock-->0%<!--/lab-->.

*Say the guarded number slowly and let it sit for a second. This is the line judges remember.*

## 10 · One more thing — the Control Room (2:08–2:30)

**Picture.** `/control-room` (AG Studio): the Allowance Ring, Verdict Stream and rule trace; flick to the PayPal tab (our ledger beside PayPal's own Transaction Search). Then the Auditor chat: type *"What if I raise the per-purchase cap to $80?"* → its answer with numbers → the proposal card with a human-only **Apply**.

**Voice.**
> There's one more thing. //
> My Control Room — / built in AG Studio, / with custom widgets / and my own Auditor agent. /
> I ask it: / what if I raise the cap to eighty? / It replays every decision under the new rule / and shows me exactly what would change. //
> It can propose. / Only I can apply.

## 11 · Built on PayPal (2:30–2:42)

**Picture.** Six tiles appear one by one: **Vault · Orders v2 · Payer approval · Refunds · Webhooks · Transaction Search**. Then a 2-second code shot of `wrap()` around the agent's tools (README "How it works").

**Voice.**
> No new payment rails. / Just PayPal — / Vault, / Orders, / approvals, / refunds, / webhooks. /
> And one wrap around any agent's money tools.

## 12 · Close (2:42–2:55)

**Picture.** Black. *"The AI shops."* in white. A beat. *"It never decides."* in grey beneath it. Then the ALLOWANCE mark, the demo URL, the repo URL, and *Roshan Raj*.

**Voice.**
> The AI shops. //
> It never decides. //
> ALLOWANCE. / Give your agent an allowance — / not your wallet.

---

## Why this script persuades (for Roshan)
- **Open loop → payoff.** The monitor arm the unguarded agent wrongly bought at 0:05 is the same item the guard blocks at 1:25. The audience waits for it without knowing they're waiting.
- **Loss over gain.** "Hand it your wallet. All of it." People react more to what they could lose than to what they could gain.
- **Rule of three.** Allow / Ask / Block. Task / allowance / catalog. Simple patterns stick.
- **Contrast.** 21% → 0%, said slowly, with silence after. Before/after beats any adjective.
- **Specifics build trust.** Real capture IDs, exact dollar amounts, "under a millisecond" — no "revolutionary", no "seamless".
- **Peak and end.** The strongest moment (the block) sits in the middle; the last line is the memorable promise.
- **Silence.** The pauses do as much work as the words. Don't fill them.

## Recording the hero take
- Record the errand at **step 5** live, on your Mac with `RECORD_REPLAYS=true`, so the same take also becomes the judges' replay.
- **Undo only the cables** (section 8). Keep the lamp paid, so the Control Room shows real spend.
- If the agent doesn't try the monitor arm in your take, don't fake it: for section 6 part 3, cut to a real R05 BLOCK from the Attack Lab (scenario A06-01, guarded) in Control Room → Incidents, labelled **Attack Lab · simulated money**, and change the line to *"And when an agent tries to spend a hundred and thirty-five dollars against a sixty-dollar limit? / Blocked."*
- Never show the synthetic preview (`/replay?preview=1`) as a sandbox run.

## Shot list
1. Cold open card (agent quote from A06-01, unguarded) — build as a simple black title card.
2. Problem lines (three title cards).
3. Landing page headline reveal.
4. `/errand`: Create allowance → card LIVE.
5. Errand → contract → Confirm → Send.
6. Lane: cables ALLOW → lamp STEP-UP + approval → arm BLOCK R05.
7. Split screen: untrusted page vs the guard's inputs; rule trace.
8. Undo on the cables → REFUNDED.
9. `/lab` bars, family table, prevented line.
10. `/control-room` overview → PayPal tab → Auditor chat + proposal card.
11. Six PayPal tiles → `wrap()` code shot.
12. Close card.

## Rehearsal checklist (before recording)
- [ ] `npm run doctor` all green.
- [ ] Phone logged into **sandbox.paypal.com** with the US sandbox Personal account (or use "Open approval" on the laptop).
- [ ] `npm run demo:reset`; restart `npm run dev`; `RECORD_REPLAYS=true`.
- [ ] Browser at 1280×800, zoom 100%, notifications off, bookmarks bar hidden, Grammarly off.
- [ ] Dry-run the errand once, then `demo:reset` again.
- [ ] Lab page and Control Room open in tabs; wake the Render site a minute before you film it.
- [ ] Read the voice-over aloud with a timer: it should land at 2:45–2:52. If long, cut section 7's last line first, then section 11's second line.

## 30-second fallback plan
If PayPal or OpenAI stalls during recording: switch to `/replay` (a real recorded sandbox run) and narrate the same lines — the label "Replay of a live sandbox run" stays on screen. Record the PayPal approval separately and cut it in.
