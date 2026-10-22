import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./apps/web/src", import.meta.url)),
      "@staysuite/database": fileURLToPath(
        new URL("./packages/database/src/index.ts", import.meta.url),
      ),
      "next/navigation": fileURLToPath(
        new URL("./apps/web/node_modules/next/navigation.js", import.meta.url),
      ),
      "next/headers": fileURLToPath(
        new URL("./apps/web/node_modules/next/headers.js", import.meta.url),
      ),
      "server-only": fileURLToPath(
        new URL(
          "./apps/web/node_modules/server-only/empty.js",
          import.meta.url,
        ),
      ),
      "@staysuite/validation": fileURLToPath(
        new URL("./packages/validation/src/index.ts", import.meta.url),
      ),
      "@staysuite/types": fileURLToPath(
        new URL("./packages/types/src/index.ts", import.meta.url),
      ),
    },
  },
  test: { include: ["tests/unit/**/*.test.ts"] },
});
