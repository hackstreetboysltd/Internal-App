/**
 * Email smoke test — local API stack and production EmailJS (via prod portal origin).
 * Usage:
 *   node scripts/test-email.mjs
 *   node scripts/test-email.mjs --to you@example.com
 */
import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import Redis from "ioredis";
import pg from "pg";

const PROD_BASE = "https://hackstreetboysltd-internal-app.vercel.app/Internal-App";
const LOCAL_BASE = "http://localhost:3000/Internal-App";

function loadEnv() {
  const env = { ...process.env };
  for (const file of [".env", ".env.local"]) {
    try {
      for (const line of readFileSync(file, "utf8").split("\n")) {
        if (!line || line.startsWith("#")) continue;
        const i = line.indexOf("=");
        if (i < 1) continue;
        const key = line.slice(0, i).trim();
        let val = line.slice(i + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"'))
          || (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (!env[key]) env[key] = val;
      }
    } catch {
      /* optional */
    }
  }
  return env;
}


async function sendDirectEmail({ label, creds, toEmail }) {
  const ready = creds.serviceId && creds.templateId && creds.publicKey
    && creds.serviceId !== "YOUR_SERVICE_ID";
  if (!ready) {
    return { label, ok: false, detail: "EmailJS credentials missing" };
  }

  const origin = (creds.portalUrl || "http://localhost:3000").replace(/\/+$/, "");
  const payload = JSON.stringify({
    service_id: creds.serviceId,
    template_id: creds.templateId,
    user_id: creds.publicKey,
    template_params: {
      to_email: toEmail,
      actor_name: "Portal Email Test",
      eyebrow: "SYSTEM",
      headline: "Portal Email Test sent a smoke-test email.",
      detail_text: label,
      note: "",
      timestamp: new Date().toISOString(),
      portal_url: origin,
      cta_label: "Open Portal",
      footer: "This is a smoke-test email from the portal.",
      subject: `[Portal Test] ${label}`,
    },
  });

  const { execFileSync } = await import("child_process");
  const ip = execFileSync("bash", ["-lc", "dig +short api.emailjs.com @8.8.8.8 | grep -E '^[0-9.]+' | head -1"], {
    encoding: "utf8",
  }).trim();

  const args = [
    "-sS", "-m", "30",
    "--resolve", `api.emailjs.com:443:${ip}`,
    "-H", "Content-Type: application/json",
    "-H", `Origin: ${origin}`,
    "-d", payload,
    "-w", "\nHTTP_STATUS:%{http_code}",
    "https://api.emailjs.com/api/v1.0/email/send",
  ];
  const out = execFileSync("curl", args, { encoding: "utf8" });
  const status = Number((out.match(/HTTP_STATUS:(\d+)/) || [])[1] || 0);
  const body = out.replace(/\nHTTP_STATUS:\d+$/, "").trim();
  return {
    label,
    ok: status >= 200 && status < 300,
    status,
    detail: body.slice(0, 160),
    origin,
  };
}

async function fetchHealth(label, url) {
  const { execFileSync } = await import("child_process");
  const { hostname } = new URL(url);
  const ip = execFileSync("bash", ["-lc", `dig +short ${hostname} @8.8.8.8 | grep -E '^[0-9.]+' | head -1`], {
    encoding: "utf8",
  }).trim();
  const out = execFileSync("curl", [
    "-sS", "-m", "30",
    "--resolve", `${hostname}:443:${ip}`,
    "-w", "\nHTTP_STATUS:%{http_code}",
    url,
  ], { encoding: "utf8" });
  const status = Number((out.match(/HTTP_STATUS:(\d+)/) || [])[1] || 0);
  const body = out.replace(/\nHTTP_STATUS:\d+$/, "").trim();
  return {
    label,
    ok: status >= 200 && status < 300,
    status,
    detail: body.slice(0, 160),
  };
}

async function createAdminSession(env, email) {
  const redisUrl = env.REDIS_URL?.includes("localhost") ? env.REDIS_URL : "redis://localhost:6379";
  const redis = new Redis(redisUrl);
  const sid = randomUUID();
  const session = {
    sid,
    uid: randomUUID(),
    email,
    name: "Email Smoke Admin",
    avatar: "",
    roles: ["user", "admin"],
    sessionId: "email-smoke",
    createdAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    needsProfileSync: false,
  };
  await redis.setex(`session:${sid}`, 604800, JSON.stringify(session));
  await redis.quit();
  return sid;
}

async function testLocalApi(env, toEmail, adminEmail) {
  const health = await fetch(`${LOCAL_BASE}/api/health/`);
  if (!health.ok) {
    return { label: "local-api", ok: false, detail: `health ${health.status}` };
  }

  const sid = await createAdminSession(env, adminEmail);
  const res = await fetch(`${LOCAL_BASE}/api/notifications/approval-email/?admin=1`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `sid=${sid}`,
    },
    body: JSON.stringify({ email: toEmail, name: "Smoke Test" }),
  });
  const body = await res.text();
  return {
    label: "local-api",
    ok: res.ok,
    status: res.status,
    detail: body.slice(0, 160),
  };
}

async function pickRecipient(env) {
  try {
    const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
    const admins = await pool.query(`SELECT emails FROM role_access WHERE id = 'admins'`);
    await pool.end();
    const emails = admins.rows[0]?.emails;
    if (Array.isArray(emails) && emails[0]) return String(emails[0]).trim();
  } catch {
    /* fall through */
  }
  return "";
}

async function main() {
  const env = loadEnv();
  const toArg = process.argv.includes("--to")
    ? process.argv[process.argv.indexOf("--to") + 1]
    : "";
  const adminEmail = "kakaiphil@gmail.com";
  const toEmail = toArg || (await pickRecipient(env)) || adminEmail;

  console.log("Recipient:", toEmail);
  console.log("---");

  const results = [];

  for (const fn of [
    () => testLocalApi(env, toEmail, adminEmail),
    () => sendDirectEmail({
      label: "local-direct",
      creds: {
        serviceId: env.EMAILJS_SERVICE_ID,
        templateId: env.EMAILJS_TEMPLATE_ID,
        publicKey: env.EMAILJS_PUBLIC_KEY,
        portalUrl: env.APP_URL || env.NEXT_PUBLIC_PORTAL_URL,
      },
      toEmail,
    }),
    () => sendDirectEmail({
      label: "prod-direct",
      creds: {
        serviceId: env.EMAILJS_SERVICE_ID,
        templateId: env.EMAILJS_TEMPLATE_ID,
        publicKey: env.EMAILJS_PUBLIC_KEY,
        portalUrl: `${PROD_BASE}/`,
      },
      toEmail,
    }),
    async () => fetchHealth("prod-health", `${PROD_BASE}/api/health/`),
  ]) {
    try {
      results.push(await fn());
    } catch (err) {
      results.push({
        label: "unknown",
        ok: false,
        detail: String(err?.message || err),
      });
    }
  }

  for (const r of results) {
    const mark = r.ok ? "PASS" : "FAIL";
    console.log(`${mark} ${r.label}${r.status ? ` (${r.status})` : ""}${r.origin ? ` origin=${r.origin}` : ""}`);
    if (r.detail) console.log(`     ${r.detail}`);
  }

  const failed = results.filter((r) => !r.ok);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
