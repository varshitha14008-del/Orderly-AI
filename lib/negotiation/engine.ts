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

export const VALID_NEGOTIATION_STATUSES: NegotiationStatus[] = [
  "INITIAL",
  "IN_PROGRESS",
  "AGREED",
  "AWAITING_HUMAN_APPROVAL",
  "REJECTED",
  "COMPLETED",
];

export function isAllowedStateTransition(from: NegotiationStatus, to: NegotiationStatus): boolean {
  if (from === to) return true;

  switch (from) {
    case "INITIAL":
      return (
        to === "IN_PROGRESS" ||
        to === "AGREED" ||
        to === "AWAITING_HUMAN_APPROVAL" ||
        to === "REJECTED" ||
        to === "COMPLETED"
      );
    case "IN_PROGRESS":
      return (
        to === "IN_PROGRESS" ||
        to === "AGREED" ||
        to === "AWAITING_HUMAN_APPROVAL" ||
        to === "REJECTED" ||
        to === "COMPLETED"
      );
    case "AGREED":
      return to === "AWAITING_HUMAN_APPROVAL" || to === "COMPLETED";
    case "AWAITING_HUMAN_APPROVAL":
      return to === "AGREED" || to === "COMPLETED" || to === "REJECTED";
    case "REJECTED":
      return false;
    case "COMPLETED":
      return false;
    default:
      return false;
  }
}

export function validateSessionSnapshot(snapshot: any): asserts snapshot is NegotiationSession {
  if (!snapshot || typeof snapshot !== "object") {
    throw new Error("Invalid session snapshot: must be an object");
  }

  if (typeof snapshot.id !== "string" || !snapshot.id.trim()) {
    throw new Error("Invalid session snapshot: missing or invalid session ID");
  }

  if (
    !snapshot.product ||
    typeof snapshot.product !== "object" ||
    typeof snapshot.product.id !== "string" ||
    typeof snapshot.product.title !== "string" ||
    typeof snapshot.product.listPrice !== "number" ||
    isNaN(snapshot.product.listPrice)
  ) {
    throw new Error("Invalid session snapshot: missing or invalid product details");
  }

  if (
    !snapshot.buyerPolicy ||
    typeof snapshot.buyerPolicy !== "object" ||
    typeof snapshot.buyerPolicy.max_price !== "number" ||
    isNaN(snapshot.buyerPolicy.max_price)
  ) {
    throw new Error("Invalid session snapshot: missing or invalid buyer policy");
  }

  if (
    !snapshot.merchantPolicy ||
    typeof snapshot.merchantPolicy !== "object" ||
    typeof snapshot.merchantPolicy.floor_price !== "number" ||
    isNaN(snapshot.merchantPolicy.floor_price)
  ) {
    throw new Error("Invalid session snapshot: missing or invalid merchant policy");
  }

  if (
    typeof snapshot.currentRound !== "number" ||
    snapshot.currentRound < 1 ||
    typeof snapshot.maxRounds !== "number" ||
    snapshot.maxRounds < 1
  ) {
    throw new Error("Invalid session snapshot: invalid round numbers");
  }

  if (!VALID_NEGOTIATION_STATUSES.includes(snapshot.status)) {
    throw new Error(`Invalid session snapshot: unknown status '${snapshot.status}'`);
  }

  if (!Array.isArray(snapshot.turns)) {
    throw new Error("Invalid session snapshot: turns must be an array");
  }

  if (
    snapshot.version !== undefined &&
    (typeof snapshot.version !== "number" || isNaN(snapshot.version) || snapshot.version < 1)
  ) {
    throw new Error("Invalid session snapshot: version must be a positive number if provided");
  }
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
  paypalCaptureStatus?: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

// In-memory store for negotiation sessions
const globalForSessions = globalThis as unknown as {
  __orderlySessionsMap?: Map<string, NegotiationSession>;
};

const sessionsMap: Map<string, NegotiationSession> =
  globalForSessions.__orderlySessionsMap ?? new Map<string, NegotiationSession>();

globalForSessions.__orderlySessionsMap = sessionsMap;

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
      paypalCaptureStatus: null,
      version: 1,
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

  /**
   * Restores a negotiation session from a browser-provided snapshot into memory.
   * Validates session ID, required fields, and allowed state transitions.
   * Enforces strict monotonic versioning to guarantee a stale snapshot never overwrites a newer version.
   */
  static restoreSession(snapshot: NegotiationSession): NegotiationSession {
    validateSessionSnapshot(snapshot);

    const incomingVersion =
      typeof snapshot.version === "number" && snapshot.version >= 1
        ? snapshot.version
        : Math.max(1, (snapshot.turns?.length || 0) + 1);

    const normalizedSnapshot: NegotiationSession = {
      ...snapshot,
      version: incomingVersion,
      paypalCaptureStatus: snapshot.paypalCaptureStatus ?? null,
      updatedAt: snapshot.updatedAt || new Date().toISOString(),
      createdAt: snapshot.createdAt || new Date().toISOString(),
    };

    const existing = sessionsMap.get(normalizedSnapshot.id);
    if (!existing) {
      sessionsMap.set(normalizedSnapshot.id, normalizedSnapshot);
      return normalizedSnapshot;
    }

    const existingVersion =
      typeof existing.version === "number" && existing.version >= 1
        ? existing.version
        : Math.max(1, (existing.turns?.length || 0) + 1);

    // 1. Monotonic Version Guard: Stale snapshot must never overwrite newer version
    if (incomingVersion < existingVersion) {
      throw new Error(
        `Stale session snapshot rejected for ${normalizedSnapshot.id}: snapshot version ${incomingVersion} is older than server version ${existingVersion}`
      );
    }

    // 2. State Transition Guard: Disallow invalid transitions or terminal rollbacks
    if (!isAllowedStateTransition(existing.status, normalizedSnapshot.status)) {
      throw new Error(
        `Illegal state transition for session ${normalizedSnapshot.id}: cannot transition from '${existing.status}' to '${normalizedSnapshot.status}'`
      );
    }

    // 3. Identical version: equal versions represent the same logical state; always preserve existing server session
    if (incomingVersion === existingVersion) {
      return existing;
    }

    // 4. Accept newer snapshot
    sessionsMap.set(normalizedSnapshot.id, normalizedSnapshot);
    return normalizedSnapshot;
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

    session.version = (session.version ?? 1) + 1;
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
      session.version = (session.version ?? 1) + 1;
      session.updatedAt = new Date().toISOString();
      auditLedger.record("paypal_api", "ORDER_ATTACHED_TO_SESSION", { sessionId, orderId });
    }
  }

  static attachPayPalCapture(sessionId: string, captureId: string, captureStatus: string = "COMPLETED"): void {
    const session = sessionsMap.get(sessionId);
    if (session) {
      session.paypalCaptureId = captureId;
      session.paypalCaptureStatus = captureStatus;
      session.status = "COMPLETED";
      session.version = (session.version ?? 1) + 1;
      session.updatedAt = new Date().toISOString();
      auditLedger.record("paypal_api", "CAPTURE_ATTACHED_TO_SESSION", { sessionId, captureId, captureStatus });
    }
  }

  static resetAll(): void {
    sessionsMap.clear();
    auditLedger.reset();
  }
}
