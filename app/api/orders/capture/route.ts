import { NextResponse } from "next/server";
import { NegotiationManager } from "@/lib/negotiation/engine";
import { captureOrder } from "@/lib/paypal/orders";
import { auditLedger } from "@/lib/audit/ledger";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { sessionId, orderId } = body;

    if (!orderId) {
      return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
    }

    const captureResult = await captureOrder(orderId);

    const captureId =
      captureResult.purchase_units?.[0]?.payments?.captures?.[0]?.id || `cap_${Date.now()}`;

    if (sessionId) {
      NegotiationManager.attachPayPalCapture(sessionId, captureId);
    }

    auditLedger.record("paypal_api", "PAYMENT_CAPTURE_COMPLETED", {
      sessionId,
      orderId,
      captureId,
      status: captureResult.status,
    });

    return NextResponse.json({
      success: true,
      captureId,
      status: captureResult.status,
      details: captureResult,
    });
  } catch (err: any) {
    console.error("[Orders API] Error capturing payment:", err);
    return NextResponse.json(
      { error: err.message || "Failed to capture payment" },
      { status: 500 }
    );
  }
}
