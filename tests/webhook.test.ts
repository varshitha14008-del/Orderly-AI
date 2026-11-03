/**
 * PayPal Webhook Security & Verification Unit Tests (tests/webhook.test.ts)
 * Run with: npm run test:webhook
 */

import { POST } from "../app/api/paypal/webhook/route";
import {
  validateWebhookHeaders,
  BoundedEventDeduplicator,
  webhookDeduplicator,
} from "../lib/paypal/webhooks";
import { NegotiationManager } from "../lib/negotiation/engine";
import { auditLedger } from "../lib/audit/ledger";
import { invalidateCachedToken } from "../lib/paypal/auth";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runWebhookSecurityTests() {
  console.log("=================================================");
  console.log("   PAYPAL WEBHOOK SECURITY & VERIFICATION TESTS");
  console.log("=================================================\n");

  let passed = 0;
  let failed = 0;

  async function testCase(name: string, fn: () => Promise<void> | void) {
    try {
      await fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`[FAIL] ${name}: ${err.message}`);
      failed++;
    }
  }

  // Backup original environment and fetch
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;

  // Standard mock transmission headers
  const validHeaders = {
    "paypal-auth-algo": "SHA256withRSA",
    "paypal-cert-url": "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-123",
    "paypal-transmission-id": "trans-mock-001",
    "paypal-transmission-sig": "mock_valid_signature_base64",
    "paypal-transmission-time": "2026-11-03T12:00:00Z",
  };

  const sampleEvent = {
    id: "WH-EV-TEST-001",
    event_version: "1.0",
    create_time: "2026-11-03T12:00:00Z",
    resource_type: "capture",
    event_type: "PAYMENT.CAPTURE.COMPLETED",
    summary: "Payment capture completed",
    resource: {
      id: "CAP-REAL-12345",
      status: "COMPLETED",
      custom_id: "", // Will be filled per test with session ID
    },
  };

  function setupMockFetch(verifyStatus: "SUCCESS" | "FAILURE" = "SUCCESS") {
    invalidateCachedToken();
    globalThis.fetch = async (url: any, init?: any): Promise<Response> => {
      const urlStr = String(url);

      // Mock OAuth 2.0 Token Generation
      if (urlStr.includes("/v1/oauth2/token")) {
        return new Response(
          JSON.stringify({
            access_token: "mock_test_token_abc123",
            token_type: "Bearer",
            expires_in: 32400,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      // Mock Signature Verification
      if (urlStr.includes("/v1/notifications/verify-webhook-signature")) {
        return new Response(
          JSON.stringify({
            verification_status: verifyStatus,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      throw new Error(`Unexpected fetch call to: ${urlStr}`);
    };
  }

  try {
    // -------------------------------------------------------------
    // Test 1: Header Validation - All 5 Present
    // -------------------------------------------------------------
    await testCase("validateWebhookHeaders: Validates all 5 required headers successfully", () => {
      const result = validateWebhookHeaders(validHeaders);
      assert(result.valid === true, "Expected headers to be valid");
      if (result.valid) {
        assert(result.headers.authAlgo === "SHA256withRSA", "Extracted authAlgo mismatch");
        assert(result.headers.transmissionId === "trans-mock-001", "Extracted transmissionId mismatch");
      }
    });

    // -------------------------------------------------------------
    // Test 2: Header Validation - Missing & Whitespace Headers Flagged
    // -------------------------------------------------------------
    await testCase("validateWebhookHeaders: Detects missing and empty/whitespace headers", () => {
      // Missing transmission-sig
      const partialHeaders: any = { ...validHeaders };
      delete partialHeaders["paypal-transmission-sig"];
      const res1 = validateWebhookHeaders(partialHeaders);
      assert(res1.valid === false, "Expected failure when transmission-sig is missing");
      if (!res1.valid) {
        assert(res1.missing.includes("paypal-transmission-sig"), "Should list missing transmission-sig");
      }

      // Whitespace-only cert-url
      const whitespaceHeaders: any = { ...validHeaders, "paypal-cert-url": "   " };
      const res2 = validateWebhookHeaders(whitespaceHeaders);
      assert(res2.valid === false, "Expected failure when cert-url is whitespace");
      if (!res2.valid) {
        assert(res2.missing.includes("paypal-cert-url"), "Should list whitespace header as missing");
      }
    });

    // -------------------------------------------------------------
    // Test 3: BoundedEventDeduplicator - LRU Eviction & Bound Size
    // -------------------------------------------------------------
    await testCase("BoundedEventDeduplicator: Strictly bounds cache size and evicts via LRU", () => {
      const cache = new BoundedEventDeduplicator(3);
      assert(cache.size() === 0, "Initial size must be 0");

      cache.add("ev-1");
      cache.add("ev-2");
      cache.add("ev-3");
      assert(cache.size() === 3, "Size must be 3");
      assert(cache.has("ev-1"), "Must have ev-1");

      // Re-add ev-1 to update its recency (ev-2 becomes the oldest)
      cache.add("ev-1");

      // Add ev-4, which should trigger eviction of oldest key (ev-2)
      cache.add("ev-4");
      assert(cache.size() === 3, "Size must still be bounded to 3");
      assert(cache.has("ev-1") === true, "ev-1 was refreshed, so it should be preserved");
      assert(cache.has("ev-2") === false, "ev-2 must be evicted as the oldest entry");
      assert(cache.has("ev-3") === true, "ev-3 should remain");
      assert(cache.has("ev-4") === true, "ev-4 should be present");
    });

    // -------------------------------------------------------------
    // Test 4: Missing PAYPAL_WEBHOOK_ID Configuration
    // -------------------------------------------------------------
    await testCase("POST /api/paypal/webhook: Rejects webhook when PAYPAL_WEBHOOK_ID is unconfigured (never bypasses)", async () => {
      delete process.env.PAYPAL_WEBHOOK_ID;
      process.env.PAYPAL_CLIENT_ID = "mock_client";
      process.env.PAYPAL_CLIENT_SECRET = "mock_secret";

      const req = new Request("http://localhost:3000/api/paypal/webhook", {
        method: "POST",
        headers: validHeaders,
        body: JSON.stringify(sampleEvent),
      });

      const res = await POST(req);
      assert(res.status === 500, `Expected HTTP 500, got ${res.status}`);
      const body = await res.json();
      assert(body.error.includes("PAYPAL_WEBHOOK_ID is not configured"), "Must report configuration error");
    });

    // -------------------------------------------------------------
    // Test 5: Missing Transmission Headers
    // -------------------------------------------------------------
    await testCase("POST /api/paypal/webhook: Rejects request with HTTP 400 when transmission headers are missing", async () => {
      process.env.PAYPAL_WEBHOOK_ID = "WH-CONFIGURED-ID-123";
      process.env.PAYPAL_CLIENT_ID = "mock_client";
      process.env.PAYPAL_CLIENT_SECRET = "mock_secret";

      const incompleteHeaders: any = { ...validHeaders };
      delete incompleteHeaders["paypal-transmission-sig"];

      const req = new Request("http://localhost:3000/api/paypal/webhook", {
        method: "POST",
        headers: incompleteHeaders,
        body: JSON.stringify(sampleEvent),
      });

      const res = await POST(req);
      assert(res.status === 400, `Expected HTTP 400, got ${res.status}`);
      const body = await res.json();
      assert(body.error.includes("Missing required PayPal transmission headers"), "Must state missing headers error");
      assert(body.missingHeaders.includes("paypal-transmission-sig"), "Must identify missing header");
    });

    // -------------------------------------------------------------
    // Test 6: Invalid Signature - Verification Fails
    // -------------------------------------------------------------
    await testCase("POST /api/paypal/webhook: Rejects invalid signature with HTTP 400 without updating session", async () => {
      process.env.PAYPAL_WEBHOOK_ID = "WH-CONFIGURED-ID-123";
      process.env.PAYPAL_CLIENT_ID = "mock_client";
      process.env.PAYPAL_CLIENT_SECRET = "mock_secret";
      setupMockFetch("FAILURE"); // PayPal verify endpoint returns FAILURE

      // Create a test session
      const session = NegotiationManager.createSession("prod-kb-01");
      session.status = "AGREED";
      session.agreedPrice = 50.0;

      const eventPayload = {
        ...sampleEvent,
        id: "WH-ATTACK-001",
        resource: {
          id: "CAP-FORGED-999",
          status: "COMPLETED",
          custom_id: session.id,
        },
      };

      const req = new Request("http://localhost:3000/api/paypal/webhook", {
        method: "POST",
        headers: validHeaders,
        body: JSON.stringify(eventPayload),
      });

      const res = await POST(req);
      assert(res.status === 400, `Expected HTTP 400, got ${res.status}`);
      const body = await res.json();
      assert(body.error === "Invalid webhook signature", `Expected "Invalid webhook signature", got: ${body.error}`);

      // Invariant: Session must NOT be modified or captured!
      const updatedSession = NegotiationManager.getSession(session.id);
      assert(updatedSession?.status === "AGREED", "Session status must NOT be changed to COMPLETED");
      assert(updatedSession?.paypalCaptureId === null, "Capture ID must NOT be attached on failed verification");

      // Invariant: Event must NOT be added to deduplicator
      assert(webhookDeduplicator.has("WH-ATTACK-001") === false, "Failed event must not be marked as processed");
    });

    // -------------------------------------------------------------
    // Test 7: Valid Signature - Successful Reconciliation
    // -------------------------------------------------------------
    await testCase("POST /api/paypal/webhook: Accepts valid signature (HTTP 200), logs audit, and reconciles capture", async () => {
      process.env.PAYPAL_WEBHOOK_ID = "WH-CONFIGURED-ID-123";
      process.env.PAYPAL_CLIENT_ID = "mock_client";
      process.env.PAYPAL_CLIENT_SECRET = "mock_secret";
      setupMockFetch("SUCCESS"); // PayPal verify endpoint returns SUCCESS
      webhookDeduplicator.clear();

      const session = NegotiationManager.createSession("prod-kb-01");
      session.status = "AGREED";
      session.agreedPrice = 50.0;

      const eventPayload = {
        ...sampleEvent,
        id: "WH-VALID-001",
        resource: {
          id: "CAP-LEGIT-777",
          status: "COMPLETED",
          custom_id: session.id,
        },
      };

      const req = new Request("http://localhost:3000/api/paypal/webhook", {
        method: "POST",
        headers: validHeaders,
        body: JSON.stringify(eventPayload),
      });

      const res = await POST(req);
      assert(res.status === 200, `Expected HTTP 200, got ${res.status}`);
      const body = await res.json();
      assert(body.status === "SUCCESS", "Expected status SUCCESS");
      assert(body.verified === true, "Expected verified === true");
      assert(body.eventId === "WH-VALID-001", "Event ID must match");

      // Verify session reconciliation
      const updatedSession = NegotiationManager.getSession(session.id);
      assert(updatedSession?.status === "COMPLETED", "Session must be marked COMPLETED");
      assert(updatedSession?.paypalCaptureId === "CAP-LEGIT-777", "Capture ID must be correctly attached");

      // Verify audit ledger record
      const auditEntries = auditLedger.getEntries();
      const lastAudit = auditEntries[auditEntries.length - 2]; // capture attached is last, webhook is 2nd last
      const webhookAudit = auditEntries.find((e) => e.payload?.eventId === "WH-VALID-001");
      assert(webhookAudit !== undefined, "Audit ledger must record the webhook");
      assert(webhookAudit?.payload.verified === true, "Audit ledger must record verified: true");
    });

    // -------------------------------------------------------------
    // Test 8: Duplicate Event Prevention
    // -------------------------------------------------------------
    await testCase("POST /api/paypal/webhook: Prevents duplicate execution for already-verified event", async () => {
      process.env.PAYPAL_WEBHOOK_ID = "WH-CONFIGURED-ID-123";
      process.env.PAYPAL_CLIENT_ID = "mock_client";
      process.env.PAYPAL_CLIENT_SECRET = "mock_secret";
      setupMockFetch("SUCCESS");

      // We send the same event "WH-VALID-001" that was already processed in Test 7
      const eventPayload = {
        ...sampleEvent,
        id: "WH-VALID-001",
        resource: {
          id: "CAP-LEGIT-777",
          status: "COMPLETED",
          custom_id: "non-existent-session-id",
        },
      };

      const req = new Request("http://localhost:3000/api/paypal/webhook", {
        method: "POST",
        headers: validHeaders,
        body: JSON.stringify(eventPayload),
      });

      const res = await POST(req);
      assert(res.status === 200, `Expected HTTP 200, got ${res.status}`);
      const body = await res.json();
      assert(body.status === "DUPLICATE_IGNORED", `Expected DUPLICATE_IGNORED, got ${body.status}`);
      assert(body.eventId === "WH-VALID-001", "Must return identical eventId");
    });
  } finally {
    // Restore environment and fetch
    process.env = originalEnv;
    globalThis.fetch = originalFetch;
    webhookDeduplicator.clear();
  }

  console.log("\n=================================================");
  console.log(`TOTAL: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log("=================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runWebhookSecurityTests();
