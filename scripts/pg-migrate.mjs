/**
 * Load `.env.local` then run node-pg-migrate.
 * Next.js already loads that file for `next dev`; the migrate CLI does not.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function loadEnvFile(path) {
  try {
    const text = readFileSync(path, "utf8");
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const eq = line.indexOf("=");
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if (
        (val.startsWith("\"") && val.endsWith("\""))
        || (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (key && !process.env[key]) process.env[key] = val;
    }
  } catch {
    /* optional */
  }
}

loadEnvFile(fileURLToPath(new URL("../.env.local", import.meta.url)));
loadEnvFile(fileURLToPath(new URL("../.env", import.meta.url)));
loadEnvFile(fileURLToPath(new URL("../.env.neon", import.meta.url)));

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://portal:portal@localhost:5432/portal";
}

const bin = fileURLToPath(new URL("../node_modules/node-pg-migrate/bin/node-pg-migrate.js", import.meta.url));
const child = spawn(process.execPath, [bin, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
});
child.on("exit", (code) => process.exit(code ?? 1));
