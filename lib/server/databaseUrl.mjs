/**
 * pg v8 treats sslmode=require|prefer|verify-ca as verify-full and prints a
 * SECURITY WARNING on every Node process that parses the URL. Pin verify-full
 * so Neon URLs stay equally strict without that wall of text.
 *
 * @param {string | undefined | null} url
 * @returns {string | undefined | null}
 */
export function normalizeDatabaseUrl(url) {
  if (!url || typeof url !== "string") return url;
  return url.replace(/([?&]sslmode=)(require|prefer|verify-ca)\b/i, "$1verify-full");
}

/**
 * @param {string | undefined | null} url
 */
export function databaseWantsSsl(url) {
  if (!url) return false;
  if (process.env.DATABASE_SSL === "0") return false;
  if (process.env.DATABASE_SSL === "1") return true;
  return /sslmode=(require|verify-full|verify-ca|prefer)|neon\.tech|supabase\.co/i.test(url);
}
