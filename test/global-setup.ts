import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Build the self-contained bundle before tests run, so the e2e tests can spawn
 * the real `dist/index.js` over stdio and HTTP.
 */
export default function globalSetup(): void {
  execSync("node scripts/build.mjs", { cwd: root, stdio: "inherit" });
}
