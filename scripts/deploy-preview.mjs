import { appendFileSync } from "node:fs";
import { URL, pathToFileURL } from "node:url";

const projectName = "staysuiteph-growth-engine";
const branch = "feat/phase-2-group-finder";

export async function deployPreview(env, request = fetch, wait = (ms) => new Promise((resolve) => globalThis.setTimeout(resolve, ms))) {
  for (const key of ["VERCEL_TOKEN", "VERCEL_PROJECT_ID", "VERCEL_TEAM_ID", "DEPLOY_SHA", "REPOSITORY_ID"]) {
    if (!env[key]) throw new Error(`Missing deployment configuration: ${key}`);
  }
  if (!/^[a-f0-9]{40}$/.test(env.DEPLOY_SHA) || env.DEPLOY_BRANCH !== branch) {
    throw new Error("Deployment branch or commit is not allowed");
  }
  async function api(path, body) {
    const response = await request(`https://api.vercel.com${path}?teamId=${encodeURIComponent(env.VERCEL_TEAM_ID)}`, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${env.VERCEL_TOKEN}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
    // Never log platform error bodies: they can include configuration values.
    if (!response.ok) throw new Error(`Vercel API HTTP ${response.status}`);
    return response.json();
  }
  console.log("Preview stage: inspect project");
  const project = await api(`/v9/projects/${encodeURIComponent(env.VERCEL_PROJECT_ID)}`);
  if (project.name !== projectName || project.rootDirectory !== "apps/web" ||
      project.link?.type !== "github" || project.link?.repo !== projectName ||
      project.link?.org !== "mlvnpcrb" || !project.link?.productionBranch ||
      project.link.productionBranch === branch) {
    throw new Error("Project identity, monorepo root or Production branch check failed");
  }
  console.log("Preview stage: create deployment");
  const created = await api("/v13/deployments", {
    name: projectName,
    project: env.VERCEL_PROJECT_ID,
    // Omitting target creates a Preview; never request target=production.
    gitSource: { type: "github", repoId: String(env.REPOSITORY_ID), ref: env.DEPLOY_SHA },
  });
  if (!created.id || created.target === "production") throw new Error("Unexpected deployment target");
  console.log("Preview stage: wait for Ready");
  let deployment;
  for (let attempt = 0; attempt < 120; attempt++) {
    deployment = await api(`/v13/deployments/${encodeURIComponent(created.id)}`);
    if (deployment.target === "production") throw new Error("Unexpected deployment target");
    if (["ERROR", "CANCELED"].includes(deployment.readyState)) throw new Error(`Preview ${deployment.readyState}`);
    if (deployment.readyState === "READY") break;
    await wait(5_000);
  }
  if (deployment?.readyState !== "READY") throw new Error("Preview readiness timed out");
  if (deployment.meta?.githubCommitSha !== env.DEPLOY_SHA) throw new Error("Deployed commit does not match tested commit");
  const url = new URL(`https://${deployment.url}`);
  if (!url.hostname.startsWith(`${projectName}-`) || !url.hostname.endsWith(".vercel.app") ||
      url.port || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Unexpected Preview hostname");
  }
  console.log(`Preview stage: login smoke at ${url.origin}`);
  const smoke = await request(`${url.origin}/login`, {
    redirect: "error",
    headers: env.VERCEL_AUTOMATION_BYPASS_SECRET
      ? { "x-vercel-protection-bypass": env.VERCEL_AUTOMATION_BYPASS_SECRET } : {},
    signal: AbortSignal.timeout(30_000),
  });
  if (smoke.status !== 200) throw new Error(`Preview login smoke HTTP ${smoke.status}; check deployment protection`);
  const html = await smoke.text();
  if (!html.includes("Continue with Google") || !html.includes("Welcome to StaySuite") ||
      html.includes("Authentication configuration is incomplete")) {
    throw new Error("Preview login smoke content check failed");
  }
  return { url: url.origin, sha: env.DEPLOY_SHA };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await deployPreview(process.env);
    console.log(`Preview ready; login smoke passed: ${result.url}`);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `preview_url=${result.url}\n`);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      `## Preview verified\n\nCommit: \`${result.sha}\`\n\n${result.url}\n\nLogin page smoke: PASS. Live Google login and database persistence are NOT VERIFIED. No migrations executed.\n`);
  } catch (error) {
    // Only our bounded category messages; no raw fetch exceptions or response bodies.
    const message = error instanceof Error ? error.message : "Unknown failure";
    const safe = /^(Missing deployment configuration: [A-Z_]+|Deployment branch or commit is not allowed|Vercel API HTTP \d+|Project identity, monorepo root or Production branch check failed|Unexpected deployment target|Preview (ERROR|CANCELED)|Preview readiness timed out|Deployed commit does not match tested commit|Unexpected Preview hostname|Preview login smoke HTTP \d+; check deployment protection|Preview login smoke content check failed)$/.test(message);
    console.error(safe ? message : "Preview deployment network or response failure");
    process.exitCode = 1;
  }
}
