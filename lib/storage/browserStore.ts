/**
 * Client-Side Browser Storage Helper (lib/storage/browserStore.ts)
 * Persists genuine audit events and negotiation sessions in browser localStorage.
 * SSR-safe, version-controlled, and strictly append-only for audit history.
 */

import type { AuditEntry } from "@/lib/audit/ledger";
import type { NegotiationSession } from "@/lib/negotiation/engine";

const SESSIONS_STORAGE_KEY = "orderly_sessions_v1";
const AUDIT_STORAGE_KEY = "orderly_audit_events_v1";

/**
 * Returns true if running in a browser environment with localStorage available.
 */
function isBrowser(): boolean {
  try {
    return (
      typeof window !== "undefined" &&
      typeof window.localStorage !== "undefined" &&
      window.localStorage !== null
    );
  } catch {
    return false;
  }
}

/**
 * Builds a deterministic identity string for an audit event.
 * Uses the cryptographic entry hash as primary identity; falls back to composite key.
 */
export function getEventIdentity(event: AuditEntry): string {
  if (event.hash && typeof event.hash === "string" && event.hash.length > 0) {
    return event.hash;
  }
  return `${event.id}_${event.timestamp}_${event.actor}_${event.type}_${JSON.stringify(event.payload || {})}`;
}

// ---------------------------------------------------------------------------
// Negotiation Sessions Storage
// ---------------------------------------------------------------------------

/**
 * Retrieves all stored negotiation sessions, sorted by createdAt descending.
 */
export function getStoredSessions(): NegotiationSession[] {
  if (!isBrowser()) return [];

  try {
    const raw = window.localStorage.getItem(SESSIONS_STORAGE_KEY);
    if (!raw) return [];

    const map: Record<string, NegotiationSession> = JSON.parse(raw);
    const sessions = Object.values(map);

    return sessions.sort((a, b) => {
      const timeA = new Date(a.createdAt || a.updatedAt || 0).getTime();
      const timeB = new Date(b.createdAt || b.updatedAt || 0).getTime();
      return timeB - timeA;
    });
  } catch (err) {
    console.warn("[browserStore] Failed to read sessions from localStorage:", err);
    return [];
  }
}

/**
 * Retrieves a single stored negotiation session by ID.
 */
export function getStoredSession(id: string): NegotiationSession | null {
  if (!isBrowser() || !id) return null;

  try {
    const raw = window.localStorage.getItem(SESSIONS_STORAGE_KEY);
    if (!raw) return null;

    const map: Record<string, NegotiationSession> = JSON.parse(raw);
    return map[id] || null;
  } catch (err) {
    console.warn(`[browserStore] Failed to read session ${id} from localStorage:`, err);
    return null;
  }
}

/**
 * Saves or updates a negotiation session in localStorage.
 * Guardrails:
 * 1. Monotonically increasing version check: older version snapshots NEVER overwrite newer ones.
 * 2. Equal version protection: preserves existing server-confirmed state.
 * 3. PayPal capture safeguard: preserves verified PayPal capture status over unverified status.
 */
export function saveStoredSession(session: NegotiationSession): void {
  if (!isBrowser() || !session || !session.id) return;

  try {
    const raw = window.localStorage.getItem(SESSIONS_STORAGE_KEY);
    const map: Record<string, NegotiationSession> = raw ? JSON.parse(raw) : {};

    const existing = map[session.id];
    if (existing) {
      const incomingVersion =
        typeof session.version === "number" && session.version >= 1
          ? session.version
          : Math.max(1, (session.turns?.length || 0) + 1);

      const existingVersion =
        typeof existing.version === "number" && existing.version >= 1
          ? existing.version
          : Math.max(1, (existing.turns?.length || 0) + 1);

      // Rule 1: Stale version rejection
      if (incomingVersion < existingVersion) {
        return;
      }

      // Rule 2: Equal version resolution
      if (incomingVersion === existingVersion) {
        // If existing already has a verified PayPal capture status (COMPLETED, PENDING, etc.)
        // and incoming has null, preserve the existing capture status
        if (existing.paypalCaptureStatus && !session.paypalCaptureStatus) {
          session = {
            ...session,
            paypalCaptureStatus: existing.paypalCaptureStatus,
            paypalCaptureId: existing.paypalCaptureId || session.paypalCaptureId,
          };
        }
      }
    }

    map[session.id] = session;
    window.localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(map));
  } catch (err) {
    console.warn(`[browserStore] Failed to save session ${session?.id} to localStorage:`, err);
  }
}

/**
 * Saves multiple sessions to localStorage with version-controlled safety.
 */
export function saveStoredSessions(sessions: NegotiationSession[]): void {
  if (!isBrowser() || !Array.isArray(sessions) || sessions.length === 0) return;

  for (const s of sessions) {
    if (s && s.id) {
      saveStoredSession(s);
    }
  }
}

// ---------------------------------------------------------------------------
// Audit Events Storage
// ---------------------------------------------------------------------------

/**
 * Retrieves all stored genuine audit events in chronological order.
 */
export function getStoredAuditEvents(): AuditEntry[] {
  if (!isBrowser()) return [];

  try {
    const raw = window.localStorage.getItem(AUDIT_STORAGE_KEY);
    if (!raw) return [];

    const entries: AuditEntry[] = JSON.parse(raw);
    return Array.isArray(entries) ? entries : [];
  } catch (err) {
    console.warn("[browserStore] Failed to read audit events from localStorage:", err);
    return [];
  }
}

/**
 * Appends genuine audit events to the browser-local audit ledger.
 * Deduplicates using cryptographic event identity (event.hash), not event type.
 * Preserves unbroken accumulation across page navigations and refreshes.
 */
export function appendStoredAuditEvents(events: AuditEntry[]): void {
  if (!isBrowser() || !Array.isArray(events) || events.length === 0) return;

  try {
    const existing = getStoredAuditEvents();
    const seenIdentities = new Set<string>();

    for (const entry of existing) {
      seenIdentities.add(getEventIdentity(entry));
    }

    let appended = false;
    for (const newEvent of events) {
      if (!newEvent) continue;

      const identity = getEventIdentity(newEvent);
      if (!seenIdentities.has(identity)) {
        seenIdentities.add(identity);
        existing.push(newEvent);
        appended = true;
      }
    }

    if (appended) {
      window.localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(existing));
    }
  } catch (err) {
    console.warn("[browserStore] Failed to append audit events to localStorage:", err);
  }
}

// ---------------------------------------------------------------------------
// Reset / Clear Storage
// ---------------------------------------------------------------------------

/**
 * Clears all browser-local sessions and audit events (used on Demo Reset).
 */
export function clearBrowserStorage(): void {
  if (!isBrowser()) return;

  try {
    window.localStorage.removeItem(SESSIONS_STORAGE_KEY);
    window.localStorage.removeItem(AUDIT_STORAGE_KEY);
  } catch (err) {
    console.warn("[browserStore] Failed to clear localStorage:", err);
  }
}
