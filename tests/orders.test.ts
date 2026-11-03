/**
 * Unit Tests for PayPal Order Creation, Capture, and Refund/Contest API Routes (tests/orders.test.ts)
 * Run with: npm run test:orders
 */

import { POST as createOrderRoute } from "../app/api/orders/create/route";
import { POST as captureOrderRoute } from "../app/api/orders/capture/route";
import { POST as refundRoute } from "../app/api/disputes/refund/route";
import { refundCapture } from "../lib/paypal/payments";
import { NegotiationManager } from "../lib/negotiation/engine";
import { auditLedger } from "../lib/audit/ledger";
import { invalidateCachedToken } from "../lib/paypal/auth";

function assert(condition: any, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runOrdersApiTests() {
  console.log("=================================================");
  console.log("   PAYPAL ORDERS, CAPTURE & REFUND API TESTS");
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

  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;

  process.env.PAYPAL_CLIENT_ID = "mock_paypal_client_id";
  process.env.PAYPAL_CLIENT_SECRET = "mock_paypal_client_secret";
  process.env.PAYPAL_ENV = "sandbox";

  let paypalRefundApiCallCount = 0;

  function setupMockPayPalFetch() {
    invalidateCachedToken();
    paypalRefundApiCallCount = 0;

    globalThis.fetch = async (url: any, init?: any): Promise<Response> => {
      const urlStr = String(url);

      // Mock OAuth token
      if (urlStr.includes("/v1/oauth2/token")) {
        return new Response(
          JSON.stringify({
            access_token: "mock_test_token_orders_123",
            token_type: "Bearer",
            expires_in: 32400,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      // Mock Orders v2 Create
      if (urlStr.includes("/v2/checkout/orders") && init?.method === "POST" && !urlStr.includes("/capture")) {
        const body = JSON.parse(init.body || "{}");
        const orderAmount = body.purchase_units?.[0]?.amount?.value;
        const customId = body.purchase_units?.[0]?.custom_id;

        return new Response(
          JSON.stringify({
            id: "ORDER-MOCK-998877",
            status: "CREATED",
            links: [
              { href: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER-MOCK-998877", rel: "approve", method: "GET" },
            ],
            purchase_units: [
              {
                custom_id: customId,
                amount: { currency_code: "USD", value: orderAmount },
              },
            ],
          }),
          { status: 201, headers: { "Content-Type": "application/json" } }
        );
      }

      // Mock Orders v2 Capture
      if (urlStr.includes("/capture") && init?.method === "POST" && !urlStr.includes("/refund")) {
        return new Response(
          JSON.stringify({
            id: "ORDER-MOCK-998877",
            status: "COMPLETED",
            purchase_units: [
              {
                payments: {
                  captures: [
                    {
                      id: "CAP-REAL-PAYPAL-443322",
                      status: "COMPLETED",
                      amount: { currency_code: "USD", value: "60.00" },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 201, headers: { "Content-Type": "application/json" } }
        );
      }

      // Mock Payments v2 Refund
      if (urlStr.includes("/refund") && init?.method === "POST") {
        paypalRefundApiCallCount++;
        const body = JSON.parse(init.body || "{}");
        const refundVal = body.amount?.value || "60.00";
        return new Response(
          JSON.stringify({
            id: "REFUND-MOCK-112233",
            status: "COMPLETED",
            amount: { value: refundVal, currency_code: "USD" },
            create_time: new Date().toISOString(),
          }),
          { status: 201, headers: { "Content-Type": "application/json" } }
        );
      }

      throw new Error(`Unexpected fetch call in test: ${urlStr}`);
    };
  }

  try {
    setupMockPayPalFetch();

    // -------------------------------------------------------------
    // Test 1: Create Order via Active Negotiation Session ($60.00)
    // -------------------------------------------------------------
    await testCase("POST /api/orders/create: Creates order with session agreed price ($60.00)", async () => {
      const session = NegotiationManager.createSession("prod-kb-01");
      session.agreedPrice = 60.0;
      session.status = "AGREED";

      const req = new Request("http://localhost:3000/api/orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          amount: 60.0,
          description: "Ergonomic Mechanical Keyboard (Negotiated Agreement)",
        }),
      });

      const res = await createOrderRoute(req);
      assert(res.status === 200, `Expected status 200, got ${res.status}`);
      const data = await res.json();

      assert(data.success === true, "Expected success true");
      assert(data.orderId === "ORDER-MOCK-998877", "Order ID must match mock");
      assert(data.status === "CREATED", "Status must be CREATED");

      // Verify session updated with PayPal order ID
      const updatedSession = NegotiationManager.getSession(session.id);
      assert(updatedSession?.paypalOrderId === "ORDER-MOCK-998877", "Order ID must be attached to session");

      // Verify audit record
      const auditEntries = auditLedger.getEntries();
      const lastAudit = auditEntries[auditEntries.length - 1];
      assert(lastAudit.type === "ORDER_ATTACHED_TO_SESSION" || lastAudit.type === "PAYPAL_ORDER_CREATED", "Audit ledger must record order creation");
    });

    // -------------------------------------------------------------
    // Test 2: Create Order Fallback to Explicit Amount ($60.00)
    // -------------------------------------------------------------
    await testCase("POST /api/orders/create: Creates order using explicit amount ($60.00) if session is unindexed", async () => {
      const req = new Request("http://localhost:3000/api/orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "unindexed_session_fallback",
          amount: 60.0,
          description: "Fallback Agreement",
        }),
      });

      const res = await createOrderRoute(req);
      assert(res.status === 200, `Expected status 200, got ${res.status}`);
      const data = await res.json();

      assert(data.success === true, "Expected success true");
      assert(data.orderId === "ORDER-MOCK-998877", "Order ID must match mock");
    });

    // -------------------------------------------------------------
    // Test 3: Reject Order Creation when No Price Available
    // -------------------------------------------------------------
    await testCase("POST /api/orders/create: Rejects order creation when no settlement amount is present", async () => {
      const req = new Request("http://localhost:3000/api/orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: "non_existent_empty" }),
      });

      const res = await createOrderRoute(req);
      assert(res.status === 404, `Expected status 404, got ${res.status}`);
      const data = await res.json();
      assert(data.error.includes("Session not found"), "Must report session not found");
    });

    // -------------------------------------------------------------
    // Test 4: Capture Order and Update Session
    // -------------------------------------------------------------
    await testCase("POST /api/orders/capture: Captures approved order and updates session", async () => {
      const session = NegotiationManager.createSession("prod-kb-01");
      session.agreedPrice = 60.0;
      session.paypalOrderId = "ORDER-MOCK-998877";
      session.status = "AGREED";

      const req = new Request("http://localhost:3000/api/orders/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          orderId: "ORDER-MOCK-998877",
        }),
      });

      const res = await captureOrderRoute(req);
      assert(res.status === 200, `Expected status 200, got ${res.status}`);
      const data = await res.json();

      assert(data.success === true, "Expected success true");
      assert(data.captureId === "CAP-REAL-PAYPAL-443322", "Capture ID must match PayPal response");
      assert(data.status === "COMPLETED", "Status must be COMPLETED");

      // Verify session updated to COMPLETED
      const updatedSession = NegotiationManager.getSession(session.id);
      assert(updatedSession?.status === "COMPLETED", "Session status must be COMPLETED");
      assert(updatedSession?.paypalCaptureId === "CAP-REAL-PAYPAL-443322", "Capture ID must be attached");

      // Verify audit record
      const auditEntries = auditLedger.getEntries();
      const captureAudit = auditEntries.find((e) => e.payload?.captureId === "CAP-REAL-PAYPAL-443322");
      assert(captureAudit !== undefined, "Audit ledger must record capture");
    });

    // -------------------------------------------------------------
    // Test 5: Capture Order - Missing Order ID Validation
    // -------------------------------------------------------------
    await testCase("POST /api/orders/capture: Rejects request with HTTP 400 when orderId is missing", async () => {
      const req = new Request("http://localhost:3000/api/orders/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: "neg-test" }),
      });

      const res = await captureOrderRoute(req);
      assert(res.status === 400, `Expected status 400, got ${res.status}`);
      const data = await res.json();
      assert(data.error.includes("Missing orderId"), "Must report missing orderId");
    });

    // =============================================================
    // MEDIATOR & REFUND INTEGRATION TESTS
    // =============================================================

    // -------------------------------------------------------------
    // Test 6: Contest Ruling ($0 Refund) - NO PayPal API Call
    // -------------------------------------------------------------
    await testCase("POST /api/disputes/refund: Contest with $0 refund does NOT call PayPal API and records ruling", async () => {
      const callCountBefore = paypalRefundApiCallCount;

      const req = new Request("http://localhost:3000/api/disputes/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "neg-contest-01",
          captureId: "CAP-CONTEST-123",
          amount: 0,
          decision: "contest",
          note: "Buyer remorse claim contested per merchant policy.",
        }),
      });

      const res = await refundRoute(req);
      assert(res.status === 200, `Expected status 200, got ${res.status}`);
      const data = await res.json();

      assert(data.success === true, "Expected success: true");
      assert(data.decision === "contest", "Expected decision: contest");
      assert(data.refundIssued === false, "Expected refundIssued: false");
      assert(paypalRefundApiCallCount === callCountBefore, "PayPal refund API must NOT be called for contest with $0");

      // Verify audit record exists
      const entries = auditLedger.getEntries();
      const contestAudit = entries.find((e) => e.type === "DISPUTE_CONTEST_RULING_RECORDED" && e.payload?.captureId === "CAP-CONTEST-123");
      assert(contestAudit !== undefined, "Audit ledger must record DISPUTE_CONTEST_RULING_RECORDED");
      assert(contestAudit.payload.refundAmount === 0, "Audit payload refund amount must be 0");
    });

    // -------------------------------------------------------------
    // Test 7: Full Refund (> $0) - Calls PayPal API
    // -------------------------------------------------------------
    await testCase("POST /api/disputes/refund: Full refund calls PayPal Payments v2 API and logs execution", async () => {
      const callCountBefore = paypalRefundApiCallCount;

      const req = new Request("http://localhost:3000/api/disputes/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "neg-full-02",
          captureId: "CAP-FULL-456",
          amount: 60.0,
          decision: "full_refund",
          note: "Item significantly not as described.",
        }),
      });

      const res = await refundRoute(req);
      assert(res.status === 200, `Expected status 200, got ${res.status}`);
      const data = await res.json();

      assert(data.success === true, "Expected success: true");
      assert(data.refundIssued === true, "Expected refundIssued: true");
      assert(data.refund?.id === "REFUND-MOCK-112233", "Expected mock refund id");
      assert(paypalRefundApiCallCount === callCountBefore + 1, "PayPal refund API must be called exactly once");

      // Verify audit record exists
      const entries = auditLedger.getEntries();
      const refundAudit = entries.find((e) => e.type === "REFUND_APPROVED_AND_EXECUTED" && e.payload?.captureId === "CAP-FULL-456");
      assert(refundAudit !== undefined, "Audit ledger must record REFUND_APPROVED_AND_EXECUTED");
    });

    // -------------------------------------------------------------
    // Test 8: Partial Refund (> $0) - Calls PayPal API
    // -------------------------------------------------------------
    await testCase("POST /api/disputes/refund: Partial refund calls PayPal API with 50% amount", async () => {
      const callCountBefore = paypalRefundApiCallCount;

      const req = new Request("http://localhost:3000/api/disputes/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "neg-partial-03",
          captureId: "CAP-PARTIAL-789",
          amount: 30.0,
          decision: "partial_refund",
          note: "Transit damage partial refund.",
        }),
      });

      const res = await refundRoute(req);
      assert(res.status === 200, `Expected status 200, got ${res.status}`);
      const data = await res.json();

      assert(data.success === true, "Expected success: true");
      assert(data.refundIssued === true, "Expected refundIssued: true");
      assert(data.refund?.amount?.value === "30.00", "Refund amount value must match 30.00");
      assert(paypalRefundApiCallCount === callCountBefore + 1, "PayPal refund API must be called for partial refund");
    });

    // -------------------------------------------------------------
    // Test 9: Invalid Negative Refund Amount - Rejected Before API Call
    // -------------------------------------------------------------
    await testCase("POST /api/disputes/refund: Invalid negative refund amount rejected with HTTP 400 before API call", async () => {
      const callCountBefore = paypalRefundApiCallCount;

      const req = new Request("http://localhost:3000/api/disputes/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "neg-bad-04",
          captureId: "CAP-BAD-000",
          amount: -15.0,
          decision: "partial_refund",
        }),
      });

      const res = await refundRoute(req);
      assert(res.status === 400, `Expected status 400, got ${res.status}`);
      const data = await res.json();

      assert(data.error.includes("greater than zero"), "Error message must indicate amount must be greater than zero");
      assert(paypalRefundApiCallCount === callCountBefore, "PayPal API must NOT be called for negative refund amount");
    });

    // -------------------------------------------------------------
    // Test 10: payments.ts refundCapture throws on non-positive amount
    // -------------------------------------------------------------
    await testCase("lib/paypal/payments: refundCapture strictly throws on zero or negative amounts", async () => {
      let threwZero = false;
      try {
        await refundCapture({ captureId: "CAP-ERR-01", amount: 0 });
      } catch (e: any) {
        threwZero = e.message.includes("greater than zero");
      }
      assert(threwZero === true, "refundCapture must throw on amount <= 0");

      let threwNegative = false;
      try {
        await refundCapture({ captureId: "CAP-ERR-02", amount: -25.5 });
      } catch (e: any) {
        threwNegative = e.message.includes("greater than zero");
      }
      assert(threwNegative === true, "refundCapture must throw on negative amount");
    });

  } finally {
    process.env = originalEnv;
    globalThis.fetch = originalFetch;
  }

  console.log("\n=================================================");
  console.log(`TOTAL: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log("=================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runOrdersApiTests();
