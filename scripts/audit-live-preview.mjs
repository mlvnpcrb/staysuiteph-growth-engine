import { URL } from "node:url";
import { chromium } from "@playwright/test";
import { mkdir, writeFile, appendFile } from "node:fs/promises";
import { resolve } from "node:path";
const expectedTeamSuffix = "-mlvnpcrbs-projects.vercel.app";
if (!process.env.PREVIEW_AUDIT_URL) throw new Error("Audit target is required");
const target = new URL(process.env.PREVIEW_AUDIT_URL);
if (
  target.protocol !== "https:" ||
  !target.hostname.startsWith("staysuiteph-growth-engine-") ||
  !target.hostname.endsWith(expectedTeamSuffix) ||
  target.username ||
  target.password ||
  target.port ||
  target.search ||
  target.hash
)
  throw new Error("Unapproved audit target");
const output = resolve(process.env.PREVIEW_AUDIT_OUTPUT || "preview-audit");
const report = {
  target: target.origin,
  testedAt: new Date().toISOString(),
  method:
    "Real Chrome against deployed Vercel Preview; no response mocks, no supplied Google session, no Facebook posts or database mutations",
  results: [],
  browser: [],
};
const add = (feature, status, evidence) =>
  report.results.push({ feature, status, evidence });
const safePath = (raw) => {
  try {
    const url = new URL(raw);
    return url.origin + url.pathname;
  } catch {
    return "invalid_url";
  }
};
let browser;
let stage = "launch Chrome";
try {
  await mkdir(output, { recursive: true });
  browser = await chromium.launch(
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {},
  );
  for (const viewport of [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
    });
    // Seed an origin-scoped protection cookie using a single request with NO redirects.
    // The bypass secret never becomes a URL parameter, global browser header or artifact.
    stage = `seed deployment protection cookie (${viewport.name})`;
    const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    const seed = await context.request.get(`${target.origin}/login`, {
      maxRedirects: 0,
      headers: secret
        ? {
            "x-vercel-protection-bypass": secret,
            "x-vercel-set-bypass-cookie": "true",
          }
        : {},
      timeout: 30000,
    });
    const page = await context.newPage();
    const state = {
      viewport: viewport.name,
      protectionSeedStatus: seed.status(),
      finalPath: "",
      navigationStatus: null,
      pageErrors: 0,
      appConsoleErrors: 0,
      failedRequests: [],
      httpErrors: [],
      oauth: null,
    };
    await context.route(/https?:\/\/([^/]*\.)?facebook\.com\//, (route) =>
      route.abort(),
    );
    page.on("pageerror", () => {
      if (new URL(page.url()).origin === target.origin) state.pageErrors++;
    });
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        new URL(page.url()).origin === target.origin &&
        (!message.location().url ||
          message.location().url.startsWith(target.origin))
      )
        state.appConsoleErrors++;
    });
    page.on("requestfailed", (request) => {
      if (request.url().startsWith(target.origin))
        state.failedRequests.push({
          path: safePath(request.url()),
          error:
            request
              .failure()
              ?.errorText?.replace(/[^A-Za-z0-9_ :.-]/g, "")
              .slice(0, 100) || "request_failed",
        });
    });
    page.on("response", (response) => {
      if (response.status() >= 400 && response.url().startsWith(target.origin))
        state.httpErrors.push({
          path: safePath(response.url()),
          status: response.status(),
        });
    });
    stage = `navigate Campaign Manager (${viewport.name})`;
    const navigation = await page.goto(`${target.origin}/dashboard/campaigns`, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    state.navigationStatus = navigation?.status() ?? null;
    await page
      .waitForLoadState("networkidle", { timeout: 8000 })
      .catch(() => {});
    state.finalPath = safePath(page.url());
    const loginVisible = await page
      .getByRole("button", { name: "Continue with Google", exact: true })
      .isVisible()
      .catch(() => false);
    if (!loginVisible) {
      add(
        `Preview access (${viewport.name})`,
        new URL(page.url()).origin === target.origin &&
          ![401, 403].includes(state.navigationStatus)
          ? "FAIL"
          : "BLOCKED",
        `No application Google login control at ${state.finalPath}; navigation HTTP ${state.navigationStatus}; protection seed HTTP ${seed.status()}.`,
      );
      await page.screenshot({
        path: `${output}/access-blocked-${viewport.name}.png`,
        fullPage: true,
      });
      report.browser.push(state);
      await context.close();
      continue;
    }
    add(
      `Deployed login page (${viewport.name})`,
      "PASS",
      `Real page loaded at ${state.finalPath}; Google login button is visible.`,
    );
    const overflow = await page.evaluate(
      () =>
        globalThis.document.documentElement.scrollWidth >
        globalThis.innerWidth + 1,
    );
    add(
      `Login layout (${viewport.name})`,
      overflow ? "FAIL" : "PASS",
      `${viewport.width}×${viewport.height}; horizontal overflow: ${overflow}.`,
    );
    await page.screenshot({
      path: `${output}/login-${viewport.name}.png`,
      fullPage: true,
    });
    add(
      `Protected Campaign Manager route (${viewport.name})`,
      new URL(page.url()).pathname === "/login" ? "PASS" : "FAIL",
      `Fresh unauthenticated browser ended at ${state.finalPath}. This does not verify the authenticated Campaign Manager.`,
    );
    add(
      `Public login console (${viewport.name})`,
      state.pageErrors + state.appConsoleErrors === 0 ? "PASS" : "FAIL",
      `${state.pageErrors} application page errors; ${state.appConsoleErrors} application console errors. Authenticated campaign console is not verified.`,
    );
    add(
      `Public login network (${viewport.name})`,
      state.failedRequests.length === 0 && state.httpErrors.length === 0
        ? "PASS"
        : "FAIL",
      `${state.failedRequests.length} failed app requests; HTTP errors: ${JSON.stringify(state.httpErrors)}. No request headers, cookies or query strings retained.`,
    );
    if (viewport.name === "desktop") {
      for (const path of ["/api/campaigns", "/api/groups"]) {
        const response = await context.request.get(target.origin + path, {
          maxRedirects: 0,
        });
        add(
          `Anonymous GET ${path}`,
          response.status() === 401 ? "PASS" : "FAIL",
          `Actual deployed HTTP ${response.status()}; no session supplied.`,
        );
      }
      const denied = await context.request.post(
        `${target.origin}/api/campaigns`,
        { headers: { Origin: target.origin }, data: {}, maxRedirects: 0 },
      );
      add(
        "Anonymous campaign mutation denial",
        denied.status() === 401 ? "PASS" : "FAIL",
        `Actual deployed same-origin POST returned HTTP ${denied.status()}; no campaign was submitted.`,
      );
      const foreign = await context.request.post(
        `${target.origin}/api/campaigns`,
        {
          headers: { Origin: "https://foreign.example" },
          data: {},
          maxRedirects: 0,
        },
      );
      add(
        "Cross-origin campaign mutation denial",
        foreign.status() === 403 ? "PASS" : "FAIL",
        `Actual deployed POST returned HTTP ${foreign.status()}.`,
      );
      // Inspect only the authorization handoff. Never type credentials or approve consent.
      let authorize = null;
      page.on("request", (request) => {
        try {
          const url = new URL(request.url());
          if (
            url.hostname === "kqjqcahysbmsaxlaipub.supabase.co" &&
            url.pathname === "/auth/v1/authorize"
          ) {
            authorize = {
              host: url.hostname,
              provider: url.searchParams.get("provider"),
              callback: url.searchParams.get("redirect_to")
                ? safePath(url.searchParams.get("redirect_to"))
                : null,
            };
          }
        } catch {
          /* do not print raw URLs */
        }
      });
      await page
        .getByRole("button", { name: "Continue with Google", exact: true })
        .click();
      await page
        .waitForURL(
          (url) =>
            url.hostname === "accounts.google.com" ||
            url.searchParams.has("error"),
          { timeout: 20000 },
        )
        .catch(() => {});
      state.oauth = {
        authorize,
        finalPath: safePath(page.url()),
        reachedGoogle: new URL(page.url()).hostname === "accounts.google.com",
      };
      add(
        "Google OAuth initiation",
        state.oauth.reachedGoogle &&
          authorize?.provider === "google" &&
          authorize?.callback === `${target.origin}/auth/callback`
          ? "PASS"
          : "FAIL",
        `Final destination ${state.oauth.finalPath}; callback ${authorize?.callback || "not observed"}. No credentials entered or consent granted.`,
      );
      add(
        "Google login completion, logout and session persistence",
        "BLOCKED",
        "The real browser has no authenticated Google/StaySuite account. Reaching Google's sign-in screen is not successful app login.",
      );
    }
    report.browser.push(state);
    await context.close();
  }
} catch {
  // Playwright/HTTP errors can include sensitive URLs or headers. Keep only a bounded category.
  add(
    "Hosted browser audit",
    "BLOCKED",
    `Failed operation: ${stage}. No credential-bearing error or trace was retained.`,
  );
} finally {
  await browser?.close();
  await mkdir(output, { recursive: true });
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  const lines = [
    `# Real deployed Preview verification`,
    ``,
    `Target: ${target.origin}`,
    ``,
    `Method: ${report.method}`,
    ``,
    `| Check | Status | Evidence |`,
    `| --- | --- | --- |`,
    ...report.results.map(
      (r) =>
        `| ${r.feature} | ${r.status} | ${r.evidence.replaceAll("|", "/")} |`,
    ),
    ``,
    `Authenticated campaigns, CRUD, saved image retrieval, group selection and scheduling remain unverified. A deployment-protection cookie is not a Supabase login session. No migration or Facebook publishing was performed.`,
  ];
  await writeFile(`${output}/report.md`, lines.join("\n"));
  if (process.env.GITHUB_STEP_SUMMARY)
    await appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
  console.log("REAL_PREVIEW_AUDIT_REPORT " + JSON.stringify(report));
  if (report.results.some((r) => r.status === "FAIL")) process.exitCode = 1;
}
