import { getPayPalAccessToken, getPayPalBaseUrl } from "./auth";

export const REQUIRED_WEBHOOK_HEADERS = [
  "paypal-auth-algo",
  "paypal-cert-url",
  "paypal-transmission-id",
  "paypal-transmission-sig",
  "paypal-transmission-time",
] as const;

export interface ExtractedWebhookHeaders {
  authAlgo: string;
  certUrl: string;
  transmissionId: string;
  transmissionSig: string;
  transmissionTime: string;
}

export type HeaderValidationResult =
  | { valid: true; headers: ExtractedWebhookHeaders }
  | { valid: false; missing: string[] };

/**
 * Validates that all five required PayPal transmission headers are present and non-empty.
 */
export function validateWebhookHeaders(
  headers: Headers | Record<string, string | null | undefined>
): HeaderValidationResult {
  const getHeader = (name: string): string => {
    if (typeof (headers as Headers).get === "function") {
      return (headers as Headers).get(name)?.trim() || "";
    }
    const val = (headers as Record<string, string | null | undefined>)[name];
    return typeof val === "string" ? val.trim() : "";
  };

  const missing: string[] = [];

  const authAlgo = getHeader("paypal-auth-algo");
  if (!authAlgo) missing.push("paypal-auth-algo");

  const certUrl = getHeader("paypal-cert-url");
  if (!certUrl) missing.push("paypal-cert-url");

  const transmissionId = getHeader("paypal-transmission-id");
  if (!transmissionId) missing.push("paypal-transmission-id");

  const transmissionSig = getHeader("paypal-transmission-sig");
  if (!transmissionSig) missing.push("paypal-transmission-sig");

  const transmissionTime = getHeader("paypal-transmission-time");
  if (!transmissionTime) missing.push("paypal-transmission-time");

  if (missing.length > 0) {
    return { valid: false, missing };
  }

  return {
    valid: true,
    headers: {
      authAlgo,
      certUrl,
      transmissionId,
      transmissionSig,
      transmissionTime,
    },
  };
}

/**
 * Bounded in-memory event deduplication cache using LRU eviction.
 *
 * NOTE ON ARCHITECTURAL LIMITATIONS:
 * 1. Server Restarts: In-memory state is transient. Restarting the server process clears this cache,
 *    meaning any unexpired event retried by PayPal after a restart may be reprocessed.
 * 2. Multi-Instance / Serverless: Each Node.js process / serverless lambda maintains its own memory space.
 *    If PayPal dispatches retries across different instances or containers, deduplication will not be shared.
 * 3. Production Recommendation: For production deployments, replace or back this with a distributed,
 *    persistent store with atomic operations and TTL, such as Redis (e.g. SET event:<id> 1 NX EX 86400)
 *    or a database table with a unique constraint on event_id.
 */
export class BoundedEventDeduplicator {
  private events: Map<string, number>;
  private readonly maxSize: number;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
    this.events = new Map();
  }

  public has(eventId: string): boolean {
    return this.events.has(eventId);
  }

  public add(eventId: string): void {
    if (this.events.has(eventId)) {
      // Re-insert to refresh recency for LRU ordering
      this.events.delete(eventId);
    } else if (this.events.size >= this.maxSize) {
      // Evict the oldest entry (first item in Map iteration)
      const oldestKey = this.events.keys().next().value;
      if (oldestKey) {
        this.events.delete(oldestKey);
      }
    }
    this.events.set(eventId, Date.now());
  }

  public clear(): void {
    this.events.clear();
  }

  public size(): number {
    return this.events.size;
  }
}

// Global bounded deduplicator instance (capacity: 1000 events)
export const webhookDeduplicator = new BoundedEventDeduplicator(1000);

export interface WebhookVerificationParams {
  authAlgo: string;
  certUrl: string;
  transmissionId: string;
  transmissionSig: string;
  transmissionTime: string;
  webhookId?: string;
  webhookEvent: Record<string, any>;
}

export interface VerificationResponse {
  verification_status: "SUCCESS" | "FAILURE";
}

/**
 * Verifies the cryptographic signature of an inbound PayPal webhook
 * Endpoint: POST /v1/notifications/verify-webhook-signature
 */
export async function verifyWebhookSignature(
  params: WebhookVerificationParams
): Promise<boolean> {
  const webhookId = params.webhookId || process.env.PAYPAL_WEBHOOK_ID;

  if (!webhookId) {
    console.error("[PayPal Webhook] PAYPAL_WEBHOOK_ID is not configured. Webhook verification cannot proceed.");
    throw new Error("PAYPAL_WEBHOOK_ID is required for webhook signature verification.");
  }

  if (
    !params.authAlgo ||
    !params.certUrl ||
    !params.transmissionId ||
    !params.transmissionSig ||
    !params.transmissionTime
  ) {
    console.error("[PayPal Webhook] Missing required transmission headers in verification params.");
    return false;
  }

  const token = await getPayPalAccessToken();
  const baseUrl = getPayPalBaseUrl();

  const payload = {
    auth_algo: params.authAlgo,
    cert_url: params.certUrl,
    transmission_id: params.transmissionId,
    transmission_sig: params.transmissionSig,
    transmission_time: params.transmissionTime,
    webhook_id: webhookId,
    webhook_event: params.webhookEvent,
  };

  const response = await fetch(`${baseUrl}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[PayPal Webhook] Verification endpoint returned ${response.status}: ${errorText}`);
    return false;
  }

  const data: VerificationResponse = await response.json();
  return data.verification_status === "SUCCESS";
}
