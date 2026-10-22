import { NextResponse } from "next/server";
import { NegotiationManager } from "@/lib/negotiation/engine";
import { createOrder } from "@/lib/paypal/orders";
import { auditLedger } from "@/lib/audit/ledger";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { sessionId } = body;

    const session = NegotiationManager.getSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (!session.agreedPrice) {
      return NextResponse.json(
        { error: "Cannot create order: No agreed price in negotiation session" },
        { status: 400 }
      );
    }

    // Call PayPal Orders v2
    const order = await createOrder({
      amount: session.agreedPrice,
      customId: session.id,
      description: `${session.product.title} (Negotiated Agreement)`,
    });

    NegotiationManager.attachPayPalOrder(session.id, order.id);

    auditLedger.record("paypal_api", "PAYPAL_ORDER_CREATED", {
      sessionId: session.id,
      orderId: order.id,
      amount: session.agreedPrice,
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
