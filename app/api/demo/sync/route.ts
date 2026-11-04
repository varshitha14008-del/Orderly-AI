import { NextResponse } from "next/server";
import { NegotiationManager } from "@/lib/negotiation/engine";
import { getOrder } from "@/lib/paypal/orders";
import { auditLedger } from "@/lib/audit/ledger";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { orderId } = body;

    // Resolve target order ID from request or active sessions with genuine PayPal orders
    let targetOrderId = typeof orderId === "string" && orderId.trim() ? orderId.trim() : null;

    if (!targetOrderId) {
      const activeSessions = NegotiationManager.getAllSessions();
      const sessionWithRealOrder = activeSessions.find(
        (s) =>
          s.paypalOrderId &&
          s.paypalOrderId !== "49A309481M497412U" &&
          !s.paypalOrderId.startsWith("DEMO_") &&
          !s.paypalOrderId.startsWith("MOCK_")
      );
      if (sessionWithRealOrder) {
        targetOrderId = sessionWithRealOrder.paypalOrderId;
      }
    }

    // If no genuine PayPal order ID exists or is a known demo placeholder, do not call PayPal
    if (
      !targetOrderId ||
      targetOrderId === "49A309481M497412U" ||
      targetOrderId.startsWith("DEMO_") ||
      targetOrderId.startsWith("MOCK_")
    ) {
      return NextResponse.json({
        success: false,
        synced: false,
        message:
          "This demo deal has no real PayPal order to sync. Complete checkout in the Buyer Portal to create and sync a live PayPal Sandbox order.",
      });
    }

    // Call live PayPal sandbox with genuine order ID
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
