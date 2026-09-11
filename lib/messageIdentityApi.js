"use client";

import { apiPath } from "@/lib/apiPath";
import { apiFetch, DataApiError } from "@/lib/dataApi";

/**
 * @returns {Promise<unknown | null>}
 */
export async function fetchAccountMessageIdentity() {
  const res = await apiFetch(apiPath("/api/messages/identity"));
  if (!res.ok) {
    throw new DataApiError("Could not load the account message key", res.status);
  }
  const body = await res.json();
  return body && body.identity ? body.identity : null;
}

/**
 * @param {unknown} identity
 * @param {{ replace?: boolean }} [options]
 */
export async function uploadAccountMessageIdentity(identity, options = {}) {
  const res = await apiFetch(apiPath("/api/messages/identity"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity, replace: options.replace === true }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 409) {
    return { conflict: true, identity: body.identity || null };
  }
  if (!res.ok) {
    throw new DataApiError(body.error || "Could not sync the account message key", res.status);
  }
  return { conflict: false, identity: body.identity || identity };
}
