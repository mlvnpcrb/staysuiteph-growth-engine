import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { URL, URLSearchParams } from "node:url";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import ts from "typescript";
import { chromium } from "@playwright/test";
// Every request is intercepted. This script cannot post to Facebook.
const source = await readFile(new URL("../apps/extension/lib/direct-publisher.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { directPublisherPage } = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1cAAAAASUVORK5CYII=", "base64");
const base = { actorId: "12345", groupUrl: "https://www.facebook.com/groups/98765/", text: "Exact fixture offer", attemptToken: "11111111-1111-4111-8111-111111111111", approvalDigest: "a".repeat(64), allowSubmit: true, media: [{ name: "fixture.png", type: "image/png", base64: png.toString("base64"), sha256: createHash("sha256").update(png).digest("hex") }] };
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || "/usr/bin/chromium", args: ["--no-sandbox"] });
const checks = [];
async function fixture(mode = "live") {
    const context = await browser.newContext();
    let uploads = 0, creates = 0;
    const requests = [];
    const page = await context.newPage();
    await context.route("**/*", async (route) => {
        const request = route.request(), url = request.url();
        requests.push(url.split("?")[0]);
        if (request.method() === "GET" && url === "https://www.facebook.com/")
            return route.fulfill({ contentType: "text/html", body: `<!doctype html><html><title>Fixture</title><body><script>window.fixtureActor='12345';window.require=name=>({CurrentUser:{getID:()=>window.fixtureActor},CurrentUserInitialData:{USER_ID:window.fixtureActor,PROFILE_ID:window.fixtureActor},DTSGInitialData:{token:'fixture-csrf'},LSD:{token:'fixture-lsd'},'ComposerStoryCreateMutation.graphql':{params:{id:'555555555555'}}})[name];</script></body></html>` });
        if (url.startsWith("https://upload.facebook.com/ajax/react_composer/attachments/photo/upload?")) {
            uploads++;
            assert.equal(request.method(), "POST");
            assert.match(request.postData() || "", /fixture\.png/);
            if (mode === "upload_denied")
                return route.fulfill({ status: 429, body: "restricted" });
            if (mode === "actor_change")
                await page.evaluate(() => { globalThis.fixtureActor = "54321"; });
            return route.fulfill({ json: { payload: { photoID: "67890" } } });
        }
        if (url === "https://www.facebook.com/api/graphql/") {
            creates++;
            const body = new URLSearchParams(request.postData());
            const variables = JSON.parse(body.get("variables"));
            assert.equal(body.get("doc_id"), "555555555555");
            assert.equal(variables.input.message.text, base.text);
            assert.equal(variables.input.audience.to_id, "98765");
            assert.equal(variables.input.actor_id, "12345");
            assert.equal(variables.input.idempotence_token, "client:" + base.attemptToken);
            assert.deepEqual(variables.input.attachments, [{ photo: { id: "67890" } }]);
            if (mode === "timeout")
                return route.abort();
            if (mode === "refused")
                return route.fulfill({ json: { errors: [{ message: "Fixture rejection" }] } });
            return route.fulfill({ json: { data: { story_create: { story: { id: "fixture-story", legacy_story_hideable_id: "99999", to: { __typename: "Group", id: mode === "wrong_group" ? "11111" : "98765" }, default_actor: { __typename: "User", id: "12345" }, if_viewer_can_learn_more_about_pending_post: mode === "pending" ? {} : null } } } } });
        }
        await route.abort();
        throw new Error("Unexpected request " + url.split("?")[0]);
    });
    await page.goto("https://www.facebook.com/");
    const call = async (overrides = {}) => page.evaluate(directPublisherPage, { ...base, expiresAt: Date.now() + 60000, ...overrides });
    return { context, page, call, counts: () => ({ uploads, creates }), requests };
}
async function check(name, run) { await run(); checks.push({ name, status: "PASS" }); console.log("PASS", name); }
try {
    await check("probe sends no uploads or publication", async () => { const f = await fixture(); try {
        assert.equal((await f.call({ allowSubmit: false })).outcome, "ready");
        assert.deepEqual(f.counts(), { uploads: 0, creates: 0 });
    }
    finally {
        await f.context.close();
    } });
    for (const mode of ["live", "pending"]) {
        await check("photo upload and " + mode + " receipt", async () => { const f = await fixture(mode); try {
            const r = await f.call();
            assert.equal(r.outcome, mode === "pending" ? "pending_admin" : "live");
            assert.equal(r.postUrl, "https://www.facebook.com/groups/98765/posts/99999/");
            assert.deepEqual(f.counts(), { uploads: 1, creates: 1 });
            await f.call();
            assert.deepEqual(f.counts(), { uploads: 1, creates: 1 });
        }
        finally {
            await f.context.close();
        } });
    }
    for (const mode of ["timeout", "refused", "wrong_group"]) {
        await check(mode + " is held without retry", async () => { const f = await fixture(mode); try {
            assert.equal((await f.call()).outcome, "uncertain");
            await f.call();
            assert.equal(f.counts().creates, 1);
        }
        finally {
            await f.context.close();
        } });
    }
    for (const mode of ["upload_denied", "actor_change"]) {
        await check(mode + " prevents story creation", async () => { const f = await fixture(mode); try {
            assert.equal((await f.call()).outcome, "stopped");
            assert.equal(f.counts().creates, 0);
        }
        finally {
            await f.context.close();
        } });
    }
    await check("changed media and expired claims send nothing", async () => { const f = await fixture(); try {
        assert.equal((await f.call({ media: [{ ...base.media[0], sha256: "b".repeat(64) }] })).outcome, "not_sent");
        assert.equal((await f.call({ expiresAt: Date.now() - 1 })).outcome, "not_sent");
        assert.deepEqual(f.counts(), { uploads: 0, creates: 0 });
    }
    finally {
        await f.context.close();
    } });
    await check("attempt cannot be rebound to different text", async () => { const f = await fixture(); try {
        await f.call();
        assert.equal((await f.call({ text: "Changed" })).code, "direct_attempt_changed");
        assert.equal(f.counts().creates, 1);
    }
    finally {
        await f.context.close();
    } });
    await check("concurrent duplicate invocation creates one post", async () => { const f = await fixture(); try {
        await Promise.all([f.call(), f.call()]);
        assert.equal(f.counts().uploads, 1);
        assert.equal(f.counts().creates, 1);
    }
    finally {
        await f.context.close();
    } });
    await writeFile(new URL("../direct-publisher-fixture-results.json", import.meta.url), JSON.stringify({ method: "Real Chromium with every Facebook request intercepted", liveFacebookRequests: 0, checks }, null, 2) + "\n");
}
finally {
    await browser.close();
}
