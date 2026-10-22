/**
 * Orderly-AI Pure TypeScript Policy Engine
 * Deterministic pre-execution guardrails before any agent proposal reaches opponent or PayPal.
 */

import {
  AgentProposal,
  BuyerPolicy,
  MerchantPolicy,
  PolicyValidationResult,
} from "./types";

export class PolicyEngine {
  /**
   * Validates a buyer agent's proposal against buyer policy and negotiation constraints.
   */
  static validateBuyerProposal(
    proposal: AgentProposal,
    policy: BuyerPolicy,
    lastSellerPrice?: number
  ): PolicyValidationResult {
    const violations: string[] = [];

    // 1. Structure validation
    if (!proposal || typeof proposal !== "object") {
      return { valid: false, violations: ["Malformed proposal: expected object"] };
    }

    if (!proposal.action || !["offer", "counter", "accept", "reject", "ask_human"].includes(proposal.action)) {
      violations.push(`Invalid action: '${proposal.action}'`);
    }

    if (typeof proposal.price !== "number" || isNaN(proposal.price) || proposal.price <= 0) {
      violations.push(`Invalid price: '${proposal.price}'. Must be a positive number.`);
    }

    // 2. Max Price Bound
    if (proposal.price > policy.max_price) {
      violations.push(
        `Price violation: Proposed $${proposal.price.toFixed(2)} exceeds buyer max_price limit of $${policy.max_price.toFixed(2)}`
      );
    }

    // 3. Subscription Bound
    if (policy.no_subscriptions) {
      const lowerRationale = (proposal.rationale || "").toLowerCase();
      if (
        lowerRationale.includes("subscription") ||
        lowerRationale.includes("recurring") ||
        lowerRationale.includes("per month") ||
        lowerRationale.includes("monthly")
      ) {
        violations.push("Policy violation: Buyer policy strictly forbids recurring subscription commitments");
      }
    }

    // 4. Forbidden Terms
    if (policy.forbidden_terms && policy.forbidden_terms.length > 0) {
      const lowerRationale = (proposal.rationale || "").toLowerCase();
      for (const term of policy.forbidden_terms) {
        if (lowerRationale.includes(term.toLowerCase())) {
          violations.push(`Policy violation: Proposal mentions prohibited term '${term}'`);
        }
      }
    }

    // 5. Human approval threshold
    const requiresHuman = proposal.price > policy.ask_human_above;

    return {
      valid: violations.length === 0,
      violations,
      requiresHumanApproval: requiresHuman,
      sanitizedProposal: violations.length === 0 ? proposal : undefined,
    };
  }

  /**
   * Validates a seller/merchant agent's proposal against merchant policy.
   */
  static validateSellerProposal(
    proposal: AgentProposal,
    policy: MerchantPolicy,
    lastBuyerPrice?: number
  ): PolicyValidationResult {
    const violations: string[] = [];

    // 1. Structure validation
    if (!proposal || typeof proposal !== "object") {
      return { valid: false, violations: ["Malformed proposal: expected object"] };
    }

    if (!proposal.action || !["offer", "counter", "accept", "reject", "ask_human"].includes(proposal.action)) {
      violations.push(`Invalid action: '${proposal.action}'`);
    }

    if (typeof proposal.price !== "number" || isNaN(proposal.price) || proposal.price <= 0) {
      violations.push(`Invalid price: '${proposal.price}'. Must be a positive number.`);
    }

    // 2. Floor Price Bound
    if (proposal.price < policy.floor_price) {
      violations.push(
        `Margin violation: Proposed $${proposal.price.toFixed(2)} is below merchant floor_price limit of $${policy.floor_price.toFixed(2)}`
      );
    }

    // 3. Bundle Discount Validation
    const quantity = proposal.quantity || 1;
    if (quantity > 1 && policy.bundle_rules && policy.bundle_rules.length > 0) {
      // Find matching bundle rule
      const applicableRule = policy.bundle_rules
        .filter((r) => quantity >= r.min_quantity)
        .sort((a, b) => b.min_quantity - a.min_quantity)[0];

      if (applicableRule) {
        const fullPrice = policy.list_price * quantity;
        const discountAmount = fullPrice - proposal.price;
        const discountPercent = (discountAmount / fullPrice) * 100;

        if (discountPercent > applicableRule.max_discount_percent + 0.01) {
          violations.push(
            `Bundle rule violation: Discount of ${discountPercent.toFixed(1)}% exceeds maximum allowed ${applicableRule.max_discount_percent}% for quantity ${quantity}`
          );
        }
      }
    }

    // 4. Forbidden Claims / Warranty Promises
    if (policy.forbidden_claims && policy.forbidden_claims.length > 0) {
      const lowerRationale = (proposal.rationale || "").toLowerCase();
      for (const claim of policy.forbidden_claims) {
        if (lowerRationale.includes(claim.toLowerCase())) {
          violations.push(`Policy violation: Merchant agent made prohibited claim '${claim}'`);
        }
      }
    }

    return {
      valid: violations.length === 0,
      violations,
      sanitizedProposal: violations.length === 0 ? proposal : undefined,
    };
  }

