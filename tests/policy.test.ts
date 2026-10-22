/**
 * Unit Tests for Policy Engine (tests/policy.test.ts)
 * Run with: npm run test:policy
 */

import { PolicyEngine } from "../lib/policy/engine";
import { BuyerPolicy, MerchantPolicy, AgentProposal } from "../lib/policy/types";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function runPolicyTests() {
  console.log("=================================================");
  console.log("          POLICY ENGINE UNIT TESTS");
  console.log("=================================================\n");

  const sampleBuyerPolicy: BuyerPolicy = {
    max_price: 60.0,
    auto_accept_below: 40.0,
    ask_human_above: 50.0,
    no_subscriptions: true,
    forbidden_terms: ["crypto", "non-refundable"],
  };

  const sampleMerchantPolicy: MerchantPolicy = {
    list_price: 75.0,
    floor_price: 45.0,
    bundle_rules: [
      { min_quantity: 2, max_discount_percent: 20 },
      { min_quantity: 5, max_discount_percent: 30 },
    ],
    forbidden_claims: ["lifetime warranty", "unlimited free returns"],
    refund_rules: [
      { category: "not_as_described", policy: "full_refund", max_days: 30 },
      { category: "damaged", policy: "partial_refund", partial_refund_percent: 50, max_days: 14 },
      { category: "changed_mind", policy: "contest", max_days: 7 },
    ],
  };

  let passed = 0;
  let failed = 0;

  function testCase(name: string, fn: () => void) {
    try {
      fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`[FAIL] ${name}: ${err.message}`);
      failed++;
    }
  }

  // 1. Buyer: Valid proposal within budget
  testCase("Buyer proposal within max budget succeeds", () => {
    const proposal: AgentProposal = {
      action: "offer",
      price: 45.0,
      rationale: "Reasonable starting offer",
    };
    const res = PolicyEngine.validateBuyerProposal(proposal, sampleBuyerPolicy);
    assert(res.valid === true, "Expected valid proposal");
    assert(res.violations.length === 0, "Expected zero violations");
    assert(res.requiresHumanApproval === false, "45 <= 50, no human approval needed");
  });

  // 2. Buyer: Exceeds max price
  testCase("Buyer proposal exceeding max price fails", () => {
    const proposal: AgentProposal = {
      action: "offer",
      price: 65.0,
      rationale: "High offer",
    };
    const res = PolicyEngine.validateBuyerProposal(proposal, sampleBuyerPolicy);
    assert(res.valid === false, "Expected invalid proposal");
    assert(res.violations.some((v) => v.includes("exceeds buyer max_price")), "Must flag max_price breach");
  });

  // 3. Buyer: Human approval flag above threshold
  testCase("Buyer proposal flags human approval above threshold", () => {
    const proposal: AgentProposal = {
      action: "counter",
      price: 55.0,
      rationale: "Stretching budget",
    };
    const res = PolicyEngine.validateBuyerProposal(proposal, sampleBuyerPolicy);
    assert(res.valid === true, "Valid because 55 <= 60");
    assert(res.requiresHumanApproval === true, "Must require human approval because 55 > 50");
  });

  // 4. Buyer: Forbidden term violation
  testCase("Buyer proposal with forbidden term fails", () => {
    const proposal: AgentProposal = {
      action: "offer",
      price: 45.0,
      rationale: "Can I pay with crypto?",
    };
    const res = PolicyEngine.validateBuyerProposal(proposal, sampleBuyerPolicy);
    assert(res.valid === false, "Expected violation");
    assert(res.violations.some((v) => v.includes("prohibited term")), "Must flag forbidden term");
  });

  // 5. Buyer: Subscription violation
  testCase("Buyer proposal attempting subscription fails", () => {
    const proposal: AgentProposal = {
      action: "offer",
      price: 30.0,
      rationale: "I will sign up for a monthly recurring subscription",
    };
    const res = PolicyEngine.validateBuyerProposal(proposal, sampleBuyerPolicy);
    assert(res.valid === false, "Expected violation");
    assert(res.violations.some((v) => v.includes("subscription commitments")), "Must flag subscription breach");
  });

  // 6. Buyer: Malformed input
  testCase("Buyer proposal with malformed/missing fields fails", () => {
    const malformed: any = { action: "invalid_action", price: -10 };
    const res = PolicyEngine.validateBuyerProposal(malformed, sampleBuyerPolicy);
    assert(res.valid === false, "Expected failure on malformed input");
    assert(res.violations.length >= 2, "Expected multiple errors");
  });

  // 7. Merchant: Valid proposal above floor price
  testCase("Merchant proposal above floor price succeeds", () => {
    const proposal: AgentProposal = {
      action: "counter",
      price: 58.0,
      rationale: "I can offer $58 for this unit",
    };
    const res = PolicyEngine.validateSellerProposal(proposal, sampleMerchantPolicy);
    assert(res.valid === true, "Expected valid proposal");
  });

  // 8. Merchant: Below floor price fails
  testCase("Merchant proposal below floor price fails", () => {
    const proposal: AgentProposal = {
      action: "counter",
      price: 42.0, // Floor is 45
      rationale: "Desperate sale",
    };
    const res = PolicyEngine.validateSellerProposal(proposal, sampleMerchantPolicy);
    assert(res.valid === false, "Expected failure below floor price");
    assert(res.violations.some((v) => v.includes("floor_price limit")), "Must flag floor breach");
  });

  // 9. Merchant: Bundle rule discount violation
  testCase("Merchant bundle discount exceeding limit fails", () => {
    // 2 units at list 75 = 150. Max discount 20% -> min price 120.
    const proposal: AgentProposal = {
      action: "offer",
      price: 100.0, // 33% discount (exceeds 20%)
      quantity: 2,
      rationale: "Take 2 units for $100",
    };
    const res = PolicyEngine.validateSellerProposal(proposal, sampleMerchantPolicy);
    assert(res.valid === false, "Expected bundle violation");
    assert(res.violations.some((v) => v.includes("Bundle rule violation")), "Must flag excessive bundle discount");
  });

  // 10. Merchant: Forbidden claim violation
  testCase("Merchant proposal with forbidden claim fails", () => {
    const proposal: AgentProposal = {
      action: "counter",
      price: 55.0,
      rationale: "Includes our famous lifetime warranty for peace of mind",
    };
    const res = PolicyEngine.validateSellerProposal(proposal, sampleMerchantPolicy);
    assert(res.valid === false, "Expected violation for unapproved warranty claim");
    assert(res.violations.some((v) => v.includes("prohibited claim")), "Must flag forbidden warranty claim");
  });

  // 11. Deterministic Buyer Fallback
  testCase("Buyer fallback generates safe valid proposal", () => {
    const fallback = PolicyEngine.generateFallbackBuyerProposal(sampleBuyerPolicy, 70.0, 1, 4);
    assert(fallback.price <= sampleBuyerPolicy.max_price, "Fallback price must be <= max_price");
    assert(fallback.action === "offer", "Round 1 fallback must be offer");

    // Auto accept check
    const autoAcceptFallback = PolicyEngine.generateFallbackBuyerProposal(sampleBuyerPolicy, 38.0, 2, 4);
    assert(autoAcceptFallback.action === "accept", "Must auto-accept below 40.0");
  });

  // 12. Deterministic Seller Fallback
  testCase("Seller fallback generates safe valid proposal", () => {
    const fallback = PolicyEngine.generateFallbackSellerProposal(sampleMerchantPolicy, 30.0, 1, 4);
    assert(fallback.price >= sampleMerchantPolicy.floor_price, "Fallback price must be >= floor_price");
    assert(fallback.action === "counter", "Must counter");
  });

  console.log("\n=================================================");
  console.log(`TOTAL: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log("=================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runPolicyTests();
