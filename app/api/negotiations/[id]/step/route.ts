import { NextResponse } from "next/server";
import { NegotiationManager } from "@/lib/negotiation/engine";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await NegotiationManager.step(params.id);
    return NextResponse.json({
      success: true,
      session,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to execute negotiation step" },
      { status: 500 }
    );
  }
}
