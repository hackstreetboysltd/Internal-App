/**
 * Resolve `@/` imports to the repo root for plain Node test scripts.
 * Usage: node --import ./scripts/alias-loader.mjs scripts/test-security-level.mjs
 */
import { register } from "node:module";

register("./alias-resolve-hook.mjs", import.meta.url);
