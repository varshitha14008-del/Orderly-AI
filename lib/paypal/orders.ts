import { getPayPalAccessToken, getPayPalBaseUrl } from "./auth";

export interface CreateOrderParams {
  amount: number;
  currency?: string;
  customId: string; // Negotiation ID or reference
  description: string;
  requestId?: string; // Idempotency key
}

export interface PayPalOrderResponse {
  id: string;
  status: "CREATED" | "SAVED" | "APPROVED" | "VOIDED" | "COMPLETED" | "PAYER_ACTION_REQUIRED";
  links: Array<{ href: string; rel: string; method: string }>;
  purchase_units?: Array<{
    reference_id?: string;
    amount: { currency_code: string; value: string };
    payments?: {
      captures?: Array<{
        id: string;
        status: string;
        amount: { currency_code: string; value: string };
      }>;
    };
  }>;
}

export interface CaptureOrderResponse {
  id: string;
  status: "COMPLETED" | "DECLINED" | "PARTIALLY_REFUNDED" | "REFUNDED" | "PENDING";
  purchase_units?: Array<{
    payments?: {
      captures?: Array<{
        id: string;
        status: string;
        amount: { currency_code: string; value: string };
        create_time?: string;
      }>;
    };
  }>;
}

/**
 * Creates an order via PayPal Orders v2 API
 * Endpoint: POST /v2/checkout/orders
 */
export async function createOrder(params: CreateOrderParams): Promise<PayPalOrderResponse> {
  const token = await getPayPalAccessToken();
  const baseUrl = getPayPalBaseUrl();
  const requestId = params.requestId || `order_${params.customId}_${Date.now()}`;

  const payload = {
    intent: "CAPTURE",
    purchase_units: [
      {
        custom_id: params.customId,
        description: params.description.substring(0, 127),
        amount: {
          currency_code: params.currency || "USD",
          value: params.amount.toFixed(2),
        },
      },
    ],
    application_context: {
      brand_name: "Orderly-AI Marketplace",
      user_action: "PAY_NOW",
      return_url: `${process.env.APP_BASE_URL || "http://localhost:3000"}/buyer/success`,
      cancel_url: `${process.env.APP_BASE_URL || "http://localhost:3000"}/buyer/cancel`,
    },
  };

  const response = await fetch(`${baseUrl}/v2/checkout/orders`, {
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
    throw new Error(`Failed to create PayPal order (status ${response.status}): ${errorText}`);
  }

  return response.json();
}

/**
 * Captures payment for an approved PayPal order
 * Endpoint: POST /v2/checkout/orders/{id}/capture
 */
export async function captureOrder(orderId: string, requestId?: string): Promise<CaptureOrderResponse> {
  const token = await getPayPalAccessToken();
  const baseUrl = getPayPalBaseUrl();
  const idempotencyKey = requestId || `capture_${orderId}_${Date.now()}`;

  const response = await fetch(`${baseUrl}/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": idempotencyKey,
      Prefer: "return=representation",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to capture PayPal order ${orderId} (status ${response.status}): ${errorText}`);
  }

  return response.json();
}

/**
 * Retrieves details of a specific PayPal order
 * Endpoint: GET /v2/checkout/orders/{id}
 */
export async function getOrder(orderId: string): Promise<PayPalOrderResponse> {
  const token = await getPayPalAccessToken();
  const baseUrl = getPayPalBaseUrl();

  const response = await fetch(`${baseUrl}/v2/checkout/orders/${orderId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get PayPal order ${orderId} (status ${response.status}): ${errorText}`);
  }

  return response.json();
}
