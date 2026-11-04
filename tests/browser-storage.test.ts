/**
 * Unit Tests for Browser Local Storage Helper (tests/browser-storage.test.ts)
 * Run with: npx tsx tests/browser-storage.test.ts
 */

import {
  getStoredSessions,
  getStoredSession,
  saveStoredSession,
  saveStoredSessions,
  getStoredAuditEvents,
  appendStoredAuditEvents,
  clearBrowserStorage,
  getEventIdentity,
} from "../lib/storage/browserStore";
import type { AuditEntry } from "../lib/audit/ledger";
import type { NegotiationSession } from "../lib/negotiation/engine";
import { DEFAULT_BUYER_POLICY, DEFAULT_MERCHANT_POLICY } from "../lib/negotiation/catalog";

function assert(condition: any, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// In-memory mock localStorage implementation
class MockLocalStorage {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

async function runBrowserStorageTests() {
  console.log("=================================================");
  console.log("       BROWSER STORAGE HELPER UNIT TESTS");
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

  // 1. SSR safety when window / localStorage is undefined
  testCase("SSR safety: Gracefully returns empty data when window is undefined", () => {
    const originalWindow = (globalThis as any).window;
    delete (globalThis as any).window;

    try {
      assert(getStoredSessions().length === 0, "Expected empty sessions when window is undefined");
      assert(getStoredSession("any-id") === null, "Expected null session when window is undefined");
      assert(getStoredAuditEvents().length === 0, "Expected empty audit events when window is undefined");

      // Mutation calls should safely no-op without throwing
      saveStoredSession({ id: "test" } as any);
      appendStoredAuditEvents([{ id: 1 } as any]);
      clearBrowserStorage();
    } finally {
      (globalThis as any).window = originalWindow;
    }
  });

  // Setup mock window and localStorage for subsequent tests
  const mockStorage = new MockLocalStorage();
  (globalThis as any).window = {
    localStorage: mockStorage,
  };

  const sampleSession: NegotiationSession = {
    id: "neg-test-01",
    product: {
      id: "prod-kb-01",
      title: "Ergonomic Mechanical Keyboard",
      description: "Keyboard",
      listPrice: 75.0,
      floorPrice: 45.0,
      category: "electronics",
    },
    buyerPolicy: DEFAULT_BUYER_POLICY,
    merchantPolicy: DEFAULT_MERCHANT_POLICY,
    status: "IN_PROGRESS",
    currentRound: 1,
    maxRounds: 4,
    turns: [],
    agreedPrice: null,
    paypalOrderId: null,
    paypalCaptureId: null,
    paypalCaptureStatus: null,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // 2. Session save and retrieval
  testCase("Session Storage: Saves and retrieves session by ID", () => {
    mockStorage.clear();
    saveStoredSession(sampleSession);

    const retrieved = getStoredSession("neg-test-01");
    assert(retrieved !== null, "Expected retrieved session");
    assert(retrieved.id === "neg-test-01", "Session ID should match");
    assert(retrieved.version === 1, "Version should be 1");

    const all = getStoredSessions();
    assert(all.length === 1, "Expected exactly 1 session in storage");
  });

  // 3. Monotonic version guard prevents stale overwrites
  testCase("Session Storage: Stale session snapshot cannot overwrite newer session", () => {
    mockStorage.clear();
    const v2Session: NegotiationSession = {
      ...sampleSession,
      version: 2,
      turns: [
        {
          turnId: 1,
          round: 1,
          role: "buyer",
          proposal: { action: "offer", price: 50.0, rationale: "Initial offer" },
          fallback: false,
          timestamp: new Date().toISOString(),
        },
      ],
    };
    saveStoredSession(v2Session);

    // Attempt to save older version 1 snapshot
    const v1Stale: NegotiationSession = {
      ...sampleSession,
      version: 1,
      turns: [],
    };
    saveStoredSession(v1Stale);

    const stored = getStoredSession("neg-test-01");
    assert(stored?.version === 2, `Expected stored version 2, got ${stored?.version}`);
    assert(stored?.turns.length === 1, `Expected 1 turn, got ${stored?.turns.length}`);
  });

  // 4. Equal-version preserves verified PayPal capture status
  testCase("Session Storage: Equal version preserves verified PayPal capture status", () => {
    mockStorage.clear();
    const capturedSession: NegotiationSession = {
      ...sampleSession,
      version: 3,
      status: "COMPLETED",
      paypalCaptureId: "CAP-REAL-123",
      paypalCaptureStatus: "COMPLETED",
    };
    saveStoredSession(capturedSession);

    // Save snapshot with same version but missing capture status
    const equalSnapshotWithoutCapture: NegotiationSession = {
      ...sampleSession,
      version: 3,
      status: "COMPLETED",
      paypalCaptureId: null,
      paypalCaptureStatus: null,
    };
    saveStoredSession(equalSnapshotWithoutCapture);

    const stored = getStoredSession("neg-test-01");
    assert(stored?.version === 3, "Version should remain 3");
    assert(stored?.paypalCaptureStatus === "COMPLETED", "Verified PayPal capture status must NOT be cleared");
    assert(stored?.paypalCaptureId === "CAP-REAL-123", "Verified capture ID must NOT be cleared");
  });

  // 5. Audit Events appending and deduplication by event identity
  testCase("Audit Storage: Appends genuine events and deduplicates by event hash", () => {
    mockStorage.clear();

    const event1: AuditEntry = {
      id: 1,
      timestamp: "2026-11-04T10:00:00.000Z",
      actor: "system",
      type: "GENESIS_BLOCK",
      payload: { message: "Genesis" },
      prev_hash: "0000000000000000000000000000000000000000000000000000000000000000",
      hash: "hash_genesis_111",
    };

    const event2: AuditEntry = {
      id: 2,
      timestamp: "2026-11-04T10:01:00.000Z",
      actor: "system",
      type: "NEGOTIATION_INITIALIZED",
      payload: { sessionId: "neg-test-01" },
      prev_hash: "hash_genesis_111",
      hash: "hash_init_222",
    };

    appendStoredAuditEvents([event1, event2]);
    let storedEvents = getStoredAuditEvents();
    assert(storedEvents.length === 2, `Expected 2 events, got ${storedEvents.length}`);

    // Attempting to append the same events again should deduplicate
    appendStoredAuditEvents([event1, event2]);
    storedEvents = getStoredAuditEvents();
    assert(storedEvents.length === 2, `Expected 2 events after duplicate append, got ${storedEvents.length}`);

    // Appending a new event of the SAME TYPE with different hash should append successfully
    const event3SameType: AuditEntry = {
      id: 3,
      timestamp: "2026-11-04T10:05:00.000Z",
      actor: "system",
      type: "NEGOTIATION_INITIALIZED",
      payload: { sessionId: "neg-test-02" },
      prev_hash: "hash_init_222",
      hash: "hash_init_333",
    };

    appendStoredAuditEvents([event3SameType]);
    storedEvents = getStoredAuditEvents();
    assert(storedEvents.length === 3, `Expected 3 events after appending new event of same type, got ${storedEvents.length}`);
    assert(storedEvents[2].hash === "hash_init_333", "Third event must match appended event");
  });

  // 6. Reset / clear storage
  testCase("Clear Storage: Removes both sessions and audit events", () => {
    clearBrowserStorage();
    assert(getStoredSessions().length === 0, "Sessions should be empty after clear");
    assert(getStoredAuditEvents().length === 0, "Audit events should be empty after clear");
  });

  console.log("\n=================================================");
  console.log(`TOTAL: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log("=================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runBrowserStorageTests();
