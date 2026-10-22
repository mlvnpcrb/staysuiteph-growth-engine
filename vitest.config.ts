import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: {
    alias: {
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
