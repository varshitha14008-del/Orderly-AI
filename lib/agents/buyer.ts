/**
 * Buyer Agent
 * Autonomous LLM agent acting on behalf of the consumer under strict policy bounds.
 */

import { GoogleGenAI } from "@google/genai";
import { AgentProposal, BuyerPolicy, PolicyValidationResult } from "../policy/types";
import { PolicyEngine } from "../policy/engine";
import { geminiProposalSchema, proposalZodSchema } from "./schemas";
import { isReplayMode, getRecordedProposal, saveRecordedTurn } from "./replay";
import { auditLedger } from "../audit/ledger";

export interface BuyerAgentInput {
  item: {
    id: string;
    title: string;
    description: string;
    listPrice: number;
  };
  buyerPolicy: BuyerPolicy;
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

export async function runBuyerAgent(input: BuyerAgentInput): Promise<AgentTurnResult> {
  const maxRounds = input.maxRounds || 4;
  const lastSellerTurn = [...input.negotiationHistory].reverse().find((h) => h.role === "seller");
  const lastSellerPrice = lastSellerTurn?.proposal.price;

  // 1. Check Replay Mode
  if (isReplayMode()) {
    const recorded = getRecordedProposal("buyer", input.currentRound);
    if (recorded) {
      const validation = PolicyEngine.validateBuyerProposal(recorded, input.buyerPolicy, lastSellerPrice);
      auditLedger.record("buyer_agent", "PROPOSAL_REPLAYED", {
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
    console.warn("[BuyerAgent] No GEMINI_API_KEY found. Falling back to deterministic policy.");
    return executeDeterministicFallback(input, lastSellerPrice, maxRounds, "No API key configured");
  }

  const ai = new GoogleGenAI({ apiKey });

  const systemPrompt = `You are an elite, pragmatic Buyer Agent representing a human consumer in a commercial purchase negotiation.
Your goal is to acquire the specified item at the lowest possible price while respecting your client's non-negotiable policy constraints.

CRITICAL INVARIANTS:
1. MAXIMUM PRICE CEILING: $${input.buyerPolicy.max_price.toFixed(2)}. NEVER propose, counter, or accept a price above this under any circumstance.
2. AUTO ACCEPT BELOW: $${input.buyerPolicy.auto_accept_below.toFixed(2)}. If seller offers a price at or below this, your action SHOULD BE 'accept'.
3. ASK HUMAN ABOVE: $${input.buyerPolicy.ask_human_above.toFixed(2)}.
4. NO SUBSCRIPTIONS: ${input.buyerPolicy.no_subscriptions ? "True. Never accept or suggest subscription or recurring charges." : "False."}
5. CURRENT ROUND: ${input.currentRound} of ${maxRounds}. On round ${maxRounds}, you must reach a deal or finalize terms.

Item Details:
- Title: ${input.item.title}
- Description: ${input.item.description}
- List Price: $${input.item.listPrice.toFixed(2)}

History so far:
${
  input.negotiationHistory.length === 0
    ? "No prior turns. This is your initial opening offer."
    : input.negotiationHistory
        .map((h, i) => `Turn ${i + 1} (${h.role}): ${h.proposal.action.toUpperCase()} $${h.proposal.price.toFixed(2)} - "${h.proposal.rationale}"`)
        .join("\n")
}

Make your move. Return ONLY structured JSON matching the schema.`;

  // Try LLM call (with 1 retry on policy violation)
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const prompt =
        attempt === 1
          ? `Formulate your round ${input.currentRound} proposal.`
          : `Your previous proposal violated client policy. Fix the violation immediately. Stay within maximum ceiling $${input.buyerPolicy.max_price.toFixed(2)}.`;

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
      const validation = PolicyEngine.validateBuyerProposal(parsedProposal, input.buyerPolicy, lastSellerPrice);

      if (!validation.valid) {
        console.warn(`[BuyerAgent] Attempt ${attempt} policy violation: ${validation.violations.join(", ")}`);
        auditLedger.record("policy_engine", "BUYER_PROPOSAL_REJECTED", {
          round: input.currentRound,
          attempt,
          proposal: parsedProposal,
          violations: validation.violations,
        });

        if (attempt === 1) continue; // Retry once with correction prompt
        return executeDeterministicFallback(input, lastSellerPrice, maxRounds, validation.violations.join("; "));
      }

      // Valid turn
      auditLedger.record("buyer_agent", "PROPOSAL_ACCEPTED_BY_POLICY", {
        round: input.currentRound,
        proposal: parsedProposal,
        requiresHumanApproval: validation.requiresHumanApproval,
      });

      saveRecordedTurn("buyer", input.currentRound, parsedProposal);
      return { proposal: parsedProposal, validation, fallback: false, round: input.currentRound };
    } catch (err: any) {
      console.error(`[BuyerAgent] Error during LLM generation (attempt ${attempt}):`, err.message);
      if (attempt === 2) {
        return executeDeterministicFallback(input, lastSellerPrice, maxRounds, err.message);
      }
    }
  }

  return executeDeterministicFallback(input, lastSellerPrice, maxRounds, "Unexpected loop termination");
}

function executeDeterministicFallback(
  input: BuyerAgentInput,
  lastSellerPrice: number | undefined,
  maxRounds: number,
  reason: string
): AgentTurnResult {
  const fallbackProposal = PolicyEngine.generateFallbackBuyerProposal(
    input.buyerPolicy,
    lastSellerPrice,
    input.currentRound,
    maxRounds
  );

  const validation = PolicyEngine.validateBuyerProposal(fallbackProposal, input.buyerPolicy, lastSellerPrice);

  auditLedger.record("buyer_agent", "FALLBACK_PROPOSAL_DISPATCHED", {
    round: input.currentRound,
    reason,
    proposal: fallbackProposal,
    fallback: true,
  });

  return { proposal: fallbackProposal, validation, fallback: true, round: input.currentRound };
}
