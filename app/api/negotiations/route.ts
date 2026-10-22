import { NextResponse } from "next/server";
import { NegotiationManager } from "@/lib/negotiation/engine";
import { SEEDED_PRODUCTS } from "@/lib/negotiation/catalog";

export async function GET() {
  const sessions = NegotiationManager.getAllSessions();
  return NextResponse.json({
    sessions,
    products: SEEDED_PRODUCTS,
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { productId, buyerPolicy, merchantPolicy } = body;

    const session = NegotiationManager.createSession(productId, buyerPolicy, merchantPolicy);

    return NextResponse.json({
      success: true,
      session,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to create negotiation session" },
      { status: 400 }
    );
  }
}
