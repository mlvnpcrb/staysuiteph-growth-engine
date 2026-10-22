import { readFileSync, existsSync } from "node:fs";
import assert from "node:assert/strict";
const directory = "apps/extension/build/chrome-mv3-prod";
const manifest = JSON.parse(readFileSync(`${directory}/manifest.json`, "utf8"));
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.action.default_popup, "popup.html");
assert.deepEqual([...(manifest.permissions ?? [])].sort(), [
  "activeTab",
  "scripting",
  "storage",
]);
assert.equal(manifest.host_permissions?.length ?? 0, 0);
assert.equal(manifest.content_scripts?.length ?? 0, 0);
assert.equal(manifest.optional_permissions?.length ?? 0, 0);
assert.deepEqual(manifest.optional_host_permissions, [
  "https://*.vercel.app/*",
  "http://localhost/*",
  "http://127.0.0.1/*",
]);
assert.equal(manifest.externally_connectable, undefined);
assert.equal(manifest.background, undefined);
assert.equal(
  manifest.content_security_policy.extension_pages,
  "script-src 'self'; object-src 'none'; base-uri 'none'",
);
assert.ok(existsSync(`${directory}/${manifest.action.default_popup}`));
console.log(
  "PASS: built Chrome MV3 manifest, popup, and user-triggered activeTab/scripting plus session batch storage; zero permanent host/content-script permissions; optional dashboard-only site grant",
);
