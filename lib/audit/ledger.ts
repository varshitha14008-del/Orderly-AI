/**
 * Append-only SHA-256 Hash-Chained Audit Ledger
 * Provides tamper-evident logging of every agent turn, policy check, PayPal call, webhook, and human action.
 */

import crypto from "crypto";

export type AuditActor =
  | "buyer_agent"
  | "seller_agent"
  | "policy_engine"
  | "mediator_agent"
  | "human_buyer"
  | "human_merchant"
  | "paypal_api"
  | "webhook"
  | "system";

export interface AuditEntry {
  id: number;
  timestamp: string;
  actor: AuditActor;
  type: string;
  payload: Record<string, any>;
  prev_hash: string;
  hash: string;
}

export interface ChainVerificationResult {
  valid: boolean;
  brokenIndex?: number;
  expectedHash?: string;
  actualHash?: string;
  error?: string;
}

const GENESIS_PREV_HASH = "0000000000000000000000000000000000000000000000000000000000000000";

/**
 * Computes deterministic SHA-256 hash for an audit entry
 */
export function computeEntryHash(
  prevHash: string,
  timestamp: string,
  actor: AuditActor,
  type: string,
  payload: Record<string, any>
): string {
  // Sort keys for canonical JSON serialization
  const canonicalPayload = JSON.stringify(payload, Object.keys(payload).sort());
  const data = `${prevHash}:${timestamp}:${actor}:${type}:${canonicalPayload}`;
  return crypto.createHash("sha256").update(data).digest("hex");
}

class AuditLedger {
  private chain: AuditEntry[] = [];

  constructor() {
    this.reset();
  }

  /**
   * Resets ledger and creates genesis block
   */
  public reset(): void {
    this.chain = [];
    const timestamp = new Date().toISOString();
    const actor: AuditActor = "system";
    const type = "GENESIS_BLOCK";
    const payload = { message: "Orderly-AI Tamper-Evident Audit Ledger Initialized" };
    const hash = computeEntryHash(GENESIS_PREV_HASH, timestamp, actor, type, payload);

    this.chain.push({
      id: 1,
      timestamp,
      actor,
      type,
      payload,
      prev_hash: GENESIS_PREV_HASH,
      hash,
    });
  }

  /**
   * Appends an audit event to the ledger with hash chaining
   */
  public record(actor: AuditActor, type: string, payload: Record<string, any>): AuditEntry {
    const lastEntry = this.chain[this.chain.length - 1];
    const prevHash = lastEntry ? lastEntry.hash : GENESIS_PREV_HASH;
    const timestamp = new Date().toISOString();
    const id = this.chain.length + 1;

    const hash = computeEntryHash(prevHash, timestamp, actor, type, payload);

    const entry: AuditEntry = {
      id,
      timestamp,
      actor,
      type,
      payload,
      prev_hash: prevHash,
      hash,
    };

    this.chain.push(entry);
    return entry;
  }

  /**
   * Returns copy of all audit entries
   */
  public getEntries(): AuditEntry[] {
    return [...this.chain];
  }

  /**
   * Verifies the cryptographic integrity of the entire chain
   */
  public verifyIntegrity(entries = this.chain): ChainVerificationResult {
    if (entries.length === 0) {
      return { valid: false, error: "Audit chain is empty" };
    }

    for (let i = 0; i < entries.length; i++) {
      const current = entries[i];
      const expectedPrevHash = i === 0 ? GENESIS_PREV_HASH : entries[i - 1].hash;

      // 1. Check prev_hash linkage
      if (current.prev_hash !== expectedPrevHash) {
        return {
          valid: false,
          brokenIndex: i,
          expectedHash: expectedPrevHash,
          actualHash: current.prev_hash,
          error: `Broken linkage at entry #${current.id}: prev_hash does not match preceding entry hash`,
        };
      }

      // 2. Check hash recalculation
      const calculatedHash = computeEntryHash(
        current.prev_hash,
        current.timestamp,
        current.actor,
        current.type,
        current.payload
      );

      if (current.hash !== calculatedHash) {
        return {
          valid: false,
          brokenIndex: i,
          expectedHash: calculatedHash,
          actualHash: current.hash,
          error: `Tamper detected at entry #${current.id}: payload or hash modified`,
        };
      }
    }

    return { valid: true };
  }
}

// Global singleton instance
export const auditLedger = new AuditLedger();
