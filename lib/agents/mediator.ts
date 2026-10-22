/**
 * Mediator Agent
 * Reads full negotiation transcript, purchase capture, and policies to recommend a binding resolution.
 */

import { GoogleGenAI } from "@google/genai";
import { NegotiationSession } from "../negotiation/engine";
import { geminiMediatorSchema, mediatorZodSchema } from "./schemas";
import { auditLedger } from "../audit/ledger";

export interface DisputeClaimInput {
  session: NegotiationSession;
  category: "not_as_described" | "damaged" | "changed_mind";
  claimNotes: string;
}

export interface MediationRecommendation {
  decision: "full_refund" | "partial_refund" | "contest";
  refund_amount: number;
  reasoning: string;
  policy_clauses_cited: string[];
  recommended_merchant_action: string;
  fallback?: boolean;
}

export async function runMediatorAgent(input: DisputeClaimInput): Promise<MediationRecommendation> {
  const apiKey = process.env.GEMINI_API_KEY;
  const modelName = process.env.GEMINI_MODEL || "gemini-3.5-flash";
  const agreedPrice = input.session.agreedPrice || input.session.product.listPrice;

  // Fallback function
  const fallbackRecommendation = (reason: string): MediationRecommendation => {
    let decision: "full_refund" | "partial_refund" | "contest" = "contest";
    let refundAmount = 0;
    let clauses: string[] = [];

    if (input.category === "not_as_described") {
      decision = "full_refund";
      refundAmount = agreedPrice;
      clauses = [
        "Merchant Policy §4.1: Items significantly not as described qualify for 100% full refund within 30 days.",
      ];
    } else if (input.category === "damaged") {
      decision = "partial_refund";
      refundAmount = Number((agreedPrice * 0.5).toFixed(2));
      clauses = [
        "Merchant Policy §4.2: Goods damaged in transit qualify for 50% partial refund with evidence within 14 days.",
      ];
    } else {
      decision = "contest";
      refundAmount = 0;
      clauses = [
        "Merchant Policy §4.3: Buyer remorse or change-of-mind claims are strictly contested per merchant policy.",
      ];
    }

    const result: MediationRecommendation = {
      decision,
      refund_amount: refundAmount,
      reasoning: `[Deterministic Policy Rule] Category '${input.category}' resolves to ${decision} under standard merchant terms. Reason for fallback: ${reason}`,
      policy_clauses_cited: clauses,
      recommended_merchant_action:
        decision === "contest"
          ? "Contest claim and submit proof of delivery in PayPal resolution center."
          : `Execute Payments v2 refund of $${refundAmount.toFixed(2)} on capture ${input.session.paypalCaptureId || "N/A"}.`,
      fallback: true,
    };

    auditLedger.record("mediator_agent", "FALLBACK_MEDIATION_RECOMMENDED", {
      sessionId: input.session.id,
      category: input.category,
      recommendation: result,
    });

    return result;
  };

  if (!apiKey) {
    return fallbackRecommendation("Missing API key");
  }

  const ai = new GoogleGenAI({ apiKey });

  const systemPrompt = `You are an impartial, senior PayPal Dispute Mediator Agent.
Your duty is to review the full purchase history, negotiation transcript, agreed purchase price, and both parties' policies to deliver an objective dispute resolution recommendation.

EVALUATION RULES:
1. If the item is "not_as_described", merchant policy mandates a FULL REFUND ($${agreedPrice.toFixed(2)}).
2. If the item was "damaged" in transit, merchant policy mandates a 50% PARTIAL REFUND ($${(agreedPrice * 0.5).toFixed(2)}).
3. If the buyer simply "changed_mind", merchant policy permits CONTESTING the claim ($0 refund).

Negotiation Context:
- Item: ${input.session.product.title}
- Agreed Settlement Price: $${agreedPrice.toFixed(2)}
- PayPal Capture ID: ${input.session.paypalCaptureId || "Pending"}
- Buyer Claim Category: ${input.category}
- Buyer Claim Description: "${input.claimNotes}"

Transcript Highlights:
${input.session.turns
  .map((t) => `Round ${t.round} [${t.role.toUpperCase()} - ${t.proposal.action.toUpperCase()}]: $${t.proposal.price.toFixed(2)} - ${t.proposal.rationale}`)
  .join("\n")}

Provide an objective ruling citing specific policy clauses. Return ONLY structured JSON.`;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: `Evaluate the dispute claim for ${input.session.product.title} and recommend refund or contest.`,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: geminiMediatorSchema,
      },
    });

    if (!response.text) throw new Error("Empty response from Gemini");

    const parsed = mediatorZodSchema.parse(JSON.parse(response.text));

    auditLedger.record("mediator_agent", "DISPUTE_MEDIATED", {
      sessionId: input.session.id,
      decision: parsed.decision,
      refundAmount: parsed.refund_amount,
      clauses: parsed.policy_clauses_cited,
    });

    return {
      decision: parsed.decision,
      refund_amount: parsed.refund_amount,
      reasoning: parsed.reasoning,
      policy_clauses_cited: parsed.policy_clauses_cited,
      recommended_merchant_action: parsed.recommended_merchant_action,
      fallback: false,
    };
  } catch (err: any) {
    console.warn("[MediatorAgent] Error calling Gemini, using fallback:", err.message);
    return fallbackRecommendation(err.message);
  }
}
