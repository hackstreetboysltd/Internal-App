import { randomUUID } from "crypto";
import { signState } from "@/lib/server/signState";
import { withApi } from "@/lib/server/withApi";

export const dynamic = "force-dynamic";

async function handler(request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return Response.json({ error: "Google OAuth is not configured" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const returnTo = searchParams.get("returnTo") || "/";
  const sessionId = searchParams.get("sessionId") || "";

  const state = signState({
    returnTo,
    sessionId,
    nonce: randomUUID(),
    exp: Math.floor(Date.now() / 1000) + 600,
  });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid profile email",
    prompt: "select_account",
    access_type: "offline",
    state,
  });

  const hd = process.env.GOOGLE_HD;
  if (hd) {
    params.set("hd", hd);
  }

  return Response.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
  );
}

export const GET = withApi(handler, { auth: false, rateLimits: ["ip"] });
