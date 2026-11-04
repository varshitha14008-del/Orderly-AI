import { NextResponse } from "next/server";
import { refundCapture, getCapture } from "@/lib/paypal/payments";
import { auditLedger } from "@/lib/audit/ledger";

// Safe two-decimal currency arithmetic using integer cents to prevent floating-point drift
function toCents(val: string | number | undefined | null): number {
  if (val === undefined || val === null) return 0;
  const num = typeof val === "number" ? val : parseFloat(val);
  if (isNaN(num)) return 0;
  return Math.round(num * 100);
}

function fromCents(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { sessionId, captureId, amount, note, decision } = body;

    if (!captureId) {
      return NextResponse.json({ error: "Missing captureId" }, { status: 400 });
    }

    // 1. Preserve existing contest behavior: decision === "contest" records ruling
    // Do not call getCapture() or refundCapture() for a contest.
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

    // 2. Validate requested amount if provided: reject if zero or negative
    if (typeof amount === "number" && (isNaN(amount) || amount <= 0)) {
      return NextResponse.json(
        { error: "Invalid refund amount: refund amount must be greater than zero" },
        { status: 400 }
      );
    }

    // 3. Retrieve capture details from PayPal Payments v2 before issuing refund
    const capture = await getCapture(captureId);

    if (!capture || !capture.status || !capture.amount) {
      return NextResponse.json(
        { error: `Invalid capture data received from PayPal for capture ${captureId}` },
        { status: 502 }
      );
    }

    // 4. Validate that capture is in a refundable state
    if (capture.status === "REFUNDED") {
      return NextResponse.json(
        {
          error: "Capture is already fully refunded",
          captureStatus: capture.status,
          remainingBalance: 0,
        },
        { status: 400 }
      );
    }

    if (capture.status !== "COMPLETED" && capture.status !== "PARTIALLY_REFUNDED") {
      return NextResponse.json(
        {
          error: `Capture is not in a refundable state (status: ${capture.status})`,
          captureStatus: capture.status,
        },
        { status: 400 }
      );
    }

    // 5. Calculate remaining balance using safe two-decimal currency arithmetic
    const originalCaptureAmountCents = toCents(capture.amount.value);
    const totalRefundedAmountCents = toCents(
      capture.seller_receivable_breakdown?.total_refunded_amount?.value
    );
    const remainingBalanceCents = Math.max(0, originalCaptureAmountCents - totalRefundedAmountCents);
    const remainingBalance = fromCents(remainingBalanceCents);

    if (remainingBalanceCents <= 0) {
      return NextResponse.json(
        {
          error: "Cannot refund: remaining refundable balance is zero",
          remainingBalance: 0,
          captureStatus: capture.status,
        },
        { status: 400 }
      );
    }

    // 6. Determine refund amount and validate against remaining balance
    // If no amount is supplied, refund the remaining balance
    let refundAmount: number;
    if (typeof amount === "number") {
      const requestedCents = toCents(amount);
      if (requestedCents > remainingBalanceCents) {
        return NextResponse.json(
          {
            error: `Requested refund amount ($${amount.toFixed(2)}) exceeds remaining refundable balance of $${remainingBalance.toFixed(2)}`,
            requestedAmount: amount,
            remainingBalance,
          },
          { status: 400 }
        );
      }
      // Preserve the exact requested amount without silently changing it
      refundAmount = amount;
    } else {
      refundAmount = remainingBalance;
    }

    // Preserve the original capture currency code
    const currency = capture.amount.currency_code || "USD";

    // 7. Execute PayPal Payments v2 refund
    const refundResult = await refundCapture({
      captureId,
      amount: refundAmount,
      currency,
      noteToPayer: note || "Refund approved per AI Mediator recommendation and merchant policy.",
    });

    const isFullRefund =
      refundAmount === remainingBalance && remainingBalanceCents === originalCaptureAmountCents;
    const finalDecision = decision || (isFullRefund ? "full_refund" : "partial_refund");

    // 8. Handle PayPal refund response statuses correctly
    if (refundResult.status === "COMPLETED") {
      auditLedger.record("human_merchant", "REFUND_APPROVED_AND_EXECUTED", {
        sessionId,
        captureId,
        refundId: refundResult.id,
        amount: refundResult.amount?.value || refundAmount.toFixed(2),
        currency: refundResult.amount?.currency_code || currency,
        status: "COMPLETED",
        decision: finalDecision,
      });

      return NextResponse.json({
        success: true,
        status: "COMPLETED",
        decision: finalDecision,
        refundIssued: true,
        refund: refundResult,
        remainingBalance: fromCents(remainingBalanceCents - toCents(refundAmount)),
        message: `Refund of $${refundResult.amount?.value || refundAmount.toFixed(2)} successfully executed via PayPal Payments v2.`,
      });
    }

    if (refundResult.status === "PENDING") {
      // Do not report as completed. Return pending response and record pending audit event.
      // Do not record as REFUND_APPROVED_AND_EXECUTED.
      auditLedger.record("human_merchant", "REFUND_PENDING_APPROVAL", {
        sessionId,
        captureId,
        refundId: refundResult.id,
        amount: refundResult.amount?.value || refundAmount.toFixed(2),
        currency: refundResult.amount?.currency_code || currency,
        status: "PENDING",
        decision: finalDecision,
        note: "Refund submitted to PayPal; settlement is pending.",
      });

      return NextResponse.json({
        success: true,
        status: "PENDING",
        decision: finalDecision,
        refundIssued: false,
        pending: true,
        refund: refundResult,
        remainingBalance: fromCents(remainingBalanceCents - toCents(refundAmount)),
        message: `Refund of $${refundResult.amount?.value || refundAmount.toFixed(2)} submitted to PayPal but is PENDING settlement.`,
      });
    }

    // FAILED or CANCELLED: do not report success. Return failure response.
    auditLedger.record("human_merchant", "REFUND_EXECUTION_FAILED", {
      sessionId,
      captureId,
      refundId: refundResult.id,
      amount: refundResult.amount?.value || refundAmount.toFixed(2),
      status: refundResult.status,
      decision: finalDecision,
      error: `PayPal refund status is ${refundResult.status}`,
    });

    return NextResponse.json(
      {
        success: false,
        status: refundResult.status,
        error: `PayPal refund failed with status: ${refundResult.status}`,
        refund: refundResult,
      },
      { status: 400 }
    );
  } catch (err: any) {
    console.error("[Refund API] Error executing refund:", err);
    return NextResponse.json(
      { error: err.message || "Failed to execute PayPal refund" },
      { status: 500 }
    );
  }
}
