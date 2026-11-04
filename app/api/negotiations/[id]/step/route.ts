import { NextResponse } from "next/server";
import { NegotiationManager } from "@/lib/negotiation/engine";
import { captureRequestAuditEvents } from "@/lib/audit/ledger";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json().catch(() => ({}));

    // If browser supplied a session snapshot, safely restore it through validated monotonic restoration
    if (body?.session) {
      if (typeof body.session.id === "string" && body.session.id !== params.id) {
        return NextResponse.json(
          { success: false, error: `Session snapshot ID mismatch: expected ${params.id}, got ${body.session.id}` },
          { status: 400 }
        );
      }
      NegotiationManager.restoreSession(body.session);
    }

    const { result: session, events } = await captureRequestAuditEvents(async () => {
      return await NegotiationManager.step(params.id);
    });

    return NextResponse.json({
      success: true,
      session,
      events,
    });
  } catch (err: any) {
    console.error(`[Step API] Error executing turn for session ${params.id}:`, err.message);
    const isValidationOrStaleError =
      err.message?.includes("snapshot") ||
      err.message?.includes("Illegal state transition") ||
      err.message?.includes("not found");

    return NextResponse.json(
      { success: false, error: err.message || "Failed to execute negotiation step" },
      { status: isValidationOrStaleError ? 400 : 500 }
    );
  }
}
