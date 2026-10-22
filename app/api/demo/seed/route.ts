import { NextResponse } from "next/server";
import { NegotiationManager } from "@/lib/negotiation/engine";
import { auditLedger } from "@/lib/audit/ledger";

export async function POST() {
  // 1. Create keyboard session
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
  session.paypalOrderId = "49A309481M497412U";
  session.paypalCaptureId = "78B991204X518204K";

  // Record audit events
  auditLedger.record("buyer_agent", "PROPOSAL_ACCEPTED_BY_POLICY", {
    sessionId: session.id,
    price: 48.0,
    action: "counter",
  });
  auditLedger.record("seller_agent", "NEGOTIATION_AGREEMENT_REACHED", {
    sessionId: session.id,
    agreedPrice: 48.0,
  });
  auditLedger.record("paypal_api", "PAYMENT_CAPTURE_COMPLETED", {
    sessionId: session.id,
    orderId: "49A309481M497412U",
    captureId: "78B991204X518204K",
    status: "COMPLETED",
  });

  return NextResponse.json({
    success: true,
    message: "Seeded complete negotiation deal with live verified sandbox order.",
    session,
  });
}
