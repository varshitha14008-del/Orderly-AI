import { getPayPalAccessToken, getPayPalBaseUrl } from "./auth";

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
  const token = await getPayPalAccessToken();
  const baseUrl = getPayPalBaseUrl();
  const webhookId = params.webhookId || process.env.PAYPAL_WEBHOOK_ID;

  if (!webhookId) {
    console.warn("[PayPal Webhook] PAYPAL_WEBHOOK_ID not set. Skipping live verification.");
    return false;
  }

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
