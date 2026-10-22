import { NextResponse } from "next/server";
import { refundCapture } from "@/lib/paypal/payments";
import { auditLedger } from "@/lib/audit/ledger";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { sessionId, captureId, amount, note } = body;

    if (!captureId) {
      return NextResponse.json({ error: "Missing captureId" }, { status: 400 });
    }

    const refundResult = await refundCapture({
      captureId,
      amount: typeof amount === "number" ? amount : undefined,
      noteToPayer: note || "Refund approved per AI Mediator recommendation and merchant policy.",
    });

    auditLedger.record("human_merchant", "REFUND_APPROVED_AND_EXECUTED", {
      sessionId,
      captureId,
      refundId: refundResult.id,
      amount: refundResult.amount?.value,
      status: refundResult.status,
    });

    return NextResponse.json({
      success: true,
      refund: refundResult,
    });
  } catch (err: any) {
    console.error("[Refund API] Error executing refund:", err);
    return NextResponse.json(
      { error: err.message || "Failed to execute PayPal refund" },
      { status: 500 }
    );
  }
}
