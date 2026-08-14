import { get, save } from "@/lib/portalApi";

/**
 * Sync Google profile into Postgres profile collection after server OAuth login.
 * @param {{ email: string, name?: string, avatar?: string }} user
 */
export async function syncProfileOnLogin(user) {
  if (!user?.email) return;

  let sessionName = user.name || user.email.split("@")[0] || "A Team Member";

  try {
    let profiles = await get("profile", { admin: false });
    if (!Array.isArray(profiles)) profiles = [];

    const idx = profiles.findIndex(
      (p) => p.email && p.email.toLowerCase() === user.email.toLowerCase(),
    );

    if (idx === -1) {
      profiles.push({
        email: user.email,
        name: user.name,
        avatar: user.avatar || "",
        role: "Software Engineer",
        department: "Development",
        bio: "Hi, I am new to the portal! Connected via Google authentication.",
      });
    } else {
      if (user.avatar) profiles[idx].avatar = user.avatar;
      if (!profiles[idx].name) {
        profiles[idx].name = user.name;
      } else {
        sessionName = profiles[idx].name;
        const googleName = (user.name || "").trim();
        const profileName = (profiles[idx].name || "").trim();
        if (googleName && googleName.toLowerCase() !== profileName.toLowerCase()) {
          const aliases = Array.isArray(profiles[idx].nameAliases) ? profiles[idx].nameAliases : [];
          if (!aliases.some((a) => (a || "").trim().toLowerCase() === googleName.toLowerCase())) {
            aliases.push(googleName);
            profiles[idx].nameAliases = aliases;
          }
        }
      }
    }

    await save("profile", profiles, { admin: false });
  } catch (e) {
    console.warn("Profile sync skipped:", e);
  }

  return {
    name: sessionName,
    email: user.email,
    avatar: user.avatar || "custom",
  };
}

/**
 * @param {{ email: string, displayName?: string, photoURL?: string }} user
 */
export async function savePendingUserProfile(user) {
  try {
    let profiles = await get("profile", { admin: false });
    if (!Array.isArray(profiles)) profiles = [];
    const idx = profiles.findIndex(
      (p) => p.email && p.email.toLowerCase() === user.email.toLowerCase(),
    );
    if (idx === -1) {
      profiles.push({
        email: user.email,
        name: user.displayName || user.email.split("@")[0],
        avatar: user.photoURL || "",
        role: "Software Engineer",
        department: "Development",
        bio: "Hi, I am new to the portal! Connected via Google authentication.",
        approvedStatus: "pending",
      });
    } else {
      if (user.photoURL) profiles[idx].avatar = user.photoURL;
      if (!profiles[idx].name) {
        profiles[idx].name = user.displayName || user.email.split("@")[0];
      }
      if (!profiles[idx].approvedStatus) {
        profiles[idx].approvedStatus = "pending";
      }
    }
    await save("profile", profiles, { admin: false });
  } catch (e) {
    console.warn("Failed to save pending profile details:", e);
  }
}
