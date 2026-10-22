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

## 4. Quick Start (Run Locally in Under 5 Minutes)

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

# 3. Run Live PayPal Sandbox Spikes (OAuth, Orders v2, Agent Toolkit)
npm run spike:paypal

# 4. Run Live Multi-Round Agent Negotiation Integration Test
npm run test:negotiation
```

### Step 4: Start the Web Application
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 5. Portals & Application Flow

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

## 6. Video Walkthrough Script (Under 3 Minutes)

See [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) for the timed 3-minute video presentation script.

---

## 7. License

This project is licensed under the open-source MIT License. See [LICENSE](LICENSE) for details.
