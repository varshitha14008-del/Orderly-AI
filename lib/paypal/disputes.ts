import { getPayPalAccessToken, getPayPalBaseUrl } from "./auth";

export interface CreateDisputeParams {
  transactionId: string;
  reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED" | "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED" | "UNAUTHORISED";
  disputeAmount: number;
  currency?: string;
  buyerNotes?: string;
}

export interface DisputeSummary {
  dispute_id: string;
  create_time: string;
  update_time?: string;
  status: "UNDER_REVIEW" | "WAITING_FOR_BUYER_RESPONSE" | "WAITING_FOR_SELLER_RESPONSE" | "RESOLVED" | "OPEN";
  dispute_amount: {
    value: string;
    currency_code: string;
  };
  reason: string;
  dispute_life_cycle_stage?: string;
  disputed_transactions?: Array<{
    buyer_transaction_id?: string;
    seller_transaction_id?: string;
    gross_amount?: { value: string; currency_code: string };
  }>;
}

/**
 * Attempts sandbox dispute creation as buyer via PayPal Disputes v1 API
 * Endpoint: POST /v1/customer/disputes
 */
export async function createSandboxDispute(params: CreateDisputeParams): Promise<DisputeSummary> {
  const token = await getPayPalAccessToken();
  const baseUrl = getPayPalBaseUrl();

  const payload = {
    disputed_transactions: [
      {
        buyer_transaction_id: params.transactionId,
      },
    ],
    reason: params.reason,
    dispute_channel: "API",
    dispute_amount: {
      currency_code: params.currency || "USD",
      value: params.disputeAmount.toFixed(2),
    },
    messages: params.buyerNotes
      ? [
          {
            posted_by: "BUYER",
            content: params.buyerNotes,
          },
        ]
      : undefined,
  };

  const response = await fetch(`${baseUrl}/v1/customer/disputes`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create sandbox dispute (status ${response.status}): ${errorText}`);
  }

  return response.json();
}

/**
 * Retrieves details for a specific PayPal dispute
 * Endpoint: GET /v1/customer/disputes/{id}
 */
export async function getDispute(disputeId: string): Promise<DisputeSummary> {
  const token = await getPayPalAccessToken();
  const baseUrl = getPayPalBaseUrl();

  const response = await fetch(`${baseUrl}/v1/customer/disputes/${disputeId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch dispute ${disputeId} (status ${response.status}): ${errorText}`);
  }

  return response.json();
}

/**
 * Lists disputes from the merchant perspective
 * Endpoint: GET /v1/customer/disputes
 */
export async function listDisputes(): Promise<{ items: DisputeSummary[] }> {
  const token = await getPayPalAccessToken();
  const baseUrl = getPayPalBaseUrl();

  const response = await fetch(`${baseUrl}/v1/customer/disputes`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to list disputes (status ${response.status}): ${errorText}`);
  }

  return response.json();
}

/**
 * Accepts a dispute claim (merchant concedes to buyer)
 * Endpoint: POST /v1/customer/disputes/{id}/accept-claim
 */
export async function acceptClaim(
  disputeId: string,
  note = "Merchant accepts claim and approves refund"
): Promise<any> {
  const token = await getPayPalAccessToken();
  const baseUrl = getPayPalBaseUrl();

  const response = await fetch(`${baseUrl}/v1/customer/disputes/${disputeId}/accept-claim`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      note,
      accept_claim_type: "REFUND",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to accept dispute claim ${disputeId} (status ${response.status}): ${errorText}`);
  }

  return response.json().catch(() => ({ status: "CLAIM_ACCEPTED" }));
}

/**
 * Simulated Dispute Source (as permitted in AGENTS.md §3.4 when sandbox auth assertions restrict buyer dispute filing)
 * Clearly labeled in logs and UI as [Simulated Dispute Source], while real settlement & refund flows execute via PayPal Payments v2.
 */
export function createSimulatedDispute(
  captureId: string,
  amount: number,
  reason: string,
  buyerClaim: string
): DisputeSummary & { simulated: true } {
  const disputeId = `DSP-SIM-${Date.now().toString(36).toUpperCase()}`;
  return {
    simulated: true,
    dispute_id: disputeId,
    create_time: new Date().toISOString(),
    status: "WAITING_FOR_SELLER_RESPONSE",
    dispute_amount: {
      value: amount.toFixed(2),
      currency_code: "USD",
    },
    reason,
    disputed_transactions: [
      {
        seller_transaction_id: captureId,
        gross_amount: { value: amount.toFixed(2), currency_code: "USD" },
      },
    ],
  };
}
