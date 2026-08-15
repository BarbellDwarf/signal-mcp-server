#!/usr/bin/env node
import esbuild from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outfile = path.join(root, "dist/index.js");

const result = await esbuild.build({
  entryPoints: [path.join(root, "src/index.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile,
  sourcemap: true,
  minify: false,
  banner: { js: "#!/usr/bin/env node" },
  logLevel: "info",
  legalComments: "none",
});

if (result.errors.length > 0) {
  console.error(`esbuild failed with ${result.errors.length} error(s)`);
  process.exit(1);
}

const stat = fs.statSync(outfile);
const sizeMb = (stat.size / (1024 * 1024)).toFixed(2);
console.log(`Built ${path.relative(root, outfile)} (${sizeMb} MB)`);
