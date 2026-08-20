import { NextResponse } from "next/server";
import { setSessionCookie } from "@/lib/server/cookies";
import { upsertLoginProfile } from "@/lib/server/collectionsDb";
import { patchSession, rotateSession, sessionNeedsRotation } from "@/lib/server/session";
import { getRolesForEmail } from "@/lib/server/users";
import { withApi } from "@/lib/server/withApi";

export const dynamic = "force-dynamic";

async function handler(_request, _ctx, { session }) {
  let activeSession = session;
  let rotatedSid = null;
  const syncProfile = activeSession?.needsProfileSync === true;
  /** @type {{ name: string, email: string, avatar: string } | null} */
  let syncedProfile = null;

  if (activeSession?.sid && activeSession?.email) {
    try {
      const roles = await getRolesForEmail(String(activeSession.email));
      if (JSON.stringify(roles) !== JSON.stringify(activeSession.roles || [])) {
        activeSession = await patchSession(String(activeSession.sid), { roles }) || activeSession;
      }
    } catch (err) {
      console.warn("Session role refresh failed:", err);
    }
  }

  if (syncProfile && activeSession?.email) {
    try {
      syncedProfile = await upsertLoginProfile({
        email: activeSession.email,
        name: activeSession.name,
        avatar: activeSession.avatar,
      });
    } catch (err) {
      console.warn("Profile sync skipped:", err);
    }

    if (activeSession?.sid) {
      /** @type {Record<string, unknown>} */
      const patch = { needsProfileSync: false };
      if (syncedProfile?.name) patch.name = syncedProfile.name;
      activeSession = await patchSession(activeSession.sid, patch) || activeSession;
    }
  }

  if (activeSession?.sid && sessionNeedsRotation(activeSession)) {
    const rotated = await rotateSession(String(activeSession.sid));
    if (rotated) {
      activeSession = rotated.session;
      rotatedSid = rotated.sid;
    }
  }

  const response = NextResponse.json({
    user: {
      uid: activeSession.uid,
      email: activeSession.email,
      name: syncedProfile?.name || activeSession.name,
      avatar: activeSession.avatar,
      roles: activeSession.roles || ["user"],
      sessionId: activeSession.sessionId || "",
    },
    syncProfile: false,
    rotated: !!rotatedSid,
  });

  if (rotatedSid) {
    setSessionCookie(response, rotatedSid);
  }

  return response;
}

export const GET = withApi(handler, { auth: true, rateLimits: ["ip", "user"] });
