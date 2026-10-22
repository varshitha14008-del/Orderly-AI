/**
 * Core type definitions for Policy Engine and Agent Proposals
 */

export type ProposalAction = "offer" | "counter" | "accept" | "reject" | "ask_human";

export interface AgentProposal {
  action: ProposalAction;
  price: number;
  quantity?: number;
  bundle?: string[];
  rationale: string;
}

export interface BuyerPolicy {
  max_price: number;
  auto_accept_below: number;
  ask_human_above: number;
  no_subscriptions: boolean;
  forbidden_terms?: string[];
  allowed_categories?: string[];
}

export interface BundleRule {
  min_quantity: number;
  max_discount_percent: number; // e.g. 15 for 15% off
}

export interface RefundRule {
  category: "not_as_described" | "damaged" | "changed_mind";
  policy: "full_refund" | "partial_refund" | "contest";
  max_days: number;
  partial_refund_percent?: number;
}

export interface MerchantPolicy {
  list_price: number;
  floor_price: number;
  bundle_rules: BundleRule[];
  forbidden_claims: string[]; // e.g. "lifetime warranty", "unlimited free returns"
  refund_rules: RefundRule[];
}

export interface PolicyValidationResult {
  valid: boolean;
  violations: string[];
  sanitizedProposal?: AgentProposal;
  requiresHumanApproval?: boolean;
}
