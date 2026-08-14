import { NextResponse } from "next/server";
import { appUrl, safeReturnPath } from "@/lib/server/appUrl";
import { upsertPendingProfile } from "@/lib/server/collectionsDb";
import { setSessionCookie } from "@/lib/server/cookies";
import { notifyAdminsOfPendingUser } from "@/lib/server/emailNotify";
import { createSession } from "@/lib/server/session";
import { verifyState } from "@/lib/server/signState";
import { getRolesForEmail, upsertUser } from "@/lib/server/users";
import { isEmailAllowed } from "@/lib/server/whitelist";
import { exchangeCodeForTokens, verifyIdToken } from "@/lib/server/verifyGoogle";
import { withApi } from "@/lib/server/withApi";

export const dynamic = "force-dynamic";

async function handler(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const stateToken = searchParams.get("state");
  const oauthError = searchParams.get("error");

  if (oauthError) {
    return NextResponse.redirect(appUrl(`/login/?authError=${encodeURIComponent(oauthError)}`));
  }

  if (!code || !stateToken) {
    return NextResponse.redirect(appUrl("/login/?authError=missing_code"));
  }

  const state = verifyState(stateToken);
  if (!state) {
    return NextResponse.redirect(appUrl("/login/?authError=invalid_state"));
  }

  const tokens = await exchangeCodeForTokens(code);
  if (!tokens.id_token) {
    throw new Error("Missing id_token");
  }

  const profile = await verifyIdToken(tokens.id_token);
  if (!profile.email) {
    throw new Error("Missing email");
  }

  const allowed = await isEmailAllowed(profile.email);
  if (!allowed) {
    await upsertUser({
      email: profile.email,
      name: profile.name,
      avatar: profile.picture,
      approved: false,
    });
    try {
      await upsertPendingProfile({
        email: profile.email,
        name: profile.name,
        avatar: profile.picture,
      });
    } catch (err) {
      console.warn("Pending profile save failed:", err);
    }
    notifyAdminsOfPendingUser({
      email: profile.email,
      name: profile.name,
    }).catch((err) => {
      console.warn("Pending-user admin notify failed:", err);
    });
    return NextResponse.redirect(appUrl("/login/?notAllowed=1"));
  }

  const user = await upsertUser({
    email: profile.email,
    name: profile.name,
    avatar: profile.picture,
    approved: true,
  });

  const roles = await getRolesForEmail(profile.email);
  const { sid } = await createSession({
    uid: user.id,
    email: user.email,
    name: user.name || profile.name,
    avatar: user.avatar || profile.picture,
    roles,
    sessionId: typeof state.sessionId === "string" ? state.sessionId : "",
    needsProfileSync: true,
  });

  const returnTo = safeReturnPath(
    typeof state.returnTo === "string" ? state.returnTo : "/",
  );
  const response = NextResponse.redirect(appUrl(returnTo));
  setSessionCookie(response, sid);
  return response;
}

export const GET = withApi(handler, { auth: false, rateLimits: ["ip"] });
