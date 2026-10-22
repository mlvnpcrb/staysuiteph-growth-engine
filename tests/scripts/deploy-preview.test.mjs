import test from "node:test";
import assert from "node:assert/strict";
import { deployPreview } from "../../scripts/deploy-preview.mjs";

const env = {
  VERCEL_TOKEN: "test-not-real",
  VERCEL_PROJECT_ID: "prj_test",
  VERCEL_TEAM_ID: "team_test",
  DEPLOY_SHA: "a".repeat(40),
  DEPLOY_BRANCH: "feat/phase-2-group-finder",
  REPOSITORY_ID: "123",
};
const project = {
  name: "staysuiteph-growth-engine", rootDirectory: "apps/web",
  link: { type: "github", org: "mlvnpcrb", repo: "staysuiteph-growth-engine", productionBranch: "main" },
};
const ready = {
  id: "dpl_test", target: null, readyState: "READY",
  url: "staysuiteph-growth-engine-test-team.vercel.app",
  meta: { githubCommitSha: env.DEPLOY_SHA },
};
function mock(options = {}) {
  const calls = [];
  const request = async (url, init) => {
    calls.push({ url, init });
    if (url.includes("/v9/projects/")) return { ok: true, json: async () => options.project ?? project };
    if (init.method === "POST") return { ok: true, json: async () => ({ id: "dpl_test", target: null }) };
    if (url.includes("/v13/deployments/")) return { ok: true, json: async () => options.deployment ?? ready };
    return { status: options.smokeStatus ?? 200, text: async () => options.html ?? "Welcome to StaySuite. Continue with Google" };
  };
  return { request, calls };
}
test("deploys exact tested commit as Preview and checks login without leaking API credentials", async () => {
  const { request, calls } = mock();
  const result = await deployPreview(env, request);
  assert.equal(result.sha, env.DEPLOY_SHA);
  const body = JSON.parse(calls.find(c => c.init.method === "POST").init.body);
  assert.equal(body.gitSource.ref, env.DEPLOY_SHA);
  assert.equal(body.target, undefined);
  assert.equal(calls.at(-1).init.headers.Authorization, undefined);
  assert.equal(calls.at(-1).init.redirect, "error");
});
test("missing credentials and foreign branches fail before network calls", async () => {
  const { request, calls } = mock();
  await assert.rejects(deployPreview({ ...env, VERCEL_TOKEN: "" }, request), /Missing/);
  await assert.rejects(deployPreview({ ...env, DEPLOY_BRANCH: "main" }, request), /not allowed/);
  assert.equal(calls.length, 0);
});
test("wrong project, repository, root or Production branch fails before deployment", async () => {
  for (const change of [{ name: "other" }, { rootDirectory: "." }, { link: { ...project.link, org: "other" } },
    { link: { ...project.link, productionBranch: env.DEPLOY_BRANCH } }, { link: { ...project.link, productionBranch: null } }]) {
    const { request, calls } = mock({ project: { ...project, ...change } });
    await assert.rejects(deployPreview(env, request), /check failed/);
    assert.equal(calls.length, 1);
  }
});
test("wrong SHA, Production target, failed build and foreign URL are rejected", async () => {
  for (const change of [{ meta: { githubCommitSha: "b".repeat(40) } }, { target: "production" },
    { readyState: "ERROR" }, { url: "attacker.example" }]) {
    const { request, calls } = mock({ deployment: { ...ready, ...change } });
    await assert.rejects(deployPreview(env, request));
    assert.equal(calls.length, 3);
  }
});
test("protected login, missing app content and incomplete configuration fail smoke", async () => {
  for (const options of [{ smokeStatus: 401 }, { html: "Vercel login" },
    { html: "Welcome to StaySuite Continue with Google Authentication configuration is incomplete" }]) {
    await assert.rejects(deployPreview(env, mock(options).request), /smoke/);
  }
});
test("readiness waits for build and bounded timeout fails rather than passing", async () => {
  let waits = 0;
  await assert.rejects(deployPreview(env, mock({ deployment: { ...ready, readyState: "BUILDING" } }).request,
    async () => { waits++; }), /timed out/);
  assert.equal(waits, 120);
});
