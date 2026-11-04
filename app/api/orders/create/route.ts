import { NextResponse } from "next/server";
import { NegotiationManager } from "@/lib/negotiation/engine";
import { createOrder } from "@/lib/paypal/orders";
import { auditLedger, captureRequestAuditEvents } from "@/lib/audit/ledger";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { sessionId, amount, description, session: clientSession } = body;

    // If client supplied a session snapshot, safely restore it through validated monotonic restoration
    if (clientSession) {
      if (sessionId && typeof clientSession.id === "string" && clientSession.id !== sessionId) {
        return NextResponse.json(
          { error: `Session snapshot ID mismatch: expected ${sessionId}, got ${clientSession.id}` },
          { status: 400 }
        );
      }
      NegotiationManager.restoreSession(clientSession);
    }

    // 1. Look up existing session in negotiation manager
    const targetSessionId = sessionId || clientSession?.id;
    let session = targetSessionId ? NegotiationManager.getSession(targetSessionId) : undefined;

    // 2. Resolve agreed settlement price: from session or fallback to provided amount
    const agreedPrice =
      session?.agreedPrice ??
      (typeof amount === "number" && !isNaN(amount) && amount > 0 ? amount : null);

    if (!agreedPrice) {
      if (!session && !amount) {
        return NextResponse.json(
          { error: "Session not found and no settlement amount provided" },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: "Cannot create order: No agreed settlement price found or provided" },
        { status: 400 }
      );
    }

    const itemDescription =
      description ||
      (session ? `${session.product.title} (Negotiated Agreement)` : "Orderly-AI Negotiated Agreement");

    const customId = session ? session.id : (targetSessionId || `deal_${Date.now()}`);

    // 3. Call PayPal Orders v2 with agreed settlement amount within request-scoped audit context
    const { result: order, events } = await captureRequestAuditEvents(async () => {
      const created = await createOrder({
        amount: agreedPrice,
        customId,
        description: itemDescription,
      });

      if (session) {
        NegotiationManager.attachPayPalOrder(session.id, created.id);
      }

      auditLedger.record("paypal_api", "PAYPAL_ORDER_CREATED", {
        sessionId: customId,
        orderId: created.id,
        amount: agreedPrice,
        status: created.status,
      });

      return created;
    });

    const updatedSession = session ? NegotiationManager.getSession(session.id) : undefined;

    return NextResponse.json({
      success: true,
      orderId: order.id,
      status: order.status,
      links: order.links,
      session: updatedSession,
      events,
    });
  } catch (err: any) {
    console.error("[Orders API] Error creating order:", err);
    const isValidationOrStaleError =
      err.message?.includes("snapshot") ||
      err.message?.includes("Illegal state transition");

    return NextResponse.json(
      { error: err.message || "Failed to create PayPal order" },
      { status: isValidationOrStaleError ? 400 : 500 }
    );
  }
}
