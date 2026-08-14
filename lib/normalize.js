export function normalizeEmail(value) {
  return (value || "").trim().toLowerCase();
}

export function normalizePersonName(value) {
  return (value || "").trim().toLowerCase();
}

const GOAL_EMAIL_ALIASES = {
  "kmulei@kabarak.ac.ke": "dmulei001@outlook.com",
  "2103334@students.kcau.ac.ke": "kakaiphil@gmail.com",
};

export function profileForEmail(email, users) {
  const key = normalizeEmail(email);
  if (!key) return null;
  const list = Array.isArray(users) ? users : [];
  return list.find((u) => normalizeEmail(u.email) === key) || null;
}

function uniqueUserForOwnerName(ownerName, users) {
  const key = normalizePersonName(ownerName);
  if (!key) return null;
  const list = Array.isArray(users) ? users.filter((u) => u && u.email) : [];
  const matches = list.filter((u) => normalizePersonName(u.name) === key);
  return matches.length === 1 ? matches[0] : null;
}

export function emailForStoredOwnerName(ownerName, users) {
  const user = uniqueUserForOwnerName(ownerName, users);
  return user ? normalizeEmail(user.email) : "";
}

export function applyKnownGoalAssigneeAliases(record, users) {
  if (!record || typeof record !== "object") return record;
  const storedEmail = normalizeEmail(record.email);
  const storedUser = normalizeEmail(record.user);
  const nextEmail = GOAL_EMAIL_ALIASES[storedEmail] || GOAL_EMAIL_ALIASES[storedUser];
  if (!nextEmail) return record;
  const profile = profileForEmail(nextEmail, users);
  const nextName = profile && profile.name && profile.name.trim()
    ? profile.name.trim()
    : GOAL_EMAIL_ALIASES[storedUser]
      ? nextEmail
      : record.user || nextEmail;
  if (storedEmail === nextEmail && record.user === nextName) return record;
  return { ...record, email: nextEmail, user: nextName };
}
