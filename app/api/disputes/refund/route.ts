import { NextResponse } from "next/server";
import { refundCapture } from "@/lib/paypal/payments";
import { auditLedger } from "@/lib/audit/ledger";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { sessionId, captureId, amount, note, decision } = body;

    if (!captureId) {
      return NextResponse.json({ error: "Missing captureId" }, { status: 400 });
    }

    // 1. If approved ruling is 'contest' or recommended refund amount is zero, do not call PayPal API
    const isContest = decision === "contest" || (typeof amount === "number" && amount === 0);

    if (isContest) {
      auditLedger.record("human_merchant", "DISPUTE_CONTEST_RULING_RECORDED", {
        sessionId,
        captureId,
        decision: "contest",
        refundAmount: 0,
        note: note || "Merchant approved contest ruling per AI Mediator recommendation.",
      });

      return NextResponse.json({
        success: true,
        decision: "contest",
        refundIssued: false,
        message: "Contest ruling approved and recorded. No refund issued as claim is contested per merchant policy.",
      });
    }

    // 2. Validate that refund amount is a positive number greater than zero before calling PayPal
    if (typeof amount === "number" && (isNaN(amount) || amount <= 0)) {
      return NextResponse.json(
        { error: "Invalid refund amount: refund amount must be greater than zero" },
        { status: 400 }
      );
    }

    // 3. For full and partial refunds with amounts greater than zero, execute PayPal Payments v2 refund
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
      decision: decision || (typeof amount === "number" ? "partial_refund" : "full_refund"),
      refundIssued: true,
      refund: refundResult,
      message: `Refund of $${refundResult.amount?.value || (typeof amount === "number" ? amount.toFixed(2) : "")} successfully executed via PayPal Payments v2.`,
    });
  } catch (err: any) {
    console.error("[Refund API] Error executing refund:", err);
    return NextResponse.json(
      { error: err.message || "Failed to execute PayPal refund" },
      { status: 500 }
    );
  }
}
