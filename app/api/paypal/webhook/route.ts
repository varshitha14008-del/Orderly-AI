import { NextResponse } from "next/server";
import {
  verifyWebhookSignature,
  validateWebhookHeaders,
  webhookDeduplicator,
} from "@/lib/paypal/webhooks";
import { auditLedger } from "@/lib/audit/ledger";
import { NegotiationManager } from "@/lib/negotiation/engine";

export async function POST(req: Request) {
  try {
    // 1. Enforce PAYPAL_WEBHOOK_ID requirement: never bypass signature verification
    const webhookId = process.env.PAYPAL_WEBHOOK_ID?.trim();
    if (!webhookId) {
      console.error(
        "[PayPal Webhook] Security Error: PAYPAL_WEBHOOK_ID is not configured. Webhook rejected."
      );
      return NextResponse.json(
        { error: "Server configuration error: PAYPAL_WEBHOOK_ID is not configured" },
        { status: 500 }
      );
    }

    // 2. Validate that all five required transmission headers are present and non-empty
    const headerValidation = validateWebhookHeaders(req.headers);
    if (!headerValidation.valid) {
      console.warn(
        `[PayPal Webhook] Request missing required transmission headers: ${headerValidation.missing.join(", ")}`
      );
      return NextResponse.json(
        {
          error: "Missing required PayPal transmission headers",
          missingHeaders: headerValidation.missing,
        },
        { status: 400 }
      );
    }

    // 3. Parse JSON body
    let rawBody: string;
    let event: Record<string, any>;
    try {
      rawBody = await req.text();
      event = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON payload" },
        { status: 400 }
      );
    }

    const eventId = event?.id;
    const eventType = event?.event_type;

    if (!eventId || typeof eventId !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid event id in webhook payload" },
        { status: 400 }
      );
    }

    // 4. Verify cryptographic signature via official PayPal API
    let isVerified = false;
    try {
      isVerified = await verifyWebhookSignature({
        authAlgo: headerValidation.headers.authAlgo,
        certUrl: headerValidation.headers.certUrl,
        transmissionId: headerValidation.headers.transmissionId,
        transmissionSig: headerValidation.headers.transmissionSig,
        transmissionTime: headerValidation.headers.transmissionTime,
        webhookId,
        webhookEvent: event,
      });
    } catch (verifyErr: any) {
      console.error("[PayPal Webhook] Signature verification call failed:", verifyErr.message);
      return NextResponse.json(
        { error: "Webhook signature verification error" },
        { status: 400 }
      );
    }

    // 5. If verification fails, immediately reject with HTTP 400. Do not process or update data.
    if (!isVerified) {
      console.warn(
        `[PayPal Webhook] Cryptographic signature verification failed for event ${eventId}. Webhook rejected.`
      );
      return NextResponse.json(
        { error: "Invalid webhook signature" },
        { status: 400 }
      );
    }

    // 6. Deduplication check: executed ONLY AFTER signature verification succeeds
    if (webhookDeduplicator.has(eventId)) {
      console.log(`[PayPal Webhook] Duplicate verified event ${eventId} ignored.`);
      return NextResponse.json({ status: "DUPLICATE_IGNORED", eventId });
    }

    // Mark event as processed in bounded cache
    webhookDeduplicator.add(eventId);

    // 7. Log verified event to hash-chained audit ledger
    auditLedger.record(
      "webhook",
      `PAYPAL_WEBHOOK_${eventType?.replace(/\./g, "_") || "RECEIVED"}`,
      {
        eventId,
        eventType,
        resourceType: event.resource_type,
        resourceId: event.resource?.id,
        verified: true,
      }
    );

    // 8. Reconcile PAYMENT.CAPTURE.COMPLETED: update negotiation session
    if (eventType === "PAYMENT.CAPTURE.COMPLETED") {
      const captureId = event.resource?.id;
      const customId = event.resource?.custom_id;
      if (customId && captureId && typeof captureId === "string") {
        NegotiationManager.attachPayPalCapture(customId, captureId, "COMPLETED");
      }
    } else if (eventType === "PAYMENT.CAPTURE.PENDING") {
      const captureId = event.resource?.id;
      const customId = event.resource?.custom_id;
      if (customId && captureId && typeof captureId === "string") {
        NegotiationManager.attachPayPalCapture(customId, captureId, "PENDING");
      }
    }

    return NextResponse.json({
      status: "SUCCESS",
      eventId,
      verified: true,
    });
  } catch (err: any) {
    console.error("[PayPal Webhook] Error processing event:", err);
    return NextResponse.json(
      { error: err.message || "Failed to process webhook" },
      { status: 500 }
    );
  }
}
