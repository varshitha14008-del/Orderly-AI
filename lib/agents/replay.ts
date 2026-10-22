/**
 * Replay & Recording Manager for Agent LLM Responses
 * Supports REPLAY_MODE=true for zero-quota video recording and deterministic demos.
 */

import fs from "fs";
import path from "path";
import { AgentProposal } from "../policy/types";

const REPLAY_FILE = path.resolve(process.cwd(), "docs", "recorded_negotiation.json");

export interface RecordedTurn {
  role: "buyer" | "seller" | "mediator";
  round: number;
  proposal: AgentProposal;
}

export function isReplayMode(): boolean {
  return process.env.REPLAY_MODE === "true";
}

let memoryReplayCache: RecordedTurn[] = [
  {
    role: "buyer",
    round: 1,
    proposal: {
      action: "offer",
      price: 38.0,
      rationale: "Initial offer for ergonomic mechanical keyboard, considering entry market pricing.",
    },
  },
  {
    role: "seller",
    round: 1,
    proposal: {
      action: "counter",
      price: 65.0,
      rationale: "List price is $75.00 for premium mechanical switches; counter-offering $65.00.",
    },
  },
  {
    role: "buyer",
    round: 2,
    proposal: {
      action: "counter",
      price: 45.0,
      rationale: "Increasing offer to $45.00, which reflects maximum budget headroom.",
    },
  },
  {
    role: "seller",
    round: 2,
    proposal: {
      action: "counter",
      price: 52.0,
      rationale: "Meeting in the middle at $52.00, keeping margins healthy above floor price.",
    },
  },
  {
    role: "buyer",
    round: 3,
    proposal: {
      action: "counter",
      price: 48.0,
      rationale: "Final stretch to $48.00 if we can close deal immediately.",
    },
  },
  {
    role: "seller",
    round: 3,
    proposal: {
      action: "accept",
      price: 48.0,
      rationale: "Accepted $48.00. The price exceeds our $45.00 floor and secures the sale.",
    },
  },
];

export function getRecordedProposal(role: "buyer" | "seller", round: number): AgentProposal | null {
  // Check file first if exists
  if (fs.existsSync(REPLAY_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(REPLAY_FILE, "utf-8")) as RecordedTurn[];
      const found = data.find((t) => t.role === role && t.round === round);
      if (found) return found.proposal;
    } catch {
      // Fallback to memory cache
    }
  }

  const inMem = memoryReplayCache.find((t) => t.role === role && t.round === round);
  return inMem ? inMem.proposal : null;
}

export function saveRecordedTurn(role: "buyer" | "seller", round: number, proposal: AgentProposal): void {
  try {
    let list: RecordedTurn[] = [];
    if (fs.existsSync(REPLAY_FILE)) {
      list = JSON.parse(fs.readFileSync(REPLAY_FILE, "utf-8"));
    }
    const idx = list.findIndex((t) => t.role === role && t.round === round);
    if (idx !== -1) {
      list[idx].proposal = proposal;
    } else {
      list.push({ role, round, proposal });
    }
    fs.writeFileSync(REPLAY_FILE, JSON.stringify(list, null, 2));
  } catch (err: any) {
    console.warn("[ReplayCache] Could not persist to disk:", err.message);
  }
}
