import { NextResponse } from "next/server";
import { NegotiationManager } from "@/lib/negotiation/engine";
import { runMediatorAgent } from "@/lib/agents/mediator";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { sessionId, category, notes } = body;

    const session = NegotiationManager.getSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const recommendation = await runMediatorAgent({
      session,
      category: category || "damaged",
      claimNotes: notes || "Buyer reports item arrived with defects or discrepancy.",
    });

    return NextResponse.json({
      success: true,
      recommendation,
    });
  } catch (err: any) {
    console.error("[Dispute API] Error in mediation:", err);
    return NextResponse.json(
      { error: err.message || "Failed to run dispute mediator" },
      { status: 500 }
    );
  }
}
