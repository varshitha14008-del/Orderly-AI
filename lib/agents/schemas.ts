/**
 * Structured Output Schemas for Gemini Agents and Zod Validation
 */

import { z } from "zod";
import { Type } from "@google/genai";

export const proposalZodSchema = z.object({
  action: z.enum(["offer", "counter", "accept", "reject", "ask_human"]),
  price: z.number().positive(),
  quantity: z.number().int().positive().optional(),
  bundle: z.array(z.string()).optional(),
  rationale: z.string().min(5),
});

export const geminiProposalSchema = {
  type: Type.OBJECT,
  properties: {
    action: {
      type: Type.STRING,
      enum: ["offer", "counter", "accept", "reject", "ask_human"],
    },
    price: {
      type: Type.NUMBER,
      description: "Proposed transaction price in USD (must be positive number, e.g. 42.50)",
    },
    quantity: {
      type: Type.INTEGER,
      description: "Number of units requested or offered (default 1)",
    },
    bundle: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Optional list of bundled accessories or items included",
    },
    rationale: {
      type: Type.STRING,
      description: "Concise commercial rationale explaining the strategic reasoning for this offer or counter",
    },
  },
  required: ["action", "price", "rationale"],
};

export const mediatorZodSchema = z.object({
  decision: z.enum(["full_refund", "partial_refund", "contest"]),
  refund_amount: z.number().min(0),
  reasoning: z.string().min(10),
  policy_clauses_cited: z.array(z.string()).min(1),
  recommended_merchant_action: z.string().min(5),
});

export const geminiMediatorSchema = {
  type: Type.OBJECT,
  properties: {
    decision: {
      type: Type.STRING,
      enum: ["full_refund", "partial_refund", "contest"],
      description: "Recommended resolution based on evidence, policies, and negotiation history",
    },
    refund_amount: {
      type: Type.NUMBER,
      description: "Recommended refund amount in USD (0 for contest, partial for damaged, full for not-as-described)",
    },
    reasoning: {
      type: Type.STRING,
      description: "Comprehensive objective justification comparing the incident to agreed terms",
    },
    policy_clauses_cited: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Exact buyer and merchant policy clauses cited as legal basis for the ruling",
    },
    recommended_merchant_action: {
      type: Type.STRING,
      description: "Immediate step the merchant should take (e.g. 'Execute Payments v2 partial refund of $22.50')",
    },
  },
  required: ["decision", "refund_amount", "reasoning", "policy_clauses_cited", "recommended_merchant_action"],
};
