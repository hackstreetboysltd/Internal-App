import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * @param {string} absPath
 */
function resolveFile(absPath) {
  if (fs.existsSync(absPath) && fs.statSync(absPath).isFile()) {
    return pathToFileURL(absPath).href;
  }
  if (fs.existsSync(`${absPath}.js`)) {
    return pathToFileURL(`${absPath}.js`).href;
  }
  if (fs.existsSync(`${absPath}.mjs`)) {
    return pathToFileURL(`${absPath}.mjs`).href;
  }
  return pathToFileURL(absPath).href;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const target = resolveFile(path.join(root, specifier.slice(2)));
    return nextResolve(target, context);
  }
  return nextResolve(specifier, context);
}
