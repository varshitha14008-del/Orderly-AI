/**
 * Negotiation Engine
 * Manages turn-based multi-round negotiation sessions between Buyer Agent and Seller Agent.
 */

import { AgentProposal, BuyerPolicy, MerchantPolicy } from "../policy/types";
import { MarketplaceProduct, SEEDED_PRODUCTS, DEFAULT_BUYER_POLICY, DEFAULT_MERCHANT_POLICY } from "./catalog";
import { runBuyerAgent } from "../agents/buyer";
import { runSellerAgent } from "../agents/seller";
import { auditLedger } from "../audit/ledger";

export interface NegotiationTurnRecord {
  turnId: number;
  round: number;
  role: "buyer" | "seller";
  proposal: AgentProposal;
  fallback: boolean;
  requiresHumanApproval?: boolean;
  timestamp: string;
}

export type NegotiationStatus =
  | "INITIAL"
  | "IN_PROGRESS"
  | "AGREED"
  | "AWAITING_HUMAN_APPROVAL"
  | "REJECTED"
  | "COMPLETED";

export interface NegotiationSession {
  id: string;
  product: MarketplaceProduct;
  buyerPolicy: BuyerPolicy;
  merchantPolicy: MerchantPolicy;
  currentRound: number;
  maxRounds: number;
  status: NegotiationStatus;
  turns: NegotiationTurnRecord[];
  agreedPrice: number | null;
  paypalOrderId: string | null;
  paypalCaptureId: string | null;
  createdAt: string;
  updatedAt: string;
}

// In-memory store for negotiation sessions
const sessionsMap = new Map<string, NegotiationSession>();

