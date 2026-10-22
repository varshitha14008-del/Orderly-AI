import { getPayPalAccessToken, getPayPalBaseUrl } from "./auth";

export interface RefundCaptureParams {
  captureId: string;
  amount?: number; // If omitted, full refund is executed
  currency?: string;
  noteToPayer?: string;
  requestId?: string; // Idempotency
}

export interface RefundResponse {
  id: string;
  status: "COMPLETED" | "PENDING" | "FAILED" | "CANCELLED";
  amount: {
    value: string;
    currency_code: string;
  };
  note_to_payer?: string;
  create_time: string;
  update_time?: string;
}

export interface CaptureDetailsResponse {
  id: string;
  status: "COMPLETED" | "DECLINED" | "PARTIALLY_REFUNDED" | "REFUNDED" | "PENDING";
  amount: {
    value: string;
    currency_code: string;
  };
  final_capture: boolean;
  create_time: string;
}

/**
 * Refunds a captured payment (full or partial) via Payments v2
 * Endpoint: POST /v2/payments/captures/{capture_id}/refund
 */
export async function refundCapture(params: RefundCaptureParams): Promise<RefundResponse> {
  const token = await getPayPalAccessToken();
  const baseUrl = getPayPalBaseUrl();
  const requestId = params.requestId || `refund_${params.captureId}_${Date.now()}`;

  const payload: Record<string, any> = {};

  if (typeof params.amount === "number") {
    payload.amount = {
      value: params.amount.toFixed(2),
      currency_code: params.currency || "USD",
    };
  }

  if (params.noteToPayer) {
    payload.note_to_payer = params.noteToPayer.substring(0, 255);
  }

  const response = await fetch(`${baseUrl}/v2/payments/captures/${params.captureId}/refund`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": requestId,
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to refund PayPal capture ${params.captureId} (status ${response.status}): ${errorText}`);
  }

  return response.json();
}

/**
 * Retrieves details of a specific payment capture
 * Endpoint: GET /v2/payments/captures/{capture_id}
 */
export async function getCapture(captureId: string): Promise<CaptureDetailsResponse> {
  const token = await getPayPalAccessToken();
  const baseUrl = getPayPalBaseUrl();

  const response = await fetch(`${baseUrl}/v2/payments/captures/${captureId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch capture ${captureId} (status ${response.status}): ${errorText}`);
  }

  return response.json();
}
