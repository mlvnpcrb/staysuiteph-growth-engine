import { readFile, readdir, writeFile } from "node:fs/promises";
import { URL } from "node:url";
import { createHash } from "node:crypto";
import { join, relative, resolve } from "node:path";
const [source, destination] = process.argv.slice(2);
if (!source || !destination)
  throw new Error(
    "Usage: node scripts/inspect-reference-backend.mjs extracted-reference output.json",
  );
const root = resolve(source),
  files = [];
async function walk(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) await walk(path);
    else files.push(path);
  }
}
await walk(root);
const rows = [];
for (const file of files.sort()) {
  const bytes = await readFile(file),
    name = relative(root, file).replaceAll("\\", "/");
  if (!/\.(?:js|html|json)$/.test(name)) continue;
  const text = bytes.toString("utf8");
  const hosts = new Set();
  for (const match of text.matchAll(/https?:\/\/[^\s"'<>`\\)]+/g)) {
    try {
      hosts.add(new URL(match[0]).hostname);
    } catch {
      /* Fragmented source string: no execution or interpolation. */
    }
  }
  const storageKeys = [
    ...new Set(
      [
        ...text.matchAll(
          /["']((?:gppRadar|scheduledPosts|campaigns|gppCampaign|gppProfile)[A-Za-z0-9_:.-]{0,80})["']/g,
        ),
      ].map((match) => match[1]),
    ),
  ].sort();
  rows.push({
    file: name,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length,
    external_hosts: [...hosts].sort(),
    storage_key_candidates: storageKeys,
    network_call_sites: [
      ...text.matchAll(/\b(?:fetch|XMLHttpRequest|sendBeacon)\s*\(/g),
    ].length,
    chrome_message_sites: [
      ...text.matchAll(
        /(?:chrome|browser)\.runtime\.(?:sendMessage|onMessage)/g,
      ),
    ].length,
  });
}
await writeFile(
  destination,
  JSON.stringify(
    {
      reference: "Group Posting PRO 2.11.30 owner-uploaded ZIP",
      method:
        "Static lexical inventory only. No vendor code executed, no hosts contacted, no credential values collected. Call-site counts and literal keys are evidence pointers, not a complete inferred API schema.",
      files: rows,
    },
    null,
    2,
  ) + "\n",
);
console.log(`Inspected ${rows.length} source/data files.`);
