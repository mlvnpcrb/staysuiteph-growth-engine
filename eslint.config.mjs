import js from "@eslint/js";
import ts from "typescript-eslint";
export default ts.config(
  {
    ignores: [
      "**/.next/**",
      "apps/web/vendor/stageshow/**",
      "apps/web/src/vendor/stageshow/**",
      "**/.plasmo/**",
      "**/build/**",
      "**/node_modules/**",
      "**/next-env.d.ts",
    ],
  },
  {
    files: ["scripts/**/*.mjs", "tests/scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        fetch: "readonly",
        AbortSignal: "readonly",
      },
    },
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    rules: { "@typescript-eslint/no-explicit-any": "error" },
  },
);
