import { NextResponse } from "next/server";
import { NegotiationManager } from "@/lib/negotiation/engine";
import { createOrder } from "@/lib/paypal/orders";
import { auditLedger } from "@/lib/audit/ledger";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { sessionId, amount, description } = body;

    // 1. Look up existing session in negotiation manager
    let session = sessionId ? NegotiationManager.getSession(sessionId) : undefined;

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

    const customId = session ? session.id : (sessionId || `deal_${Date.now()}`);

    // 3. Call PayPal Orders v2 with agreed settlement amount
    const order = await createOrder({
      amount: agreedPrice,
      customId,
      description: itemDescription,
    });

    if (session) {
      NegotiationManager.attachPayPalOrder(session.id, order.id);
    }

    auditLedger.record("paypal_api", "PAYPAL_ORDER_CREATED", {
      sessionId: customId,
      orderId: order.id,
      amount: agreedPrice,
      status: order.status,
    });

    return NextResponse.json({
      success: true,
      orderId: order.id,
      status: order.status,
      links: order.links,
    });
  } catch (err: any) {
    console.error("[Orders API] Error creating order:", err);
    return NextResponse.json(
      { error: err.message || "Failed to create PayPal order" },
      { status: 500 }
    );
  }
}