export class NegotiationManager {
  /**
   * Initializes a new negotiation session
   */
  static createSession(
    productId = "prod-kb-01",
    buyerPolicy?: Partial<BuyerPolicy>,
    merchantPolicy?: Partial<MerchantPolicy>
  ): NegotiationSession {
    const product = SEEDED_PRODUCTS.find((p) => p.id === productId) || SEEDED_PRODUCTS[0];
    const id = `neg_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

    const mergedBuyerPolicy: BuyerPolicy = {
      ...DEFAULT_BUYER_POLICY,
      ...(buyerPolicy || {}),
    };

    const mergedMerchantPolicy: MerchantPolicy = {
      ...DEFAULT_MERCHANT_POLICY,
      list_price: product.listPrice,
      floor_price: product.floorPrice,
      ...(merchantPolicy || {}),
    };

    const session: NegotiationSession = {
      id,
      product,
      buyerPolicy: mergedBuyerPolicy,
      merchantPolicy: mergedMerchantPolicy,
      currentRound: 1,
      maxRounds: 4,
      status: "INITIAL",
      turns: [],
      agreedPrice: null,
      paypalOrderId: null,
      paypalCaptureId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    sessionsMap.set(id, session);

    auditLedger.record("system", "NEGOTIATION_INITIALIZED", {
      sessionId: id,
      productId: product.id,
      item: product.title,
      maxPrice: mergedBuyerPolicy.max_price,
      floorPrice: mergedMerchantPolicy.floor_price,
    });

    return session;
  }

  static getSession(id: string): NegotiationSession | undefined {
    return sessionsMap.get(id);
  }

  static getAllSessions(): NegotiationSession[] {
    return Array.from(sessionsMap.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  /**
   * Executes the next turn in the negotiation session
   */
  static async step(sessionId: string): Promise<NegotiationSession> {
    const session = sessionsMap.get(sessionId);
    if (!session) {
      throw new Error(`Negotiation session ${sessionId} not found`);
    }

    if (session.status === "AGREED" || session.status === "COMPLETED" || session.status === "REJECTED") {
      return session;
    }

    session.status = "IN_PROGRESS";
    const history = session.turns.map((t) => ({ role: t.role, proposal: t.proposal }));

    // Determine who moves: if turns is even, Buyer's move; if odd, Seller's move
    const isBuyerTurn = session.turns.length % 2 === 0;

    if (isBuyerTurn) {
      // Buyer moves
      const buyerResult = await runBuyerAgent({
        item: {
          id: session.product.id,
          title: session.product.title,
          description: session.product.description,
          listPrice: session.product.listPrice,
        },
        buyerPolicy: session.buyerPolicy,
        negotiationHistory: history,
        currentRound: session.currentRound,
        maxRounds: session.maxRounds,
      });

      const turnRecord: NegotiationTurnRecord = {
        turnId: session.turns.length + 1,
        round: session.currentRound,
        role: "buyer",
        proposal: buyerResult.proposal,
        fallback: buyerResult.fallback,
        requiresHumanApproval: buyerResult.validation.requiresHumanApproval,
        timestamp: new Date().toISOString(),
      };

      session.turns.push(turnRecord);

      // Check if buyer accepted
      if (buyerResult.proposal.action === "accept") {
        session.status = buyerResult.validation.requiresHumanApproval
          ? "AWAITING_HUMAN_APPROVAL"
          : "AGREED";
        session.agreedPrice = buyerResult.proposal.price;

        auditLedger.record("buyer_agent", "NEGOTIATION_AGREEMENT_REACHED", {
          sessionId,
          agreedPrice: session.agreedPrice,
          requiresHumanApproval: buyerResult.validation.requiresHumanApproval,
        });
      } else if (buyerResult.proposal.action === "reject") {
        session.status = "REJECTED";
        auditLedger.record("buyer_agent", "NEGOTIATION_TERMINATED", { sessionId, reason: "Buyer rejected" });
      }
    } else {
      // Seller moves
      const sellerResult = await runSellerAgent({
        item: {
          id: session.product.id,
          title: session.product.title,
          description: session.product.description,
          listPrice: session.product.listPrice,
        },
        merchantPolicy: session.merchantPolicy,
        negotiationHistory: history,
        currentRound: session.currentRound,
        maxRounds: session.maxRounds,
      });

      const turnRecord: NegotiationTurnRecord = {
        turnId: session.turns.length + 1,
        round: session.currentRound,
        role: "seller",
        proposal: sellerResult.proposal,
        fallback: sellerResult.fallback,
        timestamp: new Date().toISOString(),
      };

      session.turns.push(turnRecord);

      // Check if seller accepted
      if (sellerResult.proposal.action === "accept") {
        const lastBuyerOffer = session.turns.slice(-2, -1)[0]?.proposal.price || sellerResult.proposal.price;
        session.agreedPrice = lastBuyerOffer;
        session.status = session.agreedPrice > session.buyerPolicy.ask_human_above
          ? "AWAITING_HUMAN_APPROVAL"
          : "AGREED";

        auditLedger.record("seller_agent", "NEGOTIATION_AGREEMENT_REACHED", {
          sessionId,
          agreedPrice: session.agreedPrice,
        });
      } else if (sellerResult.proposal.action === "reject") {
        session.status = "REJECTED";
        auditLedger.record("seller_agent", "NEGOTIATION_TERMINATED", { sessionId, reason: "Seller rejected" });
      }

      // Completed a full round (buyer + seller)
      if (session.status === "IN_PROGRESS") {
        if (session.currentRound >= session.maxRounds) {
          session.status = "REJECTED";
          auditLedger.record("system", "MAX_ROUNDS_REACHED_NO_DEAL", { sessionId });
        } else {
          session.currentRound += 1;
        }
      }
    }

    session.updatedAt = new Date().toISOString();
    return session;
  }

  /**
   * Runs the negotiation automatically until agreement or completion
   */
  static async runToEnd(sessionId: string): Promise<NegotiationSession> {
    let session = sessionsMap.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    while (session.status === "INITIAL" || session.status === "IN_PROGRESS") {
      session = await this.step(sessionId);
    }

    return session;
  }

  static attachPayPalOrder(sessionId: string, orderId: string): void {
    const session = sessionsMap.get(sessionId);
    if (session) {
      session.paypalOrderId = orderId;
      session.updatedAt = new Date().toISOString();
      auditLedger.record("paypal_api", "ORDER_ATTACHED_TO_SESSION", { sessionId, orderId });
    }
  }

  static attachPayPalCapture(sessionId: string, captureId: string): void {
    const session = sessionsMap.get(sessionId);
    if (session) {
      session.paypalCaptureId = captureId;
      session.status = "COMPLETED";
      session.updatedAt = new Date().toISOString();
      auditLedger.record("paypal_api", "CAPTURE_ATTACHED_TO_SESSION", { sessionId, captureId });
    }
  }

  static resetAll(): void {
    sessionsMap.clear();
    auditLedger.reset();
  }
}
