// Rebuild the vendored upstream kit without weakening the application's strict TS settings.
import { spawnSync } from "node:child_process";
import { cpSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { URL, fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const vendor = resolve(root, "apps/web/vendor/stageshow");
const result = spawnSync(
  process.execPath,
  [
    resolve(root, "node_modules/typescript/bin/tsc"),
    "-p",
    resolve(vendor, "tsconfig.json"),
  ],
  { stdio: "inherit" },
);
if (result.error || result.status !== 0) process.exit(result.status ?? 1);
function copyStyles(from, to) {
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    if (entry.isDirectory())
      copyStyles(resolve(from, entry.name), resolve(to, entry.name));
    else if (entry.name.endsWith(".css"))
      cpSync(resolve(from, entry.name), resolve(to, entry.name));
  }
}
copyStyles(
  resolve(vendor, "source"),
  resolve(root, "apps/web/src/vendor/stageshow"),
);
