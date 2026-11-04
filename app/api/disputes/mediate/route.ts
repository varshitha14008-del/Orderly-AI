import { NextResponse } from "next/server";
import { NegotiationManager } from "@/lib/negotiation/engine";
import { runMediatorAgent } from "@/lib/agents/mediator";
import { captureRequestAuditEvents } from "@/lib/audit/ledger";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { sessionId, category, notes, session: clientSession } = body;

    // If client supplied a session snapshot, safely restore it through validated monotonic restoration
    if (clientSession) {
      if (sessionId && typeof clientSession.id === "string" && clientSession.id !== sessionId) {
        return NextResponse.json(
          { error: `Session snapshot ID mismatch: expected ${sessionId}, got ${clientSession.id}` },
          { status: 400 }
        );
      }
      NegotiationManager.restoreSession(clientSession);
    }

    const targetSessionId = sessionId || clientSession?.id;
    const session = targetSessionId ? NegotiationManager.getSession(targetSessionId) : undefined;

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const { result: recommendation, events } = await captureRequestAuditEvents(async () => {
      return await runMediatorAgent({
        session,
        category: category || "damaged",
        claimNotes: notes || "Buyer reports item arrived with defects or discrepancy.",
      });
    });

    return NextResponse.json({
      success: true,
      recommendation,
      events,
    });
  } catch (err: any) {
    console.error("[Dispute API] Error in mediation:", err);
    const isValidationOrStaleError =
      err.message?.includes("snapshot") ||
      err.message?.includes("Illegal state transition");

    return NextResponse.json(
      { error: err.message || "Failed to run dispute mediator" },
      { status: isValidationOrStaleError ? 400 : 500 }
    );
  }
}
