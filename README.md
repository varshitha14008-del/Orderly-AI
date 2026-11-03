# Orderly-AI
### Two-Sided Policy-Bounded Agent Marketplace on PayPal Sandbox with AI Mediation and AG Grid

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![PayPal](https://img.shields.io/badge/PayPal-Sandbox%20Orders%20%26%20Payments%20v2-0070BA.svg)](https://developer.paypal.com/)
[![Google Gemini](https://img.shields.io/badge/Google%20Gemini-3.5%20Flash%20Structured%20Output-4285F4.svg)](https://ai.google.dev/)
[![AG Grid](https://img.shields.io/badge/AG%20Grid-Community%20v32-21A0A0.svg)](https://www.ag-grid.com/)

> **PayPal AI Hackathon 2026 Submission**  
> *Target Prizes:* 1st/2nd/3rd Overall, Best Use of PayPal + AI, Best Use of Agentic Commerce, Best Use of AG Grid, Best Demo Delivery.

---

## 1. Executive Summary & Problem Solved

Agentic commerce promises autonomous buying and selling, but without deterministic guardrails, individuals fear runaway spending and merchants fear ruinous discounts and post-purchase disputes.

**Orderly-AI** implements a **policy-bounded agent architecture**:
- **The LLM Proposes:** Autonomous buyer and seller agents formulate offers and counter-offers using structured JSON schemas via **Google Gemini 3.5**.
- **The Policy Engine Disposes:** A pure, deterministic TypeScript policy engine validates every proposal in code *before* it reaches the opposing agent or PayPal. It enforces hard price ceilings, merchant floor prices, bundle discount rules, and blocks unauthorized claims.
- **Human in the Loop:** When agents agree, the final purchase requires explicit human approval via native **PayPal JavaScript SDK Buttons**.
- **PayPal Settles:** Real **PayPal Orders v2** (`intent: CAPTURE`) creates and captures the payment in the sandbox.
- **Trust & Dispute Mediation:** If an issue arises post-purchase, an impartial **Mediator Agent** reads the negotiation transcript, purchase units, capture data, and both buyer & seller policies to recommend resolution (`full_refund`, `partial_refund`, or `contest`) citing specific policy clauses. The merchant executes the real refund via **PayPal Payments v2**.
- **Tamper-Evident Auditability:** Every turn, policy verification, human approval, PayPal call, and webhook is logged in an append-only, **SHA-256 hash-chained ledger** displayed live in an interactive **AG Grid Community** dashboard.

---

## 2. Architecture & Data Flow

```
[ Human Buyer ]                     [ Human Merchant ]
       │                                   │
       ▼ (Configures Policy)               ▼ (Configures Floor & Margin)
┌──────────────┐                   ┌──────────────┐
│ Buyer Policy │                   │ Seller Policy│
└──────┬───────┘                   └──────┬───────┘
       │                                   │
       ▼                                   ▼
┌──────────────┐   Structured JSON ┌──────────────┐
│ Buyer Agent  ├──────────────────►│ Seller Agent │
│ (Gemini 3.5) │◄──────────────────┤ (Gemini 3.5) │
└──────┬───────┘                   └──────┬───────┘
       │                                   │
       └───────────────┬───────────────────┘
                       │ Every Turn Intercepted
                       ▼
       ┌───────────────────────────────┐
       │   Deterministic Policy Engine  │ (Pure TypeScript)
       │  - Max Ceiling Enforcement    │
       │  - Floor Price Guardrail      │
       │  - Bundle Math & Claim Bans   │
       └───────────────┬───────────────┘
                       │ Passes Invariants
                       ▼
           [ Mutual Agreement Reached ]
                       │
                       ▼
       ┌───────────────────────────────┐
       │   PayPal Native JS Buttons    │ (Human-in-the-Loop)
       │       @paypal/react-paypal-js │
       └───────────────┬───────────────┘
                       │ Approved by Buyer
                       ▼
       ┌───────────────────────────────┐
       │     PayPal Orders v2 API      │
       │  - POST /v2/checkout/orders   │ (intent: CAPTURE)
       │  - POST .../orders/{id}/capture│
       └───────────────┬───────────────┘
                       │ Settled
                       ▼
       ┌───────────────────────────────┐
       │   Dispute Mediation Layer     │
       │  - AI Mediator Agent (Gemini) │
       │  - Cites exact policy clauses │
       │  - PayPal Payments v2 Refund  │
       └───────────────┬───────────────┘
                       │ Logged
                       ▼
       ┌───────────────────────────────┐
       │   AG Grid Audit Dashboard     │
       │  - SHA-256 Hash Chained Logs  │
       │  - Cryptographic Verification │
       └───────────────────────────────┘
```

---

## 3. Technology Stack

| Domain | Technology | Purpose |
|---|---|---|
| **Framework** | Next.js 14 (App Router), TypeScript, TailwindCSS | High-performance, full-stack reactive marketplace |
| **Payments** | PayPal Orders v2, Payments v2, Webhooks v1 | Real sandbox settlement, capture, and refunds |
| **Agent Commerce** | `@paypal/agent-toolkit/ai-sdk` | Official PayPal AI Agent Toolkit exposing 47 tools |
| **AI LLM** | Google Gemini 3.5 (`@google/genai`) | Structured JSON schema negotiation and mediation |
| **Guardrails** | Pure TypeScript Policy Engine | Deterministic validation & rule-based fallbacks |
| **Dashboard** | AG Grid Community v32 (`ag-grid-react`) | High-performance, sortable, filterable audit ledger |
| **Audit Ledger** | SHA-256 Hash Chaining | Tamper-evident ledger (`hash = SHA256(prev_hash + ...)`) |

---

## 4. Multi-Agent Architecture: Three Autonomous AI Agents

Orderly-AI coordinates three specialized autonomous agents, each serving a distinct fiduciary role:

### 1. Buyer Agent (`lib/agents/buyer.ts`)
- **Role:** Autonomous commercial advocate representing the consumer.
- **Objectives:** Discovers lowest acceptable market price while respecting strict consumer policy bounds.
- **Policy Invariants Enforced:**
  - `max_price`: Absolute hard spending ceiling (never propose or accept above this).
  - `auto_accept_below`: Threshold where agent automatically accepts favorable seller offers.
  - `ask_human_above`: Threshold requiring explicit human authorization.
  - `no_subscriptions`: Hard prohibition blocking recurring subscription commitments or trial traps.
  - `forbidden_terms`: Excludes unapproved terms (e.g. "crypto", "non-refundable").

### 2. Seller Agent (`lib/agents/seller.ts`)
- **Role:** Strategic commercial representative for the merchant.
- **Objectives:** Maximizes profit margins and inventory velocity while maintaining brand integrity.
- **Policy Invariants Enforced:**
  - `floor_price`: Non-negotiable minimum price preserving operating margins (never counter or accept below this).
  - `list_price`: Starting anchor price for concessions.
  - `bundle_rules`: Governs volume discounting formulas (e.g., maximum 20% discount on 2+ units).
  - `forbidden_claims`: Prevents unauthorized merchant commitments (e.g., "lifetime warranty", "unlimited returns").

### 3. Mediator Agent (`lib/agents/mediator.ts`)
- **Role:** Impartial, senior dispute resolution adjudicator.
- **Objectives:** Reviews full purchase transcript, agreed terms, and merchant return policies to resolve post-purchase claims objectively without adversarial chargebacks.
- **Outputs:** Evaluates claims (`not_as_described`, `damaged`, `changed_mind`), computes exact recommended refund amount, and cites specific policy clauses (e.g., *Merchant Policy §4.2: 50% partial refund for transit damage*). Enables one-click merchant settlement via PayPal Payments v2.

---

## 5. Gemini 3.5 Structured Outputs & Policy Guardrails

Orderly-AI combines generative intelligence with mathematical safety guarantees:

```
┌────────────────────────────────┐
│  Gemini 3.5 Flash (@google/genai)│
│  - System Prompt with Policy   │
│  - Type.OBJECT JSON Schema     │
└───────────────┬────────────────┘
                │ Raw JSON
                ▼
┌────────────────────────────────┐
│  Zod Schema Validation         │ ──(Throws on malformed JSON)──► Fallback Proposal
└───────────────┬────────────────┘
                │ Typed AgentProposal
                ▼
┌────────────────────────────────┐
│  Pure TypeScript Policy Engine │
│  - Invariant Verification      │
└───────────────┬────────────────┘
                │
        ┌───────┴───────┐
        │ Valid?        │
       YES              NO
        │               │
        │               ▼
        │        [Attempt 1 Fail?]
        │         ├── Retry with feedback prompt
        │         └── [Attempt 2 Fail?] ──► Deterministic Fallback Generator
        ▼
   Passed Token Sent to Opponent / PayPal
```

### Actual Implementation Highlights:
1. **Guaranteed Schema Adherence:** Every agent call utilizes `@google/genai` with `responseMimeType: "application/json"` and `responseSchema: geminiProposalSchema` (or `geminiMediatorSchema`), forcing model output into exact structured JSON tokens (`action`, `price`, `rationale`).
2. **Runtime Zod Parsing:** Model responses are parsed through strict Zod schemas (`proposalZodSchema`, `mediatorZodSchema`) to guarantee structural and type safety.
3. **Deterministic Pre-Execution Interception:** The pure TypeScript `PolicyEngine` validates every proposal in code *before* it can reach the opponent or PayPal. LLM hallucinations cannot bypass code-level checks.
4. **Self-Correction & Fallback Resilience:** If an agent proposes a policy-violating price, the engine prompts the model once with the exact violation for self-correction. If the model fails again or encounters free-tier rate limits (HTTP 429), `PolicyEngine.generateFallbackBuyerProposal` or `generateFallbackSellerProposal` generates a mathematically safe fallback proposal instantly.
5. **Replay Mode (`REPLAY_MODE=true`):** Recorded negotiation turns ([docs/recorded_negotiation.json](docs/recorded_negotiation.json)) allow zero-latency, zero-quota demonstrations for seamless video rehearsal.

---

## 6. PayPal API Integration & Security Architecture

Orderly-AI interfaces directly with official PayPal REST APIs and SDKs:

| Integration Point | PayPal Endpoint / Component | Implementation Details |
|---|---|---|
| **OAuth 2.0 Auth** | `POST /v1/oauth2/token` | In-memory token caching with 5-minute pre-expiration refresh and exponential backoff retry on HTTP 429 (`lib/paypal/auth.ts`). |
| **Orders Creation** | `POST /v2/checkout/orders` | Creates orders with `intent: "CAPTURE"`, negotiated settlement amount (e.g., $60.00), session `custom_id`, and `PayPal-Request-Id` idempotency key (`lib/paypal/orders.ts`). |
| **Payment Capture** | `POST /v2/checkout/orders/{id}/capture` | Backend capture triggered upon buyer authorization; updates session state and records capture ID in audit ledger (`app/api/orders/capture/route.ts`). |
| **Payments Refund** | `POST /v2/payments/captures/{id}/refund` | Executes full or partial refunds on the original PayPal capture ID based on AI Mediator rulings (`lib/paypal/payments.ts`). |
| **Webhook Verification** | `POST /v1/notifications/verify-webhook-signature` | Verifies cryptographic signature of inbound webhooks against PayPal servers before processing (`lib/paypal/webhooks.ts`). |
| **Native SDK Buttons** | `@paypal/react-paypal-js` | Native PayPal Checkout buttons render on agreement; enforces human authorization before executing capture. |
| **AI Agent Toolkit** | `@paypal/agent-toolkit/ai-sdk` | Official toolkit exposing 47 tools for programmatic payment workflows. |

### Webhook Security & Deduplication:
- **Mandatory Configuration:** Enforces `PAYPAL_WEBHOOK_ID`; incoming webhooks are immediately rejected with HTTP 500 if unconfigured, never bypassing signature verification.
- **Transmission Header Validation:** Validates all 5 mandatory headers (`paypal-auth-algo`, `paypal-cert-url`, `paypal-transmission-id`, `paypal-transmission-sig`, `paypal-transmission-time`).
- **Signature Verification:** Verified cryptographically via PayPal's official endpoint; invalid signatures return HTTP 400 immediately without touching database or session state.
- **Bounded LRU Deduplication:** A bounded `BoundedEventDeduplicator` (capacity: 1,000 events) prevents duplicate processing *strictly after* signature verification passes.
- **Capture Reconciliation:** Automatically reconciles `PAYMENT.CAPTURE.COMPLETED` events, updating sessions and logging to the tamper-evident ledger.

---

## 7. Quick Start (Run Locally in Under 5 Minutes)

### Prerequisites
- Node.js 18+ (verified on Node 20 / 22 / 26)
- npm or pnpm

### Step 1: Clone Repository & Install Dependencies
```bash
git clone https://github.com/varshitha14008-del/Orderly-AI.git
cd Orderly-AI
npm install
```

### Step 2: Configure Environment Variables
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```
Fill in your PayPal Sandbox and Gemini API credentials:
```env
PAYPAL_ENV=sandbox
PAYPAL_CLIENT_ID=<Your PayPal Sandbox Client ID>
PAYPAL_CLIENT_SECRET=<Your PayPal Sandbox Secret>
PAYPAL_WEBHOOK_ID=<Your PayPal Webhook ID>
NEXT_PUBLIC_PAYPAL_CLIENT_ID=<Your PayPal Sandbox Client ID>
GEMINI_API_KEY=<Your Google Gemini API Key>
GEMINI_MODEL=gemini-3.5-flash
GEMINI_FALLBACK_MODEL=gemini-3.5-flash-lite
REPLAY_MODE=false
APP_BASE_URL=http://localhost:3000
```

### Step 3: Run the Verification Test Suite
```bash
# 1. Run Pure Policy Engine Unit Tests (12/12)
npm run test:policy

# 2. Run SHA-256 Hash-Chained Audit Ledger Tests (4/4)
npm run test:audit

# 3. Run PayPal Orders v2 Create & Capture API Tests (5/5)
npm run test:orders

# 4. Run PayPal Webhook Security & Signature Verification Tests (8/8)
npm run test:webhook

# 5. Run Live Multi-Round Agent Negotiation Integration Test
npm run test:negotiation

# 6. Run Live PayPal Sandbox Spikes (OAuth, Orders v2, Agent Toolkit)
npm run spike:paypal
```

### Step 4: Start the Web Application
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 8. Portals & Application Flow

- **`/` (Marketplace Landing):** Architecture overview, seeded product inventory, and design system.
- **`/buyer` (Buyer Agent Portal):**
  - Set price ceiling, auto-accept threshold, human approval limits, and subscription ban.
  - Deploy autonomous Buyer Agent against Merchant Agent.
  - Watch live conversational turns with strategy rationales.
  - Authorize agreed price via native **PayPal Sandbox Buttons**.
- **`/merchant` (Merchant Hub & Dispute Operations):**
  - View floor price policies, margin constraints, and captured PayPal transactions.
  - Trigger simulated post-purchase dispute scenarios (e.g., damaged in transit).
  - Review **AI Mediator** ruling citing exact policy clauses.
  - 1-Click approve ruling to execute real **PayPal Payments v2** capture refund.
- **`/admin` (AG Grid Audit Dashboard):**
  - Live AG Grid Community tables for Audit Ledger, Negotiations, and Orders.
  - Full text search, multi-column sorting, column filters, and CSV export.
  - Real-time cryptographic status banner (`SHA-256: VERIFIED UNTAMPERED`).
- **`/demo` (Demo Control Panel):**
  - **Seed Golden Deal:** Instantly seeds a realistic multi-round negotiation linked to real sandbox order `49A309481M497412U`.
  - **Sync Now:** Triggers a one-shot live pull from PayPal Sandbox API to reconcile status.
  - **Reset All:** Cleanses session state and initializes a new genesis block.

---

## 9. Video Walkthrough Script (Under 3 Minutes)

See [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) for the timed 3-minute video presentation script.

---

## 10. License

This project is licensed under the open-source MIT License. See [LICENSE](LICENSE) for details.
