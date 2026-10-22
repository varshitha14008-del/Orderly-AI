/**
 * Unit Tests for Hash-Chained Audit Ledger (tests/audit.test.ts)
 * Run with: npm run test:audit
 */

import { auditLedger, computeEntryHash, AuditEntry } from "../lib/audit/ledger";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function runAuditTests() {
  console.log("=================================================");
  console.log("      HASH-CHAINED AUDIT LEDGER UNIT TESTS");
  console.log("=================================================\n");

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

  // 1. Genesis block
  testCase("Ledger initializes with valid genesis block", () => {
    auditLedger.reset();
    const entries = auditLedger.getEntries();
    assert(entries.length === 1, "Should have 1 entry");
    assert(entries[0].type === "GENESIS_BLOCK", "First block is GENESIS");
    const check = auditLedger.verifyIntegrity();
    assert(check.valid === true, "Genesis chain must be valid");
  });

  // 2. Sequential recording
  testCase("Appends sequential events with unbroken hash chaining", () => {
    auditLedger.reset();
    auditLedger.record("buyer_agent", "PROPOSAL_CREATED", { price: 38.0, action: "offer" });
    auditLedger.record("policy_engine", "PROPOSAL_VALIDATED", { valid: true });
    auditLedger.record("seller_agent", "COUNTER_OFFER", { price: 52.0, action: "counter" });
    auditLedger.record("policy_engine", "PROPOSAL_VALIDATED", { valid: true });
    auditLedger.record("human_buyer", "PAYPAL_CHECKOUT_APPROVED", { order_id: "49A309481M497412U" });

    const entries = auditLedger.getEntries();
    assert(entries.length === 6, "Expected 6 entries (1 genesis + 5 events)");

    const check = auditLedger.verifyIntegrity();
    assert(check.valid === true, "Chain of 6 entries must be cryptographically valid");
  });

  // 3. Tamper detection on payload
  testCase("Detects payload modification tampering", () => {
    auditLedger.reset();
    auditLedger.record("buyer_agent", "PROPOSAL", { price: 40.0 });
    auditLedger.record("seller_agent", "PROPOSAL", { price: 50.0 });

    const entries = auditLedger.getEntries();
    // Simulate an attacker modifying price in entry #2
    entries[1].payload.price = 999.0;

    const check = auditLedger.verifyIntegrity(entries);
    assert(check.valid === false, "Must detect modified payload");
    assert(check.brokenIndex === 1, "Must pinpoint tampered index #1");
    assert(check.error?.includes("Tamper detected"), "Must report tamper detected");
  });

  // 4. Tamper detection on broken linkage
  testCase("Detects broken prev_hash linkage", () => {
    auditLedger.reset();
    auditLedger.record("buyer_agent", "PROPOSAL", { price: 40.0 });
    auditLedger.record("seller_agent", "PROPOSAL", { price: 50.0 });

    const entries = auditLedger.getEntries();
    // Simulate an attacker altering prev_hash
    entries[2].prev_hash = "deadbeef1234567890abcdefdeadbeef1234567890abcdefdeadbeef12345678";

    const check = auditLedger.verifyIntegrity(entries);
    assert(check.valid === false, "Must detect broken linkage");
    assert(check.brokenIndex === 2, "Must pinpoint index #2");
  });

  console.log("\n=================================================");
  console.log(`TOTAL: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log("=================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runAuditTests();
