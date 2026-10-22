import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/paypal/webhooks";
import { auditLedger } from "@/lib/audit/ledger";
import { NegotiationManager } from "@/lib/negotiation/engine";

// In-memory set for deduplication by event ID
const processedEvents = new Set<string>();

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const event = JSON.parse(rawBody);

    const eventId = event.id;
    const eventType = event.event_type;

    // Deduplication check
    if (eventId && processedEvents.has(eventId)) {
      console.log(`[PayPal Webhook] Duplicate event ${eventId} ignored.`);
      return NextResponse.json({ status: "DUPLICATE_IGNORED" });
    }
    if (eventId) {
      processedEvents.add(eventId);
    }

    // Verify signature if PAYPAL_WEBHOOK_ID is configured
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    let verified = false;

    if (webhookId) {
      const authAlgo = req.headers.get("paypal-auth-algo") || "";
      const certUrl = req.headers.get("paypal-cert-url") || "";
      const transmissionId = req.headers.get("paypal-transmission-id") || "";
      const transmissionSig = req.headers.get("paypal-transmission-sig") || "";
      const transmissionTime = req.headers.get("paypal-transmission-time") || "";

      verified = await verifyWebhookSignature({
        authAlgo,
        certUrl,
        transmissionId,
        transmissionSig,
        transmissionTime,
        webhookId,
        webhookEvent: event,
      });
    } else {
      // Local dev mode without registered webhook ID
      console.log("[PayPal Webhook] PAYPAL_WEBHOOK_ID not set. Accepting event in local sandbox dev mode.");
      verified = true;
    }

    // Log to hash-chained audit ledger
    auditLedger.record("webhook", `PAYPAL_WEBHOOK_${eventType?.replace(/\./g, "_") || "RECEIVED"}`, {
      eventId,
      eventType,
      resourceType: event.resource_type,
      resourceId: event.resource?.id,
      verified,
    });

    // Handle specific event reconciliation
    if (eventType === "PAYMENT.CAPTURE.COMPLETED") {
      const captureId = event.resource?.id;
      const customId = event.resource?.custom_id;
      if (customId) {
        NegotiationManager.attachPayPalCapture(customId, captureId);
      }
    }

    return NextResponse.json({
      status: "SUCCESS",
      eventId,
      verified,
    });
  } catch (err: any) {
    console.error("[PayPal Webhook] Error processing event:", err);
    return NextResponse.json(
      { error: err.message || "Failed to process webhook" },
      { status: 500 }
    );
  }
}
