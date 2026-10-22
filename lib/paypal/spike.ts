/**
 * Milestone 1 Spike Script: Live PayPal Sandbox API Verification
 * Run with: npm run spike:paypal
 */

import fs from "fs";
import path from "path";

// Load .env.local if present
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

import { getPayPalAccessToken } from "./auth";
import { createOrder, getOrder } from "./orders";
import { getAvailablePayPalTools } from "./toolkit";

async function runMilestone1Spikes() {
  console.log("=================================================");
  console.log("   ORDERLY-AI: MILESTONE 1 PAYPAL SANDBOX SPIKES");
  console.log("=================================================\n");

  const results: Record<string, { status: "PASS" | "FAIL"; details: string }> = {};

  // 1. Test OAuth Token Fetch and Cache
  try {
    console.log("1. Testing PayPal OAuth 2.0 Token Generation...");
    const t0 = Date.now();
    const token1 = await getPayPalAccessToken();
    const duration1 = Date.now() - t0;

    console.log(`   Token retrieved (${token1.substring(0, 12)}...) in ${duration1}ms`);

    // Verify cache hit
    const t1 = Date.now();
    const token2 = await getPayPalAccessToken();
    const duration2 = Date.now() - t1;
    console.log(`   Cached token retrieved in ${duration2}ms (Cache verified: ${token1 === token2})`);

    results["OAuth 2.0 Auth & Caching"] = {
      status: "PASS",
      details: `Token acquired in ${duration1}ms, cached response in ${duration2}ms`,
    };
  } catch (err: any) {
    console.error("   OAuth failed:", err.message);
    results["OAuth 2.0 Auth & Caching"] = {
      status: "FAIL",
      details: err.message,
    };
  }

  // 2. Test Orders v2 Create Order
  let testOrderId: string | null = null;
  try {
    console.log("\n2. Testing Orders v2: Create Order ($45.00)...");
    const order = await createOrder({
      amount: 45.0,
      customId: "NEG-SPIKE-TURN-001",
      description: "Ergonomic Mechanical Keyboard (Negotiated Deal)",
    });

    testOrderId = order.id;
    const approveLink = order.links.find((l) => l.rel === "approve")?.href;

    console.log(`   Order Created! ID: ${order.id}`);
    console.log(`   Status: ${order.status}`);
    console.log(`   Buyer Approval URL: ${approveLink || "N/A"}`);

    results["Orders v2 Create Order"] = {
      status: "PASS",
      details: `Created Order ID: ${order.id}, Status: ${order.status}`,
    };
  } catch (err: any) {
    console.error("   Create Order failed:", err.message);
    results["Orders v2 Create Order"] = {
      status: "FAIL",
      details: err.message,
    };
  }

  // 3. Test Orders v2 Get Order Details
  if (testOrderId) {
    try {
      console.log(`\n3. Testing Orders v2: Get Order Details (${testOrderId})...`);
      const orderDetails = await getOrder(testOrderId);
      console.log(`   Verified Order ID: ${orderDetails.id}`);
      console.log(`   Amount: ${orderDetails.purchase_units?.[0]?.amount?.value} ${orderDetails.purchase_units?.[0]?.amount?.currency_code}`);
      console.log(`   Status: ${orderDetails.status}`);

      results["Orders v2 Get Order"] = {
        status: "PASS",
        details: `Successfully retrieved details for ${orderDetails.id}`,
      };
    } catch (err: any) {
      console.error("   Get Order failed:", err.message);
      results["Orders v2 Get Order"] = {
        status: "FAIL",
        details: err.message,
      };
    }
  }

  // 4. Test PayPal Agent Toolkit Initialization
  try {
    console.log("\n4. Testing @paypal/agent-toolkit AI Tools...");
    const tools = getAvailablePayPalTools();
    const toolNames = Object.keys(tools);
    console.log(`   PayPal Agent Toolkit initialized with ${toolNames.length} AI tools:`);
    console.log(`   Tools: ${toolNames.slice(0, 10).join(", ")}...`);

    results["PayPal Agent Toolkit"] = {
      status: "PASS",
      details: `Loaded ${toolNames.length} tools including ${toolNames.filter((t) => t.includes("order") || t.includes("dispute")).join(", ")}`,
    };
  } catch (err: any) {
    console.error("   Agent Toolkit failed:", err.message);
    results["PayPal Agent Toolkit"] = {
      status: "FAIL",
      details: err.message,
    };
  }

  // Summary
  console.log("\n=================================================");
  console.log("               SPIKE RESULTS SUMMARY");
  console.log("=================================================");
  for (const [test, res] of Object.entries(results)) {
    console.log(`[${res.status}] ${test}: ${res.details}`);
  }
  console.log("=================================================\n");
}

runMilestone1Spikes().catch((err) => {
  console.error("Fatal spike runner error:", err);
  process.exit(1);
});
