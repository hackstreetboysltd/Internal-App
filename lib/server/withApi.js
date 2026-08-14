import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { readSessionCookie } from "@/lib/server/cookies";
import { enforceRateLimits } from "@/lib/server/rateLimit";
import { logApiRequest } from "@/lib/server/requestLogger";
import { getClientIp, getQueryObject, getRequestPath } from "@/lib/server/requestMeta";
import { touchSession } from "@/lib/server/session";

/**
 * @typedef {Object} ApiContext
 * @property {Record<string, unknown> | null} session
 * @property {string} requestId
 */

/**
 * @typedef {Object} WithApiOptions
 * @property {boolean} [auth]
 * @property {boolean} [admin]
 * @property {Array<'ip' | 'user' | 'sync' | 'activity' | 'write'>} [rateLimits]
 * @property {{ collection?: string }} [rateLimitExtra]
 */

/**
 * Wrap an API route handler with rate limiting, auth, and request logging.
 * @param {(request: import('next/server').NextRequest, context: unknown, api: ApiContext) => Promise<Response>} handler
 * @param {WithApiOptions} [options]
 */
export function withApi(handler, options = {}) {
  const {
    auth = false,
    admin = false,
    rateLimits = ["ip"],
    rateLimitExtra = {},
  } = options;

  return async function wrapped(request, routeContext) {
    const started = Date.now();
    const requestId = randomUUID();
    const path = getRequestPath(request);
    const query = getQueryObject(request);
    const ip = getClientIp(request);
    const userAgent = request.headers.get("user-agent") || "";

    /** @type {Record<string, unknown> | null} */
    let session = null;
    let rateLimited = false;

    const baseLog = () => ({
      requestId,
      method: request.method,
      path,
      query,
      ip,
      userAgent,
      uid: session?.uid ? String(session.uid) : null,
      email: session?.email ? String(session.email) : null,
      sessionId: session?.sessionId ? String(session.sessionId) : null,
      rateLimited,
      error: null,
    });

    const respond = async (response, status, error = null) => {
      await logApiRequest({
        ...baseLog(),
        status,
        durationMs: Date.now() - started,
        error,
      });
      return response;
    };

    try {
      const ipOnlyFirst = rateLimits.filter((s) => s === "ip");
      const rl = await enforceRateLimits(request, session, ipOnlyFirst, rateLimitExtra);
      if (!rl.allowed) {
        rateLimited = true;
        const response = NextResponse.json({ error: "Too many requests" }, { status: 429 });
        response.headers.set("Retry-After", String(rl.retryAfter));
        return respond(response, 429);
      }

      if (auth || admin) {
        const sid = readSessionCookie(request);
        session = sid ? await touchSession(sid) : null;
        if (!session) {
          return respond(NextResponse.json({ error: "Unauthorized" }, { status: 401 }), 401);
        }
        if (admin && !(session.roles || []).includes("admin")) {
          return respond(NextResponse.json({ error: "Forbidden" }, { status: 403 }), 403);
        }

        const userScopes = rateLimits.filter((s) => s !== "ip");
        if (userScopes.length > 0) {
          const userRl = await enforceRateLimits(request, session, userScopes, rateLimitExtra);
          if (!userRl.allowed) {
            rateLimited = true;
            const response = NextResponse.json({ error: "Too many requests" }, { status: 429 });
            response.headers.set("Retry-After", String(userRl.retryAfter));
            return respond(response, 429);
          }
        }
      }

      const response = await handler(request, routeContext, { session, requestId });
      return respond(response, response.status);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`API ${path} failed:`, err);
      return respond(
        NextResponse.json({ error: "Internal server error" }, { status: 500 }),
        500,
        message,
      );
    }
  };
}
