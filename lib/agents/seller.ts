/**
 * Seller Agent (Merchant Representative)
 * Autonomous LLM agent acting on behalf of the merchant under strict floor price and margin policies.
 */

import { GoogleGenAI } from "@google/genai";
import { AgentProposal, MerchantPolicy, PolicyValidationResult } from "../policy/types";
import { PolicyEngine } from "../policy/engine";
import { geminiProposalSchema, proposalZodSchema } from "./schemas";
import { isReplayMode, getRecordedProposal, saveRecordedTurn } from "./replay";
import { auditLedger } from "../audit/ledger";

export interface SellerAgentInput {
  item: {
    id: string;
    title: string;
    description: string;
    listPrice: number;
  };
  merchantPolicy: MerchantPolicy;
  negotiationHistory: Array<{ role: "buyer" | "seller"; proposal: AgentProposal }>;
  currentRound: number;
  maxRounds?: number;
}

export interface AgentTurnResult {
  proposal: AgentProposal;
  validation: PolicyValidationResult;
  fallback: boolean;
  round: number;
}

export async function runSellerAgent(input: SellerAgentInput): Promise<AgentTurnResult> {
  const maxRounds = input.maxRounds || 4;
  const lastBuyerTurn = [...input.negotiationHistory].reverse().find((h) => h.role === "buyer");
  const lastBuyerPrice = lastBuyerTurn?.proposal.price;

  // 1. Check Replay Mode
  if (isReplayMode()) {
    const recorded = getRecordedProposal("seller", input.currentRound);
    if (recorded) {
      const validation = PolicyEngine.validateSellerProposal(recorded, input.merchantPolicy, lastBuyerPrice);
      auditLedger.record("seller_agent", "PROPOSAL_REPLAYED", {
        round: input.currentRound,
        proposal: recorded,
        validation,
      });
      return { proposal: recorded, validation, fallback: false, round: input.currentRound };
    }
  }

  // 2. Prepare LLM Call
  const apiKey = process.env.GEMINI_API_KEY;
  const modelName = process.env.GEMINI_MODEL || "gemini-3.5-flash";

  if (!apiKey) {
    console.warn("[SellerAgent] No GEMINI_API_KEY found. Falling back to deterministic policy.");
    return executeDeterministicFallback(input, lastBuyerPrice, maxRounds, "No API key configured");
  }

  const ai = new GoogleGenAI({ apiKey });

  const systemPrompt = `You are a savvy, strategic Seller Agent representing a small merchant in an online marketplace negotiation.
Your goal is to maximize merchant margins, close deals efficiently, and maintain brand reputation while strictly adhering to merchant policy.

CRITICAL INVARIANTS:
1. FLOOR PRICE: $${input.merchantPolicy.floor_price.toFixed(2)}. NEVER propose, counter, or accept a price below this floor price under any circumstance.
2. LIST PRICE: $${input.merchantPolicy.list_price.toFixed(2)}.
3. BUNDLE DISCOUNTS: ${
    input.merchantPolicy.bundle_rules.length > 0
      ? input.merchantPolicy.bundle_rules.map((r) => `Qty >= ${r.min_quantity} -> Max discount ${r.max_discount_percent}%`).join("; ")
      : "No bundle discounts authorized."
  }
4. FORBIDDEN CLAIMS: Do not promise or mention: ${input.merchantPolicy.forbidden_claims.join(", ")}.
5. CURRENT ROUND: ${input.currentRound} of ${maxRounds}.

Item Details:
- Title: ${input.item.title}
- Description: ${input.item.description}
- List Price: $${input.item.listPrice.toFixed(2)}

History so far:
${input.negotiationHistory
  .map((h, i) => `Turn ${i + 1} (${h.role}): ${h.proposal.action.toUpperCase()} $${h.proposal.price.toFixed(2)} - "${h.proposal.rationale}"`)
  .join("\n")}

Respond to the buyer's move. Make an orderly concession or accept if terms are favorable. Return ONLY structured JSON matching the schema.`;

  // Try LLM call (with 1 retry on policy violation)
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const prompt =
        attempt === 1
          ? `Formulate your round ${input.currentRound} response to the buyer.`
          : `Your previous proposal violated merchant policy. Fix the violation immediately. Price must be at or above floor price $${input.merchantPolicy.floor_price.toFixed(2)}.`;

      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
          responseSchema: geminiProposalSchema,
        },
      });

      if (!response.text) {
        throw new Error("Empty response from Gemini");
      }

      const rawJson = JSON.parse(response.text);
      const parsedProposal = proposalZodSchema.parse(rawJson) as AgentProposal;

      // Policy Engine intercept
      const validation = PolicyEngine.validateSellerProposal(parsedProposal, input.merchantPolicy, lastBuyerPrice);

      if (!validation.valid) {
        console.warn(`[SellerAgent] Attempt ${attempt} policy violation: ${validation.violations.join(", ")}`);
        auditLedger.record("policy_engine", "SELLER_PROPOSAL_REJECTED", {
          round: input.currentRound,
          attempt,
          proposal: parsedProposal,
          violations: validation.violations,
        });

        if (attempt === 1) continue; // Retry once
        return executeDeterministicFallback(input, lastBuyerPrice, maxRounds, validation.violations.join("; "));
      }

      // Valid turn
      auditLedger.record("seller_agent", "PROPOSAL_ACCEPTED_BY_POLICY", {
        round: input.currentRound,
        proposal: parsedProposal,
      });

      saveRecordedTurn("seller", input.currentRound, parsedProposal);
      return { proposal: parsedProposal, validation, fallback: false, round: input.currentRound };
    } catch (err: any) {
      console.error(`[SellerAgent] Error during LLM generation (attempt ${attempt}):`, err.message);
      if (attempt === 2) {
        return executeDeterministicFallback(input, lastBuyerPrice, maxRounds, err.message);
      }
    }
  }

  return executeDeterministicFallback(input, lastBuyerPrice, maxRounds, "Unexpected loop termination");
}

function executeDeterministicFallback(
  input: SellerAgentInput,
  lastBuyerPrice: number | undefined,
  maxRounds: number,
  reason: string
): AgentTurnResult {
  const fallbackProposal = PolicyEngine.generateFallbackSellerProposal(
    input.merchantPolicy,
    lastBuyerPrice,
    input.currentRound,
    maxRounds
  );

  const validation = PolicyEngine.validateSellerProposal(fallbackProposal, input.merchantPolicy, lastBuyerPrice);

  auditLedger.record("seller_agent", "FALLBACK_PROPOSAL_DISPATCHED", {
    round: input.currentRound,
    reason,
    proposal: fallbackProposal,
    fallback: true,
  });

  return { proposal: fallbackProposal, validation, fallback: true, round: input.currentRound };
}