  /**
   * Deterministic Fallback Strategy for Buyer Agent
   * Guarantees safety when LLM fails, times out, or violates policy.
   */
  static generateFallbackBuyerProposal(
    policy: BuyerPolicy,
    lastSellerPrice: number | undefined,
    round: number,
    maxRounds = 4
  ): AgentProposal {
    // If seller's price is already below buyer's auto-accept or max price, accept
    if (lastSellerPrice !== undefined) {
      if (lastSellerPrice <= policy.auto_accept_below) {
        return {
          action: "accept",
          price: lastSellerPrice,
          rationale: `[Deterministic Fallback] Seller offer $${lastSellerPrice.toFixed(2)} is at or below auto-accept threshold $${policy.auto_accept_below.toFixed(2)}.`,
        };
      }
      if (round >= maxRounds && lastSellerPrice <= policy.max_price) {
        return {
          action: "accept",
          price: lastSellerPrice,
          rationale: `[Deterministic Fallback] Final round reach; seller offer $${lastSellerPrice.toFixed(2)} is within max budget $${policy.max_price.toFixed(2)}.`,
        };
      }
    }

    // Calculate stepped counter offer based on round progression
    const minOffer = policy.auto_accept_below * 0.85;
    const ceiling = policy.max_price;
    const progress = Math.min(1, round / maxRounds);

    let targetPrice = minOffer + (ceiling - minOffer) * progress * 0.75;
    if (lastSellerPrice && targetPrice >= lastSellerPrice) {
      targetPrice = Math.min(policy.max_price, lastSellerPrice);
    }
    targetPrice = Math.min(policy.max_price, Number(targetPrice.toFixed(2)));

    const action = round === 1 ? "offer" : "counter";
    return {
      action,
      price: targetPrice,
      rationale: `[Deterministic Fallback] Progressing round ${round}/${maxRounds} offer to $${targetPrice.toFixed(2)} bounded by max price $${policy.max_price.toFixed(2)}.`,
    };
  }

  /**
   * Deterministic Fallback Strategy for Merchant/Seller Agent
   * Guarantees floor price enforcement and orderly concessions.
   */
  static generateFallbackSellerProposal(
    policy: MerchantPolicy,
    lastBuyerPrice: number | undefined,
    round: number,
    maxRounds = 4
  ): AgentProposal {
    // If buyer price meets or exceeds list price or floor price on late round, accept
    if (lastBuyerPrice !== undefined) {
      if (lastBuyerPrice >= policy.list_price) {
        return {
          action: "accept",
          price: lastBuyerPrice,
          rationale: `[Deterministic Fallback] Buyer offered $${lastBuyerPrice.toFixed(2)}, which meets list price.`,
        };
      }
      if (round >= maxRounds && lastBuyerPrice >= policy.floor_price) {
        return {
          action: "accept",
          price: lastBuyerPrice,
          rationale: `[Deterministic Fallback] Final round reached; buyer offer $${lastBuyerPrice.toFixed(2)} meets floor price $${policy.floor_price.toFixed(2)}.`,
        };
      }
    }

    // Concede in steps from list_price down toward floor_price
    const concessionStep = (policy.list_price - policy.floor_price) / maxRounds;
    let targetPrice = policy.list_price - concessionStep * (round - 1);
    targetPrice = Math.max(policy.floor_price, Number(targetPrice.toFixed(2)));

    if (lastBuyerPrice && targetPrice <= lastBuyerPrice) {
      targetPrice = Math.max(policy.floor_price, lastBuyerPrice);
      return {
        action: "accept",
        price: targetPrice,
        rationale: `[Deterministic Fallback] Concession meets buyer offer at $${targetPrice.toFixed(2)}.`,
      };
    }

    return {
      action: "counter",
      price: targetPrice,
      rationale: `[Deterministic Fallback] Seller round ${round}/${maxRounds} counter-offer of $${targetPrice.toFixed(2)} respecting floor price $${policy.floor_price.toFixed(2)}.`,
    };
  }
}
