/**
 * Unit Tests for PayPal Order Creation, Capture, and Refund/Contest API Routes (tests/orders.test.ts)
 * Run with: npm run test:orders
 */

import { POST as createOrderRoute } from "../app/api/orders/create/route";
import { POST as captureOrderRoute } from "../app/api/orders/capture/route";
import { POST as refundRoute } from "../app/api/disputes/refund/route";
import { POST as seedRoute } from "../app/api/demo/seed/route";
import { POST as syncRoute } from "../app/api/demo/sync/route";
import { refundCapture } from "../lib/paypal/payments";
import { NegotiationManager } from "../lib/negotiation/engine";
import { auditLedger } from "../lib/audit/ledger";
import { invalidateCachedToken } from "../lib/paypal/auth";

function assert(condition: any, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

interface MockCaptureState {
  id: string;
  status: "COMPLETED" | "PARTIALLY_REFUNDED" | "REFUNDED" | "DECLINED" | "PENDING";
  amount: { value: string; currency_code: string };
  totalRefunded: number;
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
  let paypalGetCaptureCallCount = 0;
  let paypalGetOrderCallCount = 0;
  let mockRefundResponseStatus: "COMPLETED" | "PENDING" | "FAILED" = "COMPLETED";

  const mockCaptures = new Map<string, MockCaptureState>();

  function setupMockPayPalFetch() {
    invalidateCachedToken();
    paypalRefundApiCallCount = 0;
    paypalGetCaptureCallCount = 0;
    paypalGetOrderCallCount = 0;
    mockRefundResponseStatus = "COMPLETED";
    mockCaptures.clear();

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
        const orderAmount = body.purchase_units?.[0]?.amount?.value || "60.00";
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

      // Mock Orders v2 Get Order (GET /v2/checkout/orders/{id})
      if (urlStr.includes("/v2/checkout/orders/") && (!init?.method || init?.method === "GET")) {
        paypalGetOrderCallCount++;
        const parts = urlStr.split("/v2/checkout/orders/")[1].split("/")[0].split("?")[0];
        return new Response(
          JSON.stringify({
            id: parts,
            status: "COMPLETED",
            purchase_units: [
              {
                amount: { currency_code: "USD", value: "48.00" },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
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

      // Mock Payments v2 Get Capture (GET /v2/payments/captures/{id})
      if (urlStr.includes("/v2/payments/captures/") && (!init?.method || init?.method === "GET")) {
        paypalGetCaptureCallCount++;
        const parts = urlStr.split("/v2/payments/captures/")[1].split("/")[0].split("?")[0];
        const captureId = parts;

        const cap = mockCaptures.get(captureId) || {
          id: captureId,
          status: "COMPLETED",
          amount: { value: "60.00", currency_code: "USD" },
          totalRefunded: 0,
        };

        const responsePayload: any = {
          id: cap.id,
          status: cap.status,
          amount: cap.amount,
          final_capture: true,
          create_time: new Date().toISOString(),
        };

        if (cap.totalRefunded > 0) {
          responsePayload.seller_receivable_breakdown = {
            total_refunded_amount: {
              value: cap.totalRefunded.toFixed(2),
              currency_code: cap.amount.currency_code,
            },
          };
        }

        return new Response(JSON.stringify(responsePayload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Mock Payments v2 Refund (POST /v2/payments/captures/{id}/refund)
      if (urlStr.includes("/refund") && init?.method === "POST") {
        paypalRefundApiCallCount++;
        const body = JSON.parse(init.body || "{}");
        const refundVal = body.amount?.value || "60.00";
        const refundValNum = parseFloat(refundVal);

        // Extract captureId from URL: .../captures/{id}/refund
        const parts = urlStr.split("/v2/payments/captures/")[1].split("/refund")[0];
        const captureId = parts;

        // Update state in mock captures
        const cap = mockCaptures.get(captureId) || {
          id: captureId,
          status: "COMPLETED",
          amount: { value: "60.00", currency_code: "USD" },
          totalRefunded: 0,
        };

        if (mockRefundResponseStatus === "COMPLETED") {
          cap.totalRefunded += refundValNum;
          const origVal = parseFloat(cap.amount.value);
          if (cap.totalRefunded >= origVal) {
            cap.status = "REFUNDED";
          } else {
            cap.status = "PARTIALLY_REFUNDED";
          }
          mockCaptures.set(captureId, cap);
        }

        return new Response(
          JSON.stringify({
            id: `REFUND-MOCK-${Date.now().toString(36)}`,
            status: mockRefundResponseStatus,
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
      assert(
        lastAudit.type === "ORDER_ATTACHED_TO_SESSION" || lastAudit.type === "PAYPAL_ORDER_CREATED",
        "Must log order creation or attachment"
      );
    });

    // -------------------------------------------------------------
    // Test 2: Create Order via Direct Amount ($60.00 fallback)
    // -------------------------------------------------------------
    await testCase("POST /api/orders/create: Creates order using explicit amount ($60.00) if session is unindexed", async () => {
      const req = new Request("http://localhost:3000/api/orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "neg-unindexed-123",
          amount: 60.0,
          description: "Direct Settlement Fallback",
        }),
      });

      const res = await createOrderRoute(req);
      assert(res.status === 200, `Expected status 200, got ${res.status}`);
      const data = await res.json();

      assert(data.success === true, "Expected success true");
      assert(data.orderId === "ORDER-MOCK-998877", "Order ID must match mock");
      assert(data.status === "CREATED", "Status must be CREATED");
    });

    // -------------------------------------------------------------
    // Test 3: Reject Order Creation Without Settlement Amount
    // -------------------------------------------------------------
    await testCase("POST /api/orders/create: Rejects order creation when no settlement amount is present", async () => {
      const session = NegotiationManager.createSession("prod-kb-01");
      session.agreedPrice = null; // Unsettled

      const req = new Request("http://localhost:3000/api/orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id }),
      });

      const res = await createOrderRoute(req);
      assert(res.status === 400, `Expected status 400, got ${res.status}`);
      const data = await res.json();
      assert(data.error.includes("No agreed settlement price"), "Must report missing settlement price");
    });

    // -------------------------------------------------------------
    // Test 4: Capture Approved Order & Update Session Status
    // -------------------------------------------------------------
    await testCase("POST /api/orders/capture: Captures approved order and updates session", async () => {
      const session = NegotiationManager.createSession("prod-kb-01");
      session.agreedPrice = 60.0;
      session.status = "AGREED";
      session.paypalOrderId = "ORDER-MOCK-998877";

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
    // PAYPAL PAYMENTS V2 REFUND & CAPTURE BALANCE TESTS
    // =============================================================

    // -------------------------------------------------------------
    // Test 6: Contest Ruling - Neither getCapture NOR refund API Called
    // -------------------------------------------------------------
    await testCase("POST /api/disputes/refund: Contest decision without any PayPal API call", async () => {
      const refundCallsBefore = paypalRefundApiCallCount;
      const getCaptureCallsBefore = paypalGetCaptureCallCount;

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
      assert(paypalRefundApiCallCount === refundCallsBefore, "refundCapture must NOT be called for contest");
      assert(paypalGetCaptureCallCount === getCaptureCallsBefore, "getCapture must NOT be called for contest");

      // Verify audit record exists
      const entries = auditLedger.getEntries();
      const contestAudit = entries.find(
        (e) => e.type === "DISPUTE_CONTEST_RULING_RECORDED" && e.payload?.captureId === "CAP-CONTEST-123"
      );
      assert(contestAudit !== undefined, "Audit ledger must record DISPUTE_CONTEST_RULING_RECORDED");
      assert(contestAudit.payload?.refundAmount === 0, "Audit payload refund amount must be 0");
    });

    // -------------------------------------------------------------
    // Test 7: Full Refund When Nothing Previously Refunded
    // -------------------------------------------------------------
    await testCase("POST /api/disputes/refund: Full refund when nothing has previously been refunded", async () => {
      mockCaptures.set("CAP-FULL-456", {
        id: "CAP-FULL-456",
        status: "COMPLETED",
        amount: { value: "60.00", currency_code: "USD" },
        totalRefunded: 0,
      });

      const refundCallsBefore = paypalRefundApiCallCount;
      const getCaptureCallsBefore = paypalGetCaptureCallCount;

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
      assert(data.status === "COMPLETED", "Expected status: COMPLETED");
      assert(data.refundIssued === true, "Expected refundIssued: true");
      assert(data.remainingBalance === 0, "Expected remainingBalance: 0");
      assert(paypalGetCaptureCallCount === getCaptureCallsBefore + 1, "getCapture must be called before refund");
      assert(paypalRefundApiCallCount === refundCallsBefore + 1, "PayPal refund API must be called exactly once");

      // Verify audit record exists
      const entries = auditLedger.getEntries();
      const refundAudit = entries.find(
        (e) => e.type === "REFUND_APPROVED_AND_EXECUTED" && e.payload?.captureId === "CAP-FULL-456"
      );
      assert(refundAudit !== undefined, "Audit ledger must record REFUND_APPROVED_AND_EXECUTED");
    });

    // -------------------------------------------------------------
    // Test 8: Rejection When Capture Is Already Fully Refunded
    // -------------------------------------------------------------
    await testCase("POST /api/disputes/refund: Rejection when the capture is already fully refunded", async () => {
      mockCaptures.set("CAP-ALREADY-REFUNDED-01", {
        id: "CAP-ALREADY-REFUNDED-01",
        status: "REFUNDED",
        amount: { value: "60.00", currency_code: "USD" },
        totalRefunded: 60.0,
      });

      const refundCallsBefore = paypalRefundApiCallCount;

      const req = new Request("http://localhost:3000/api/disputes/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "neg-dup-01",
          captureId: "CAP-ALREADY-REFUNDED-01",
          amount: 60.0,
          decision: "full_refund",
        }),
      });

      const res = await refundRoute(req);
      assert(res.status === 400, `Expected status 400, got ${res.status}`);
      const data = await res.json();

      assert(data.error.includes("already fully refunded"), "Error must state capture is already fully refunded");
      assert(data.remainingBalance === 0, "Remaining balance must be 0");
      assert(paypalRefundApiCallCount === refundCallsBefore, "PayPal refund API must NOT be called");
    });

    // -------------------------------------------------------------
    // Test 9: Partial Refund When Sufficient Balance Remains
    // -------------------------------------------------------------
    await testCase("POST /api/disputes/refund: Partial refund when sufficient balance remains", async () => {
      mockCaptures.set("CAP-PARTIAL-789", {
        id: "CAP-PARTIAL-789",
        status: "COMPLETED",
        amount: { value: "60.00", currency_code: "USD" },
        totalRefunded: 0,
      });

      const refundCallsBefore = paypalRefundApiCallCount;

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
      assert(data.status === "COMPLETED", "Expected status: COMPLETED");
      assert(data.refundIssued === true, "Expected refundIssued: true");
      assert(data.remainingBalance === 30.0, "Expected remainingBalance: 30.00");
      assert(paypalRefundApiCallCount === refundCallsBefore + 1, "PayPal refund API must be called for partial refund");
    });

    // -------------------------------------------------------------
    // Test 10: Rejection When Requested Amount Exceeds Remaining Balance
    // -------------------------------------------------------------
    await testCase("POST /api/disputes/refund: Rejection when requested amount exceeds remaining balance", async () => {
      mockCaptures.set("CAP-LOW-BALANCE-01", {
        id: "CAP-LOW-BALANCE-01",
        status: "PARTIALLY_REFUNDED",
        amount: { value: "60.00", currency_code: "USD" },
        totalRefunded: 40.0, // Remaining balance is $20.00
      });

      const refundCallsBefore = paypalRefundApiCallCount;

      const req = new Request("http://localhost:3000/api/disputes/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "neg-exceed-01",
          captureId: "CAP-LOW-BALANCE-01",
          amount: 25.0, // Exceeds $20.00 remaining
          decision: "partial_refund",
        }),
      });

      const res = await refundRoute(req);
      assert(res.status === 400, `Expected status 400, got ${res.status}`);
      const data = await res.json();

      assert(data.error.includes("exceeds remaining refundable balance"), "Error must state amount exceeds balance");
      assert(data.remainingBalance === 20.0, "Remaining balance must report 20.00");
      assert(paypalRefundApiCallCount === refundCallsBefore, "PayPal refund API must NOT be called");
    });

    // -------------------------------------------------------------
    // Test 11: Second Partial Refund Within Remaining Balance
    // -------------------------------------------------------------
    await testCase("POST /api/disputes/refund: A second partial refund within the remaining balance", async () => {
      mockCaptures.set("CAP-MULTI-PARTIAL-01", {
        id: "CAP-MULTI-PARTIAL-01",
        status: "PARTIALLY_REFUNDED",
        amount: { value: "60.00", currency_code: "USD" },
        totalRefunded: 30.0, // Remaining balance is $30.00
      });

      const refundCallsBefore = paypalRefundApiCallCount;

      const req = new Request("http://localhost:3000/api/disputes/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "neg-multi-01",
          captureId: "CAP-MULTI-PARTIAL-01",
          amount: 20.0, // Legitimate $20 refund <= $30 remaining
          decision: "partial_refund",
          note: "Second partial refund.",
        }),
      });

      const res = await refundRoute(req);
      assert(res.status === 200, `Expected status 200, got ${res.status}`);
      const data = await res.json();

      assert(data.success === true, "Expected success: true");
      assert(data.status === "COMPLETED", "Expected status: COMPLETED");
      assert(data.remainingBalance === 10.0, "Expected remaining balance to be 10.00");
      assert(paypalRefundApiCallCount === refundCallsBefore + 1, "PayPal refund API must be called");
    });

    // -------------------------------------------------------------
    // Test 12: Pending Refund Response Not Reported as Completed
    // -------------------------------------------------------------
    await testCase("POST /api/disputes/refund: Pending refund response not reported as completed", async () => {
      mockCaptures.set("CAP-PENDING-01", {
        id: "CAP-PENDING-01",
        status: "COMPLETED",
        amount: { value: "60.00", currency_code: "USD" },
        totalRefunded: 0,
      });

      mockRefundResponseStatus = "PENDING";

      const req = new Request("http://localhost:3000/api/disputes/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "neg-pending-01",
          captureId: "CAP-PENDING-01",
          amount: 60.0,
          decision: "full_refund",
        }),
      });

      const res = await refundRoute(req);
      assert(res.status === 200, `Expected status 200, got ${res.status}`);
      const data = await res.json();

      assert(data.success === true, "Expected success: true");
      assert(data.status === "PENDING", "Expected status to be PENDING");
      assert(data.refundIssued === false, "refundIssued must be false for pending refunds");
      assert(data.pending === true, "pending flag must be true");

      // Verify audit entry is REFUND_PENDING_APPROVAL, NOT REFUND_APPROVED_AND_EXECUTED
      const entries = auditLedger.getEntries();
      const pendingAudit = entries.find(
        (e) => e.type === "REFUND_PENDING_APPROVAL" && e.payload?.captureId === "CAP-PENDING-01"
      );
      assert(pendingAudit !== undefined, "Audit ledger must record REFUND_PENDING_APPROVAL");

      const executedAudit = entries.find(
        (e) => e.type === "REFUND_APPROVED_AND_EXECUTED" && e.payload?.captureId === "CAP-PENDING-01"
      );
      assert(executedAudit === undefined, "Pending refund must NOT be recorded as REFUND_APPROVED_AND_EXECUTED");

      mockRefundResponseStatus = "COMPLETED";
    });

    // -------------------------------------------------------------
    // Test 13: Failed Refund Response Not Reported as Successful
    // -------------------------------------------------------------
    await testCase("POST /api/disputes/refund: Failed refund response not reported as successful", async () => {
      mockCaptures.set("CAP-FAILED-01", {
        id: "CAP-FAILED-01",
        status: "COMPLETED",
        amount: { value: "60.00", currency_code: "USD" },
        totalRefunded: 0,
      });

      mockRefundResponseStatus = "FAILED";

      const req = new Request("http://localhost:3000/api/disputes/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "neg-fail-01",
          captureId: "CAP-FAILED-01",
          amount: 60.0,
          decision: "full_refund",
        }),
      });

      const res = await refundRoute(req);
      assert(res.status === 400, `Expected status 400 for failed refund, got ${res.status}`);
      const data = await res.json();

      assert(data.success === false, "success must be false for failed refund");
      assert(data.status === "FAILED", "status must be FAILED");
      assert(data.error.includes("failed with status: FAILED"), "Error message must report failure");

      // Verify audit entry is REFUND_EXECUTION_FAILED
      const entries = auditLedger.getEntries();
      const failedAudit = entries.find(
        (e) => e.type === "REFUND_EXECUTION_FAILED" && e.payload?.captureId === "CAP-FAILED-01"
      );
      assert(failedAudit !== undefined, "Audit ledger must record REFUND_EXECUTION_FAILED");

      mockRefundResponseStatus = "COMPLETED";
    });

    // -------------------------------------------------------------
    // Test 14: Invalid Negative Refund Amount - Rejected Before API Call
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
    // Test 15: payments.ts refundCapture throws on non-positive amount
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

    // -------------------------------------------------------------
    // Test 16: Demo seed does not attach fabricated PayPal IDs
    // -------------------------------------------------------------
    await testCase("POST /api/demo/seed: Does not attach fabricated PayPal order or capture IDs", async () => {
      NegotiationManager.resetAll();
      setupMockPayPalFetch();

      const res = await seedRoute();
      assert(res.status === 200, `Expected status 200, got ${res.status}`);
      const data = await res.json();
      assert(data.success === true, "Demo seed should succeed");
      assert(data.session.paypalOrderId === null, `Expected paypalOrderId to be null, got ${data.session.paypalOrderId}`);
      assert(data.session.paypalCaptureId === null, `Expected paypalCaptureId to be null, got ${data.session.paypalCaptureId}`);
      assert(data.session.status === "COMPLETED", "Session status must be COMPLETED");
      assert(data.session.agreedPrice === 48.0, "Session agreed price must be 48.0");
      assert(data.session.turns.length === 4, "Must preserve the 4 negotiated turns");
    });

    // -------------------------------------------------------------
    // Test 17: Demo seed does not claim a real capture occurred
    // -------------------------------------------------------------
    await testCase("POST /api/demo/seed: Does not record PAYMENT_CAPTURE_COMPLETED in audit ledger", async () => {
      NegotiationManager.resetAll();
      setupMockPayPalFetch();

      await seedRoute();
      const entries = auditLedger.getEntries();
      const captureEntry = entries.find((e) => e.type === "PAYMENT_CAPTURE_COMPLETED");
      assert(captureEntry === undefined, "Audit ledger must NOT contain PAYMENT_CAPTURE_COMPLETED for uncaptured demo");

      const seedEntry = entries.find((e) => e.type === "DEMO_COMPLETED_DEAL_SEEDED");
      assert(seedEntry !== undefined, "Audit ledger must record clearly labeled DEMO_COMPLETED_DEAL_SEEDED");
      assert(seedEntry.payload.hasRealPayPalPayment === false, "Must explicitly mark hasRealPayPalPayment as false");
    });

    // -------------------------------------------------------------
    // Test 18: Sync without a real PayPal order ID does not call PayPal
    // -------------------------------------------------------------
    await testCase("POST /api/demo/sync: Empty body without real PayPal order returns message and does NOT call PayPal", async () => {
      NegotiationManager.resetAll();
      setupMockPayPalFetch();

      // Seed session without PayPal IDs
      await seedRoute();

      const callCountBefore = paypalGetOrderCallCount;
      const req = new Request("http://localhost:3000/api/demo/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const res = await syncRoute(req);
      assert(res.status === 200, `Expected status 200, got ${res.status}`);
      const data = await res.json();
      assert(data.success === false, "Must return success=false when no genuine order exists");
      assert(data.message.includes("no real PayPal order to sync"), "Message must explain that no real PayPal order exists");
      assert(paypalGetOrderCallCount === callCountBefore, "PayPal API must NOT be called when no genuine order exists");
    });

    // -------------------------------------------------------------
    // Test 19: Sync with expired/demo placeholder does not call PayPal
    // -------------------------------------------------------------
    await testCase("POST /api/demo/sync: Expired demo placeholder 49A309481M497412U is blocked from calling PayPal", async () => {
      setupMockPayPalFetch();

      const callCountBefore = paypalGetOrderCallCount;
      const req = new Request("http://localhost:3000/api/demo/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: "49A309481M497412U" }),
      });

      const res = await syncRoute(req);
      const data = await res.json();
      assert(data.success === false, "Must return success=false for demo placeholder order ID");
      assert(paypalGetOrderCallCount === callCountBefore, "PayPal API must NOT be called for demo placeholder");
    });

    // -------------------------------------------------------------
    // Test 20: Sync with genuine PayPal order calls PayPal and records sync
    // -------------------------------------------------------------
    await testCase("POST /api/demo/sync: Genuine PayPal order ID calls PayPal and records audit event", async () => {
      setupMockPayPalFetch();

      const callCountBefore = paypalGetOrderCallCount;
      const req = new Request("http://localhost:3000/api/demo/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: "ORDER-LIVE-554433" }),
      });

      const res = await syncRoute(req);
      assert(res.status === 200, `Expected status 200, got ${res.status}`);
      const data = await res.json();
      assert(data.success === true, "Must succeed when genuine order ID is provided");
      assert(data.order.id === "ORDER-LIVE-554433", "Must return synced order");
      assert(paypalGetOrderCallCount === callCountBefore + 1, "PayPal getOrder must be called exactly once");

      const entries = auditLedger.getEntries();
      const syncEntry = entries.find((e) => e.type === "ONE_SHOT_SANDBOX_SYNC" && e.payload.orderId === "ORDER-LIVE-554433");
      assert(syncEntry !== undefined, "Audit ledger must record ONE_SHOT_SANDBOX_SYNC");
    });

    // -------------------------------------------------------------
    // Test 21: Refund route rejects mock/demo capture IDs before calling PayPal
    // -------------------------------------------------------------
    await testCase("POST /api/disputes/refund: Rejects mock/demo capture ID with HTTP 400 before PayPal call", async () => {
      setupMockPayPalFetch();

      const getCaptureCallsBefore = paypalGetCaptureCallCount;
      const refundCallsBefore = paypalRefundApiCallCount;

      const req = new Request("http://localhost:3000/api/disputes/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "neg-demo-seed",
          captureId: "78B991204X518204K",
          amount: 24.0,
          decision: "partial_refund",
        }),
      });

      const res = await refundRoute(req);
      assert(res.status === 400, `Expected status 400, got ${res.status}`);
      const data = await res.json();
      assert(data.error.includes("simulated demo placeholder"), "Error must state captureId is a simulated demo placeholder");
      assert(paypalGetCaptureCallCount === getCaptureCallsBefore, "getCapture must NOT be called for demo placeholder");
      assert(paypalRefundApiCallCount === refundCallsBefore, "refundCapture must NOT be called for demo placeholder");
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
