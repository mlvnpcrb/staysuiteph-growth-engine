import { defineConfig, devices } from "@playwright/test";
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "tablet",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 768, height: 1024 },
      },
    },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: [
    {
      command: "pnpm --filter @staysuite/web start",
      url: "http://127.0.0.1:3000",
      reuseExistingServer: !process.env.CI,
      env: { STAYSUITE_DEMO_MODE: "true" },
      timeout: 120000,
    },
    {
      command: "pnpm --filter @staysuite/web exec next start --port 3001",
      url: "http://127.0.0.1:3001/login",
      reuseExistingServer: !process.env.CI,
      env: {
        STAYSUITE_DEMO_MODE: "false",
        NEXT_PUBLIC_SUPABASE_URL: "",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      },
      timeout: 120000,
    },
  ],
});
