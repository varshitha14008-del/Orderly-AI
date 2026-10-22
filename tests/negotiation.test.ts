/**
 * End-to-End Negotiation & Agent Integration Test
 * Run with: npx tsx tests/negotiation.test.ts
 */

import fs from "fs";
import path from "path";

// Load .env.local
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const idx = trimmed.indexOf("=");
      if (idx !== -1) {
        const key = trimmed.substring(0, idx).trim();
        const val = trimmed.substring(idx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

import { NegotiationManager } from "../lib/negotiation/engine";
import { auditLedger } from "../lib/audit/ledger";

async function runNegotiationIntegrationTest() {
  console.log("=================================================");
  console.log("   ORDERLY-AI: LIVE AGENT NEGOTIATION TEST");
  console.log("=================================================\n");

  // 1. Create a session for Keyboard
  console.log("1. Initializing Negotiation Session for 'Ergonomic Mechanical Keyboard'...");
  const session = NegotiationManager.createSession("prod-kb-01", {
    max_price: 60.0,
    auto_accept_below: 40.0,
    ask_human_above: 50.0,
  });

  console.log(`   Session ID: ${session.id}`);
  console.log(`   Item: ${session.product.title} (List: $${session.product.listPrice}, Floor: $${session.merchantPolicy.floor_price})`);
  console.log(`   Buyer Ceiling: $${session.buyerPolicy.max_price}`);

  // 2. Step through turns
  let stepCount = 0;
  while (session.status === "INITIAL" || session.status === "IN_PROGRESS") {
    stepCount++;
    console.log(`\n--- Step ${stepCount} (Round ${session.currentRound}) ---`);
    await NegotiationManager.step(session.id);

    const latestTurn = session.turns[session.turns.length - 1];
    console.log(`   ${latestTurn.role.toUpperCase()} Turn: [${latestTurn.proposal.action.toUpperCase()}] $${latestTurn.proposal.price.toFixed(2)}`);
    console.log(`   Rationale: "${latestTurn.proposal.rationale}"`);
    console.log(`   Fallback used: ${latestTurn.fallback}`);
    console.log(`   Status: ${session.status}`);

    if (stepCount > 10) break; // Safety fuse
  }

  console.log("\n=================================================");
  console.log("             NEGOTIATION OUTCOME");
  console.log("=================================================");
  console.log(`Status: ${session.status}`);
  console.log(`Agreed Price: ${session.agreedPrice ? `$${session.agreedPrice.toFixed(2)}` : "None"}`);
  console.log(`Total Turns Executed: ${session.turns.length}`);

  // Invariant assertions
  if (session.status === "AGREED" || session.status === "AWAITING_HUMAN_APPROVAL") {
    if (session.agreedPrice! > session.buyerPolicy.max_price) {
      throw new Error(`CRITICAL INVARIANT VIOLATION: Agreed price $${session.agreedPrice} exceeds buyer ceiling $${session.buyerPolicy.max_price}`);
    }
    if (session.agreedPrice! < session.merchantPolicy.floor_price) {
      throw new Error(`CRITICAL INVARIANT VIOLATION: Agreed price $${session.agreedPrice} is below merchant floor $${session.merchantPolicy.floor_price}`);
    }
    console.log(`[PASS] Invariant Verified: Floor ($${session.merchantPolicy.floor_price}) <= Agreed ($${session.agreedPrice}) <= Ceiling ($${session.buyerPolicy.max_price})`);
  }

  // 3. Verify Hash-Chained Audit Ledger
  console.log("\n3. Verifying Hash-Chained Audit Ledger...");
  const entries = auditLedger.getEntries();
  console.log(`   Total Audit Entries: ${entries.length}`);

  const integrity = auditLedger.verifyIntegrity();
  console.log(`   Cryptographic Integrity Verified: ${integrity.valid}`);

  if (!integrity.valid) {
    throw new Error(`Audit ledger corruption: ${integrity.error}`);
  }

  console.log("\n[PASS] All Milestone 2 Integration Checks Passed!\n");
}

runNegotiationIntegrationTest().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
