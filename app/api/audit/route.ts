import { NextResponse } from "next/server";
import { auditLedger } from "@/lib/audit/ledger";

export async function GET() {
  const entries = auditLedger.getEntries();
  const integrity = auditLedger.verifyIntegrity();

  return NextResponse.json({
    entries,
    integrity,
    total: entries.length,
  });
}
