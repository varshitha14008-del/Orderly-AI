import { NextResponse } from "next/server";
import { NegotiationManager } from "@/lib/negotiation/engine";
import { auditLedger } from "@/lib/audit/ledger";

export async function POST() {
  NegotiationManager.resetAll();
  return NextResponse.json({
    success: true,
    message: "Negotiation state and audit ledger cleanly reset.",
  });
}
