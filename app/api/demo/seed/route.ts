import { NextResponse } from "next/server";
import { NegotiationManager } from "@/lib/negotiation/engine";
import { auditLedger, captureRequestAuditEvents } from "@/lib/audit/ledger";

export async function POST() {
  const { result: session, events } = await captureRequestAuditEvents(async () => {
    // 1. Create keyboard session (version: 1)
    const session = NegotiationManager.createSession("prod-kb-01", {
      max_price: 60.0,
      auto_accept_below: 40.0,
      ask_human_above: 50.0,
    });

    // 2. Add realistic negotiated turns
    session.turns.push(
      {
        turnId: 1,
        round: 1,
        role: "buyer",
        proposal: { action: "offer", price: 38.0, rationale: "Initial opening offer for mechanical keyboard." },
        fallback: false,
        timestamp: new Date(Date.now() - 180000).toISOString(),
      },
      {
        turnId: 2,
        round: 1,
        role: "seller",
        proposal: { action: "counter", price: 65.0, rationale: "List price is $75.00 for premium switches; offering $65.00." },
        fallback: false,
        timestamp: new Date(Date.now() - 120000).toISOString(),
      },
      {
        turnId: 3,
        round: 2,
        role: "buyer",
        proposal: { action: "counter", price: 48.0, rationale: "Final stretch to $48.00 if we close immediately." },
        fallback: false,
        timestamp: new Date(Date.now() - 60000).toISOString(),
      },
      {
        turnId: 4,
        round: 2,
        role: "seller",
        proposal: { action: "accept", price: 48.0, rationale: "Accepted $48.00. Meets margin requirements above floor price." },
        fallback: false,
        timestamp: new Date().toISOString(),
      }
    );

    session.status = "COMPLETED";
    session.agreedPrice = 48.0;
    session.paypalOrderId = null;
    session.paypalCaptureId = null;
    session.version = (session.version ?? 1) + 1; // Atomic seed mutation -> version 2
    session.updatedAt = new Date().toISOString();

    // Record audit events for negotiation agreement
    auditLedger.record("buyer_agent", "PROPOSAL_ACCEPTED_BY_POLICY", {
      sessionId: session.id,
      price: 48.0,
      action: "counter",
    });
    auditLedger.record("seller_agent", "NEGOTIATION_AGREEMENT_REACHED", {
      sessionId: session.id,
      agreedPrice: 48.0,
    });
    auditLedger.record("system", "DEMO_COMPLETED_DEAL_SEEDED", {
      sessionId: session.id,
      productId: session.product.id,
      agreedPrice: 48.0,
      hasRealPayPalPayment: false,
      note: "Seeded realistic completed negotiation deal for demo evaluation without live PayPal payment.",
    });

    return session;
  });

  return NextResponse.json({
    success: true,
    message: "Seeded complete negotiation deal for demo evaluation (no live PayPal payment attached).",
    session,
    events,
  });
}
