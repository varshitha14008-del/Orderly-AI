# 3-Minute Demo Video Script: Orderly-AI

**Target Runtime:** 2 minutes 55 seconds  
**Requirements:** Under 3 minutes, public YouTube video, shows project functioning on device built for, no third-party copyrighted audio or trademarks.

---

### [0:00 – 0:20] The Problem & The One-Line Pitch
- **Visual:** Landing Page ([http://localhost:3000](http://localhost:3000)) showing the headline and animated architecture cards.
- **Voiceover:**
  > "Autonomous AI agents are the next frontier of commerce. But before consumers and merchants can trust AI to spend and receive money on their behalf, we need strict deterministic guardrails. Without them, buyers fear runaway spending, and merchants fear bad deals and disputes.
  > Welcome to **Orderly-AI**: a policy-bounded agent marketplace where the LLM proposes, our policy engine disposes, the human approves, and PayPal settles."

---

### [0:20 – 0:45] Setting Policies: Buyer & Merchant Portals
- **Visual:** Switch to Buyer Portal ([http://localhost:3000/buyer](http://localhost:3000/buyer)).
  - Point to the target item: *Ergonomic Mechanical Keyboard* ($75.00 list price).
  - Adjust sliders: Maximum Price Ceiling to $60.00, Auto-Accept Below to $40.00, Ask Human Above to $50.00.
  - Highlight the 'Strictly Prohibit Subscriptions' toggle.
- **Voiceover:**
  > "First, the buyer sets non-negotiable policy guardrails: a strict $60 price ceiling, auto-accept target, and a subscription ban. On the merchant side, the store has set a hard floor price of $45. Our pure TypeScript policy engine guarantees that no agent can violate these rules regardless of model hallucinations."

---

### [0:45 – 1:30] Live Autonomous Agent Negotiation
- **Visual:** Click "Deploy Buyer Agent & Start". Watch turns populate in real time in the transcript arena.
  - Turn 1: Buyer opens at $35.00.
  - Turn 2: Seller counters at $65.00 citing switch quality.
  - Turn 3: Buyer counters at $45.00.
  - Turn 4: Seller counters at $52.00.
  - Turn 5: Buyer stretches to $48.00.
  - Turn 6: Seller accepts $48.00!
- **Voiceover:**
  > "Watch both agents negotiate live. The Buyer Agent proposes an offer via Gemini 3.5 structured JSON. The policy engine intercepts and validates the price in code. The Seller Agent responds with commercial rationale. Over three rounds of orderly concessions, they reach mutual agreement at $48.00—saving the buyer $27 while keeping the merchant safely above their $45 floor."

---

### [1:30 – 2:00] Human-in-the-Loop & Real PayPal Sandbox Settlement
- **Visual:** The settlement card animates open. Show the native **PayPal Sandbox Buttons** rendered by `@paypal/react-paypal-js`.
  - Click the PayPal yellow button.
  - The sandbox popup opens: show the order total of **$48.00 USD**.
  - Click "Complete Purchase".
  - The receipt card appears with **PayPal Order ID** and **Payments v2 Capture ID**!
- **Voiceover:**
  > "Agreement alone does not move funds. Orderly-AI keeps the human in the loop: the buyer authorizes the deal through native PayPal Buttons. When approved, our backend calls PayPal Orders v2 to create and capture the payment in the sandbox. The transaction is instantly settled."

---

### [2:00 – 2:40] Post-Purchase Dispute & AI Mediator Ruling
- **Visual:** Switch to Merchant Hub ([http://localhost:3000/merchant](http://localhost:3000/merchant)).
  - Select the newly captured order.
  - Under Dispute Resolution, select 'Damaged in transit' ("Loose keycaps on casing").
  - Click 'Request AI Mediator Ruling'.
  - Show the Mediator card: **PARTIAL REFUND: $24.00**, citing *Merchant Policy §4.2*.
  - Click '1-Click Approve Ruling & Settle in PayPal'.
  - Show the live refund confirmation ID from PayPal Payments v2!
- **Voiceover:**
  > "What happens if there's a problem post-purchase? The buyer reports the item arrived damaged. Instead of an adversarial chargeback, our third AI agent—the Mediator—reads the full transcript, capture data, and merchant refund policies.
  > The Mediator rules a 50% partial refund of $24.00, citing Merchant Policy clause 4.2. With one click, the merchant approves, and our backend executes a real refund directly through PayPal Payments v2."

---

### [2:40 – 2:55] AG Grid Community Cryptographic Audit Ledger & Closing
- **Visual:** Switch to AG Grid Audit Dashboard ([http://localhost:3000/admin](http://localhost:3000/admin)).
  - Point to the live banner: `SHA-256 Ledger: VERIFIED UNTAMPERED`.
  - Type in the quick search box to filter turns and PayPal calls.
  - Click 'Export CSV'.
- **Voiceover:**
  > "Finally, complete regulatory transparency. In our AG Grid dashboard, every agent proposal, policy check, human approval, PayPal call, and refund is recorded in an append-only, SHA-256 hash-chained ledger.
  > Orderly-AI delivers safe, verified, policy-bounded agentic commerce on PayPal today. Thank you!"
