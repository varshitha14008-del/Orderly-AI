import { NextResponse } from "next/server";
import { NegotiationManager } from "@/lib/negotiation/engine";
import { captureOrder } from "@/lib/paypal/orders";
import { auditLedger, captureRequestAuditEvents } from "@/lib/audit/ledger";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { sessionId, orderId, session: clientSession } = body;

    if (!orderId) {
      return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
    }

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

    const targetSessionId = sessionId || clientSession?.id;

    const { result: captureData, events } = await captureRequestAuditEvents(async () => {
      const captureResult = await captureOrder(orderId);

      const firstCapture = captureResult.purchase_units?.[0]?.payments?.captures?.[0];
      const captureId = firstCapture?.id || `cap_${Date.now()}`;
      const captureStatus = firstCapture?.status || captureResult.status || "COMPLETED";

      if (targetSessionId) {
        NegotiationManager.attachPayPalCapture(targetSessionId, captureId, captureStatus);
      }

      const auditEventType =
        captureStatus === "PENDING"
          ? "PAYMENT_CAPTURE_PENDING"
          : "PAYMENT_CAPTURE_COMPLETED";

      auditLedger.record("paypal_api", auditEventType, {
        sessionId: targetSessionId,
        orderId,
        captureId,
        status: captureStatus,
        orderStatus: captureResult.status,
      });

      return { captureResult, captureId, captureStatus, targetSessionId };
    });

    const updatedSession = captureData.targetSessionId
      ? NegotiationManager.getSession(captureData.targetSessionId)
      : undefined;

    return NextResponse.json({
      success: true,
      captureId: captureData.captureId,
      status: captureData.captureStatus,
      orderStatus: captureData.captureResult.status,
      details: captureData.captureResult,
      session: updatedSession,
      events,
    });
  } catch (err: any) {
    console.error("[Orders API] Error capturing payment:", err);
    const isValidationOrStaleError =
      err.message?.includes("snapshot") ||
      err.message?.includes("Illegal state transition");

    return NextResponse.json(
      { error: err.message || "Failed to capture payment" },
      { status: isValidationOrStaleError ? 400 : 500 }
    );
  }
}
