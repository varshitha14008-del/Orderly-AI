/**
 * Unit Tests for Version-Controlled Session Restoration
 * (tests/session-restore.test.ts)
 */

import {
  NegotiationManager,
  validateSessionSnapshot,
  isAllowedStateTransition,
  NegotiationSession,
} from "../lib/negotiation/engine";
import { DEFAULT_BUYER_POLICY, DEFAULT_MERCHANT_POLICY } from "../lib/negotiation/catalog";

function assert(condition: any, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runSessionRestoreTests() {
  console.log("=================================================");
  console.log("   VERSION-CONTROLLED SESSION RESTORE TESTS");
  console.log("=================================================\n");

  let passed = 0;
  let failed = 0;

  async function testCase(name: string, fn: () => void | Promise<void>) {
    try {
      await fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`[FAIL] ${name}: ${err.message}`);
      failed++;
    }
  }

  // 1. Snapshot validation rejects malformed objects
  await testCase("validateSessionSnapshot rejects missing or malformed fields", () => {
    // Missing ID
    try {
      validateSessionSnapshot({} as any);
      assert(false, "Should have thrown for missing id");
    } catch (e: any) {
      assert(e.message.includes("missing or invalid session ID"), "Expected session ID error");
    }

    // Invalid product
    try {
      validateSessionSnapshot({ id: "neg_test_1" } as any);
      assert(false, "Should have thrown for missing product");
    } catch (e: any) {
      assert(e.message.includes("missing or invalid product"), "Expected product error");
    }

    // Invalid status
    try {
      validateSessionSnapshot({
        id: "neg_test_1",
        product: { id: "p1", title: "Item", listPrice: 50 },
        buyerPolicy: { max_price: 60 },
        merchantPolicy: { floor_price: 30 },
        currentRound: 1,
        maxRounds: 4,
        status: "INVALID_STATUS",
        turns: [],
      } as any);
      assert(false, "Should have thrown for unknown status");
    } catch (e: any) {
      assert(e.message.includes("unknown status"), "Expected status error");
    }
  });

  // 2. Allowed state transitions
  await testCase("isAllowedStateTransition enforces forward progression and terminal state protection", () => {
    // Identity transitions
    assert(isAllowedStateTransition("INITIAL", "INITIAL") === true, "INITIAL -> INITIAL allowed");
    assert(isAllowedStateTransition("COMPLETED", "COMPLETED") === true, "COMPLETED -> COMPLETED allowed");
    assert(isAllowedStateTransition("REJECTED", "REJECTED") === true, "REJECTED -> REJECTED allowed");

    // Forward transitions
    assert(isAllowedStateTransition("INITIAL", "IN_PROGRESS") === true, "INITIAL -> IN_PROGRESS allowed");
    assert(isAllowedStateTransition("IN_PROGRESS", "AGREED") === true, "IN_PROGRESS -> AGREED allowed");
    assert(isAllowedStateTransition("AGREED", "COMPLETED") === true, "AGREED -> COMPLETED allowed");

    // Terminal violations: cannot revert COMPLETED
    assert(isAllowedStateTransition("COMPLETED", "INITIAL") === false, "COMPLETED -> INITIAL forbidden");
    assert(isAllowedStateTransition("COMPLETED", "IN_PROGRESS") === false, "COMPLETED -> IN_PROGRESS forbidden");
    assert(isAllowedStateTransition("COMPLETED", "AGREED") === false, "COMPLETED -> AGREED forbidden");

    // Terminal violations: cannot revert REJECTED
    assert(isAllowedStateTransition("REJECTED", "INITIAL") === false, "REJECTED -> INITIAL forbidden");
    assert(isAllowedStateTransition("REJECTED", "IN_PROGRESS") === false, "REJECTED -> IN_PROGRESS forbidden");
  });

  // 3. Monotonic version increment on session mutations
  await testCase("Mutations monotonically increment session version", async () => {
    NegotiationManager.resetAll();

    // Creation initializes version 1
    const session = NegotiationManager.createSession("prod-kb-01");
    assert(session.version === 1, `createSession must set version 1, got ${session.version}`);

    // Turn step increments version to 2
    await NegotiationManager.step(session.id);
    const stepped = NegotiationManager.getSession(session.id)!;
    assert(stepped.version === 2, `step must increment version to 2, got ${stepped.version}`);

    // PayPal order attachment increments version to 3
    NegotiationManager.attachPayPalOrder(session.id, "ORDER_TEST_123");
    const ordered = NegotiationManager.getSession(session.id)!;
    assert(ordered.version === 3, `attachPayPalOrder must increment version to 3, got ${ordered.version}`);

    // PayPal capture attachment increments version to 4
    NegotiationManager.attachPayPalCapture(session.id, "CAPTURE_TEST_456", "COMPLETED");
    const captured = NegotiationManager.getSession(session.id)!;
    assert(captured.version === 4, `attachPayPalCapture must increment version to 4, got ${captured.version}`);
    assert(captured.status === "COMPLETED", "Session must be marked COMPLETED");
  });

  // 4. Clean restoration into cold container
  await testCase("restoreSession successfully restores valid snapshot into empty store", () => {
    NegotiationManager.resetAll();

    const snapshot: NegotiationSession = {
      id: "neg_restored_1",
      product: {
        id: "prod-kb-01",
        title: "Mechanical Keyboard",
        description: "Test keyboard",
        category: "Electronics",
        listPrice: 75.0,
        floorPrice: 45.0,
      },
      buyerPolicy: { ...DEFAULT_BUYER_POLICY, max_price: 60.0 },
      merchantPolicy: { ...DEFAULT_MERCHANT_POLICY, list_price: 75.0, floor_price: 45.0 },
      currentRound: 2,
      maxRounds: 4,
      status: "IN_PROGRESS",
      turns: [
        {
          turnId: 1,
          round: 1,
          role: "buyer",
          proposal: { action: "offer", price: 40.0, rationale: "Opening offer" },
          fallback: false,
          timestamp: new Date().toISOString(),
        },
      ],
      agreedPrice: null,
      paypalOrderId: null,
      paypalCaptureId: null,
      paypalCaptureStatus: null,
      version: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const restored = NegotiationManager.restoreSession(snapshot);
    assert(restored.id === "neg_restored_1", "Restored session ID must match");
    assert(restored.version === 2, "Restored version must match");
    assert(restored.turns.length === 1, "Restored turns must match");

    const fetched = NegotiationManager.getSession("neg_restored_1");
    assert(Boolean(fetched), "Session must now exist in sessionsMap");
    assert(fetched?.id === "neg_restored_1", "Fetched session matches");
  });

  // 5. Stale snapshot rejection
  await testCase("restoreSession strictly rejects stale snapshot with older version", () => {
    NegotiationManager.resetAll();

    // Initialize session at version 1 and update to version 3
    const session = NegotiationManager.createSession("prod-kb-01");
    session.version = 3;
    session.turns.push(
      { turnId: 1, round: 1, role: "buyer", proposal: { action: "offer", price: 40, rationale: "Offer" }, fallback: false, timestamp: "" },
      { turnId: 2, round: 1, role: "seller", proposal: { action: "counter", price: 50, rationale: "Counter" }, fallback: false, timestamp: "" }
    );

    // Stale snapshot with version 2
    const staleSnapshot: NegotiationSession = {
      ...session,
      version: 2,
      turns: [session.turns[0]], // only turn 1
    };

    try {
      NegotiationManager.restoreSession(staleSnapshot);
      assert(false, "Should have thrown for stale snapshot version");
    } catch (e: any) {
      assert(e.message.includes("Stale session snapshot rejected"), `Expected stale error, got ${e.message}`);
    }

    // Verify existing session in memory was NOT mutated or overwritten
    const memorySession = NegotiationManager.getSession(session.id)!;
    assert(memorySession.version === 3, `Memory session must preserve version 3, got ${memorySession.version}`);
    assert(memorySession.turns.length === 2, `Memory session must preserve 2 turns, got ${memorySession.turns.length}`);
  });

  // 6. Terminal state rollback protection
  await testCase("restoreSession strictly forbids reverting a COMPLETED session", () => {
    NegotiationManager.resetAll();

    const session = NegotiationManager.createSession("prod-kb-01");
    session.version = 4;
    session.status = "COMPLETED";
    session.paypalCaptureId = "CAP_PAID_123";
    session.paypalCaptureStatus = "COMPLETED";

    // Fabricated snapshot claiming higher version but rolling back to IN_PROGRESS
    const invalidTransitionSnapshot: NegotiationSession = {
      ...session,
      version: 5,
      status: "IN_PROGRESS",
    };

    try {
      NegotiationManager.restoreSession(invalidTransitionSnapshot);
      assert(false, "Should have rejected reverting COMPLETED session");
    } catch (e: any) {
      assert(e.message.includes("Illegal state transition"), `Expected transition error, got ${e.message}`);
    }

    const memorySession = NegotiationManager.getSession(session.id)!;
    assert(memorySession.status === "COMPLETED", "Session must remain COMPLETED");
  });

  // 7. Backward compatibility for legacy snapshots without version field
  await testCase("restoreSession safely backfills version on legacy snapshots", () => {
    NegotiationManager.resetAll();

    const legacySnapshot: any = {
      id: "neg_legacy_99",
      product: { id: "prod-kb-01", title: "Item", listPrice: 75.0, floorPrice: 45.0 },
      buyerPolicy: { max_price: 60.0 },
      merchantPolicy: { list_price: 75.0, floor_price: 45.0 },
      currentRound: 2,
      maxRounds: 4,
      status: "IN_PROGRESS",
      turns: [
        { turnId: 1, round: 1, role: "buyer", proposal: { action: "offer", price: 40 }, fallback: false, timestamp: "" },
        { turnId: 2, round: 1, role: "seller", proposal: { action: "counter", price: 55 }, fallback: false, timestamp: "" },
      ],
      agreedPrice: null,
      paypalOrderId: null,
      paypalCaptureId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      // Note: version property is omitted entirely
    };

    const restored = NegotiationManager.restoreSession(legacySnapshot);
    // 2 turns -> backfilled version = turns.length + 1 = 3
    assert(restored.version === 3, `Expected backfilled version 3, got ${restored.version}`);
  });

  // 8. Equal-version snapshot preservation
  await testCase("restoreSession preserves existing session when incoming snapshot has equal version even with more turns", () => {
    NegotiationManager.resetAll();

    const session = NegotiationManager.createSession("prod-kb-01");
    session.version = 3;
    session.turns = [
      { turnId: 1, round: 1, role: "buyer", proposal: { action: "offer", price: 40, rationale: "Offer" }, fallback: false, timestamp: "" },
    ];
    session.paypalOrderId = "ORDER-AUTH-ORIGINAL";

    // Incoming snapshot has the SAME version (3) but claims to have 2 turns and a different order ID
    const equalVersionSnapshot: NegotiationSession = {
      ...session,
      version: 3,
      turns: [
        session.turns[0],
        { turnId: 2, round: 1, role: "seller", proposal: { action: "counter", price: 50, rationale: "Counter" }, fallback: false, timestamp: "" },
      ],
      paypalOrderId: "ORDER-OVERWRITE-ATTEMPT",
    };

    const result = NegotiationManager.restoreSession(equalVersionSnapshot);

    // Must return the existing in-memory session and NOT overwrite
    assert(result.paypalOrderId === "ORDER-AUTH-ORIGINAL", "Must preserve existing session's paypalOrderId");
    assert(result.turns.length === 1, "Must not adopt more turns from equal-version snapshot");

    const inMemory = NegotiationManager.getSession(session.id)!;
    assert(inMemory.paypalOrderId === "ORDER-AUTH-ORIGINAL", "In-memory session must remain untouched");
    assert(inMemory.turns.length === 1, "In-memory turns count must remain 1");
  });

  // 9. Demo seed atomic version increment
  await testCase("Demo seed endpoint produces a session with version 2 and updated timestamp", async () => {
    NegotiationManager.resetAll();

    const { POST: seedRoute } = await import("../app/api/demo/seed/route");
    const response = await seedRoute();
    const data = await response.json();

    assert(data.success === true, "Demo seed must succeed");
    assert(data.session.version === 2, `Expected demo session version 2, got ${data.session.version}`);
    assert(data.session.status === "COMPLETED", "Demo session status must be COMPLETED");
    assert(data.session.turns.length === 4, "Demo session must have 4 turns");
    assert(Boolean(data.session.updatedAt), "updatedAt must be present");

    const inMemory = NegotiationManager.getSession(data.session.id)!;
    assert(inMemory.version === 2, `In-memory version must be 2, got ${inMemory.version}`);
    assert(inMemory.updatedAt === data.session.updatedAt, "In-memory updatedAt must match");
  });

  console.log("\n=================================================");
  console.log(`TOTAL: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log("=================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runSessionRestoreTests().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
