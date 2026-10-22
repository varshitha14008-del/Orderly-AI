import { NextResponse } from "next/server";
import { NegotiationManager } from "@/lib/negotiation/engine";
import { getOrder } from "@/lib/paypal/orders";
import { auditLedger } from "@/lib/audit/ledger";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { orderId } = body;

    const targetOrderId = orderId || "49A309481M497412U";

    // Call live PayPal sandbox
    const liveOrder = await getOrder(targetOrderId);

    auditLedger.record("paypal_api", "ONE_SHOT_SANDBOX_SYNC", {
      orderId: targetOrderId,
      status: liveOrder.status,
      grossAmount: liveOrder.purchase_units?.[0]?.amount?.value,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      order: liveOrder,
      message: `Successfully synchronized order ${targetOrderId} directly from PayPal Sandbox.`,
    });
  } catch (err: any) {
    console.error("[Sync API] Error in sandbox sync:", err);
    return NextResponse.json(
      { error: err.message || "Failed to sync from PayPal Sandbox" },
      { status: 500 }
    );
  }
}
