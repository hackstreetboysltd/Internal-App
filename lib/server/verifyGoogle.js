/**
 * Exchange OAuth authorization code for tokens.
 * @param {string} code
 */
export async function exchangeCodeForTokens(code) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Google OAuth is not configured");
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Token exchange failed: ${detail}`);
  }

  return res.json();
}

/**
 * Verify Google ID token and return normalized profile.
 * @param {string} idToken
 */
export async function verifyIdToken(idToken) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error("GOOGLE_CLIENT_ID is not set");
  }

  const res = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
  );
  if (!res.ok) {
    throw new Error("Invalid id_token");
  }

  const payload = await res.json();
  if (payload.aud !== clientId) {
    throw new Error("id_token audience mismatch");
  }
  if (payload.exp && Number(payload.exp) * 1000 < Date.now()) {
    throw new Error("id_token expired");
  }

  const hd = process.env.GOOGLE_HD;
  if (hd && payload.hd && payload.hd !== hd) {
    throw new Error("Hosted domain mismatch");
  }

  if (payload.email_verified === "false" || payload.email_verified === false) {
    throw new Error("Email not verified");
  }

  return {
    email: payload.email,
    name: payload.name || payload.email?.split("@")[0] || "A Team Member",
    picture: payload.picture || "",
    sub: payload.sub,
    hd: payload.hd || null,
  };
}
