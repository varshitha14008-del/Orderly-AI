import { NextResponse } from "next/server";
import { NegotiationManager } from "@/lib/negotiation/engine";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = NegotiationManager.getSession(params.id);
  if (!session) {
    return NextResponse.json({ error: "Negotiation session not found" }, { status: 404 });
  }

  return NextResponse.json({ session });
}
