import { normalizeEmail } from "@/lib/normalize";
import { filterMessageItemsForActor } from "@/lib/channels";

function isSealedWrap(w) {
  return !!(w && (w.type === "ecdh" || w.type === "hybrid"));
}

/**
 * Keep only the actor's sealed wrap on each message (server-side redaction).
 *
 * @param {unknown[]} messages
 * @param {{ email?: string } | null | undefined} actor
 * @returns {unknown[]}
 */
export function redactMessageWrapsForActor(messages, actor) {
  const email = normalizeEmail(actor && actor.email);
  if (!Array.isArray(messages)) return messages;
  if (!email) {
    return messages.map((m) => {
      if (!m || typeof m !== "object" || !Array.isArray(m.wrappedKeys)) return m;
      return { ...m, wrappedKeys: [] };
    });
  }
  return messages.map((m) => {
    if (!m || typeof m !== "object" || !Array.isArray(m.wrappedKeys)) return m;
    const hasSealed = m.wrappedKeys.some(isSealedWrap);
    if (!hasSealed) return m;
    return {
      ...m,
      wrappedKeys: m.wrappedKeys.filter(
        (w) => isSealedWrap(w) && normalizeEmail(w.email) === email,
      ),
    };
  });
}

/**
 * Membership filter + wrap redaction for list/delta/GET-by-id.
 *
 * @param {unknown[]} items
 * @param {{ email?: string } | null | undefined} actor
 * @param {unknown[]} channels
 * @returns {unknown[]}
 */
export function filterAndRedactMessagesForActor(items, actor, channels) {
  const visible = filterMessageItemsForActor(items, actor, channels);
  return redactMessageWrapsForActor(visible, actor);
}
