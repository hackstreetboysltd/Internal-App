import assert from "node:assert/strict";
import { normalizeDatabaseUrl, databaseWantsSsl } from "../lib/server/databaseUrl.mjs";

const neon = "postgresql://u:p@ep-x.neon.tech/db?sslmode=require";
assert.equal(
  normalizeDatabaseUrl(neon),
  "postgresql://u:p@ep-x.neon.tech/db?sslmode=verify-full",
);
assert.equal(databaseWantsSsl(normalizeDatabaseUrl(neon)), true);

const local = "postgresql://portal:portal@localhost:5432/portal";
assert.equal(normalizeDatabaseUrl(local), local);
assert.equal(databaseWantsSsl(local), false);

console.log("ok — database URL sslmode normalize");
