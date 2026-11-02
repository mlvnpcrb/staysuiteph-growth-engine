import { createRequire } from "node:module";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath, URL } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const requireWeb = createRequire(path.join(root, "apps/web/package.json"));
const requireTailwind = createRequire(
  requireWeb.resolve("@tailwindcss/postcss"),
);
const postcss = requireTailwind("postcss");
const tailwind = requireWeb("@tailwindcss/postcss");
const source = path.join(root, "apps/web/src/app/globals.css");
const css = await readFile(source, "utf8");
const result = await postcss([
  tailwind({ base: path.join(root, "apps/web") }),
]).process(css, { from: source });
const extras = await Promise.all(
  [
    "reference-compose.css",
    "reference-automations.css",
    "reference-radar.css",
  ].map((name) => readFile(path.join(root, "apps/web/src/app", name), "utf8")),
);
const generated = path.join(root, "apps/extension/generated");
await mkdir(generated, { recursive: true });
await writeFile(
  path.join(generated, "suite.css"),
  (result.css + "\n" + extras.join("\n")).replaceAll(
    "/fonts/reference/",
    "../assets/reference-fonts/",
  ),
);
console.log("Built shared StaySuite styles for the extension.");
