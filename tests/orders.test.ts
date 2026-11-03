/**
 * Unit Tests for PayPal Order Creation and Capture API Routes (tests/orders.test.ts)
 * Run with: npm run test:orders
 */

import { POST as createOrderRoute } from "../app/api/orders/create/route";
import { POST as captureOrderRoute } from "../app/api/orders/capture/route";
import { NegotiationManager } from "../lib/negotiation/engine";
import { auditLedger } from "../lib/audit/ledger";
import { invalidateCachedToken } from "../lib/paypal/auth";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runOrdersApiTests() {
  console.log("=================================================");
  console.log("   PAYPAL ORDERS & CAPTURE API ROUTE TESTS");
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

  function setupMockPayPalFetch() {
    invalidateCachedToken();
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
      if (urlStr.includes("/capture") && init?.method === "POST") {
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
        body: JSON.stringify({ sessionId: session.id }),
      });

      const res = await createOrderRoute(req);
      assert(res.status === 200, `Expected status 200, got ${res.status}`);
      const data = await res.json();

      assert(data.success === true, "Expected success true");
      assert(data.orderId === "ORDER-MOCK-998877", "Order ID must match mock response");
      assert(data.status === "CREATED", "Status must be CREATED");

      // Verify session attachment
      const updatedSession = NegotiationManager.getSession(session.id);
      assert(updatedSession?.paypalOrderId === "ORDER-MOCK-998877", "Order ID must be attached to session");

      // Verify audit record
      const auditEntries = auditLedger.getEntries();
      const orderAudit = auditEntries.find(
        (e) => e.type === "PAYPAL_ORDER_CREATED" && e.payload?.orderId === "ORDER-MOCK-998877"
      );
      assert(orderAudit !== undefined, "Audit ledger must record order creation");
      assert(orderAudit?.payload.amount === 60.0, "Audited amount must be 60.00");
    });

    // -------------------------------------------------------------
    // Test 2: Create Order with Fallback Amount ($60.00)
    // -------------------------------------------------------------
    await testCase("POST /api/orders/create: Creates order using explicit amount ($60.00) if session is unindexed", async () => {
      const req = new Request("http://localhost:3000/api/orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "neg-nonexistent-999",
          amount: 60.0,
          description: "Mechanical Keyboard (Negotiated Agreement)",
        }),
      });

      const res = await createOrderRoute(req);
      assert(res.status === 200, `Expected status 200, got ${res.status}`);
      const data = await res.json();

      assert(data.success === true, "Expected success true");
      assert(data.orderId === "ORDER-MOCK-998877", "Order ID must match mock response");
    });

    // -------------------------------------------------------------
    // Test 3: Create Order Validation - Missing Settlement Amount
    // -------------------------------------------------------------
    await testCase("POST /api/orders/create: Rejects order creation when no settlement amount is present", async () => {
      const session = NegotiationManager.createSession("prod-kb-01");
      session.agreedPrice = null; // No agreed settlement yet

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
    // Test 4: Capture Order - Successful Settlement
    // -------------------------------------------------------------
    await testCase("POST /api/orders/capture: Captures approved order and updates session", async () => {
      const session = NegotiationManager.createSession("prod-kb-01");
      session.agreedPrice = 60.0;
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
