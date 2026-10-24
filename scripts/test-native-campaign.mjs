import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { mkdtemp, cp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { Buffer, Blob } from "node:buffer";
import { URL, URLSearchParams } from "node:url";
const { FormData } = globalThis;
/** Actual MV3 -> authenticated local Next.js -> real disposable Supabase -> synthetic FB DOM.
 * No real Facebook traffic or owner cookies. Never call against a hosted origin.
 */
export async function testNativeCampaign({
  context,
  admin,
  origin,
  groupId,
  onStage,
}) {
  assert.ok(["127.0.0.1", "localhost"].includes(new URL(origin).hostname));
  const profile = await mkdtemp(join(tmpdir(), "staysuite-native-campaign-"));
  let native;
  const secondGroupId = randomUUID();
  let job;
  let clicks = 0;
  let blockedMutations = 0;
  const networkFailures = [];
  const blockedPaths = [];
  const id = randomUUID();
  const actor = "424242",
    groupUrl = "https://www.facebook.com/groups/987654321/";
  async function api(command, payload) {
    const response = await context.request.post(`${origin}/api/campaigns`, {
      headers: { Origin: origin },
      data: { id, revision: job?.revision ?? 0, command, payload },
    });
    assert.equal(
      response.status(),
      200,
      `Native fixture backend command ${command} returned ${response.status()}`,
    );
    const result = await response.json();
    job = result.job;
    return result;
  }
  try {
    const bytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1cAAAAASUVORK5CYII=",
      "base64",
    );
    onStage("native campaign fixture/private media");
    const viewer = (
      await (await context.request.get(`${origin}/api/groups`)).json()
    ).viewer_id;
    const secondGroupUrl = "https://www.facebook.com/groups/987654322/";
    const inserted = await admin.from("saved_groups").insert({
      id: secondGroupId,
      user_id: viewer,
      identity: "987654322",
      url: secondGroupUrl,
      title: "Native second group fixture",
      destination: "",
      accommodation: "",
      audience: "",
      review_status: "reviewed",
      rule_evidence: "Disposable fixture permission",
      last_reviewed_at: new Date().toISOString(),
      marketing_evidence: {
        observed_at: new Date().toISOString(),
        source_url: secondGroupUrl,
        promotion_allowed: true,
      },
    });
    assert.equal(inserted.error, null);
    await api("create", {
      title: "Native extension validation fixture",
      actor_id: actor,
      actor_type: "personal",
      plan: {
        version: 1,
        text: "Native fixture offer — no live Facebook traffic",
        intervalMinutes: 1,
        groupIds: [groupId, secondGroupId],
        media: [
          {
            name: "fixture.png",
            type: "image/png",
            size: bytes.length,
            sha256: createHash("sha256").update(bytes).digest("hex"),
          },
        ],
      },
      settings: { method: "direct", avoidNight: false },
    });
    const reserved = await api("reserve_media", { position: 0 });
    const form = new FormData();
    form.append("cacheControl", "3600");
    form.append("", new Blob([bytes], { type: "image/png" }), "fixture.png");
    const uploaded = await fetch(reserved.upload.signedUrl, {
      method: "PUT",
      headers: { "x-upsert": "false" },
      body: form,
    });
    assert.ok(uploaded.ok);
    await api("media_uploaded", { asset_id: job.media[0].id });
    const fixture = join(profile, "extension");
    await cp(resolve("apps/extension/build/chrome-mv3-prod"), fixture, {
      recursive: true,
    });
    const manifest = JSON.parse(
      await readFile(join(fixture, "manifest.json"), "utf8"),
    );
    // Test clone only: preapproved host grants avoid programmatically approving any real permission prompt.
    manifest.host_permissions = [
      "http://127.0.0.1/*",
      "https://www.facebook.com/*",
    ];
    manifest.optional_host_permissions = [];
    await writeFile(join(fixture, "manifest.json"), JSON.stringify(manifest));
    onStage("native campaign Chrome launch");
    native = await chromium.launchPersistentContext(profile, {
      headless: true,
      channel: "chromium",
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
        : {}),
      args: ["--enable-unsafe-extension-debugging"],
      ignoreDefaultArgs: ["--disable-extensions"],
    });
    await native.addCookies(await context.cookies(origin));
    native.on("requestfailed", (request) => {
      try {
        const url = new URL(request.url());
        if (url.pathname.startsWith("/storage/v1/"))
          networkFailures.push("private_media");
      } catch {
        /* Ignore browser-internal requests without URL metadata. */
      }
    });
    await native.route("https://upload.facebook.com/**", route => route.fulfill({json:{payload:{photoID:"67890"}}}));
    await native.route("https://www.facebook.com/**", (route) => {
      if (route.request().method() === "POST" && new URL(route.request().url()).pathname === "/api/graphql/") {
        const variables = JSON.parse(new URLSearchParams(route.request().postData()).get("variables"));
        assert.equal(variables.input.message.text, "Native fixture offer — no live Facebook traffic");
        assert.deepEqual(variables.input.attachments, [{photo:{id:"67890"}}]);
        assert.equal(variables.input.actor_id,actor);
        assert.ok(["987654321","987654322"].includes(variables.input.audience.to_id));
        clicks++;
        return route.fulfill({json:{data:{story_create:{story:{id:"fixture-story",legacy_story_hideable_id:"54321",to:{__typename:"Group",id:variables.input.audience.to_id},default_actor:{__typename:"User",id:actor},if_viewer_can_learn_more_about_pending_post:null}}}}});
      }
      if (route.request().method() !== "GET") {
        blockedMutations++;
        blockedPaths.push(
          new URL(route.request().url()).pathname
            .replace(/[0-9]{5,}/g, ":id")
            .slice(0, 120),
        );
        return route.abort();
      }
      const currentGroup = route.request().url();
      if (![groupUrl, secondGroupUrl].includes(currentGroup))
        return route.abort();
      return route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><html><body><div role="dialog"><div role="textbox" contenteditable="true"></div><button id="media" aria-label="Photo/video">Photo/video</button><button id="publish">Post</button></div><script>
    window.fixturePage=true;window.fixtureClicks=0;window.require=name=>({CurrentUser:{getID:()=>'${actor}'},CurrentUserInitialData:{USER_ID:'${actor}',PROFILE_ID:'${actor}'},DTSGInitialData:{token:'fixture-csrf'},LSD:{token:'fixture-lsd'},'ComposerStoryCreateMutation.graphql':{params:{id:'555555555555'}}})[name];
    document.getElementById('media').onclick=()=>{const input=document.createElement('input');input.type='file';input.accept='image/*';input.multiple=true;input.onchange=()=>{const preview=document.createElement('button');preview.setAttribute('aria-label','Remove photo');document.querySelector('[role=dialog]').append(preview)};document.querySelector('[role=dialog]').append(input)};
    document.getElementById('publish').onclick=()=>{window.fixtureClicks++;const status=document.createElement('div');status.setAttribute('role','status');status.innerHTML='Your post was published. <a href="${currentGroup}posts/54321/">View post</a>';document.body.append(status);window.fixturePublished=true;};
   </script></body></html>`,
      });
    });
    const dashboard = await native.newPage();
    await dashboard.goto(`${origin}/dashboard/campaigns`);
    await expect(
      dashboard.getByRole("heading", { name: "Campaigns", exact: true }),
    ).toBeVisible();
    const fb = await native.newPage();
    await fb.goto(groupUrl);
    const session = await native.browser().newBrowserCDPSession();
    const installed = await session.send("Extensions.loadUnpacked", {
      path: fixture,
    });
    const workspace = await native.newPage();
    await workspace.goto(
      `chrome-extension://${installed.id}/tabs/campaigns.html`,
    );
    await workspace.getByLabel("StaySuite Preview URL").fill(origin);
    await workspace
      .getByRole("button", { name: "Connect StaySuite and Facebook" })
      .click();
    await workspace
      .locator(".campaign-extension-card")
      .filter({ hasText: "Native extension validation fixture" })
      .getByRole("button", { name: "Review campaign", exact: true })
      .click();
    await workspace
      .getByRole("checkbox", { name: /I reviewed this exact text/ })
      .check();
    await workspace
      .getByRole("button", { name: "Approve saved campaign", exact: true })
      .click();
    await workspace
      .getByRole("checkbox", { name: /I authorize one real validation post/ })
      .check();
    workspace.once("dialog", (dialog) => dialog.accept());
    onStage(
      "native single-validation submission against intercepted Facebook Direct requests",
    );
    await workspace
      .getByRole("button", { name: "Publish one validation post", exact: true })
      .click();
    await expect(
      workspace.getByRole("link", {
        name: "Inspect validation post in Facebook",
      }),
    ).toBeVisible({ timeout: 60000 });
    assert.equal(clicks, 1);
    assert.equal(blockedMutations, 0);
    await expect(
      workspace.getByRole("button", {
        name: "Start sequential posting",
        exact: true,
      }),
    ).toBeDisabled();
    await workspace
      .getByRole("checkbox", { name: /I checked this post in Facebook/ })
      .check();
    await workspace
      .getByRole("button", {
        name: "Confirm validation for this profile",
        exact: true,
      })
      .click();
    await expect(workspace.getByRole("status").first()).toContainText(
      "Validation recorded for this profile",
    );
    await context.addCookies(await native.cookies(origin));
    await api("inspect", {});
    assert.equal(job.state, "paused");
    assert.equal(job.targets[1].state, "queued");
    onStage("native sequential continuation after owner confirmation");
    await admin
      .from("campaign_jobs")
      .update({ next_eligible_at: new Date(Date.now() - 1000).toISOString() })
      .eq("id", id);
    await workspace
      .getByRole("checkbox", { name: /I reviewed this exact text/ })
      .check();
    await workspace
      .getByRole("button", { name: "Start sequential posting", exact: true })
      .click();
    await expect(workspace.getByRole("status").first()).toContainText(
      "completed",
      { timeout: 60000 },
    );
    assert.equal(clicks, 2);
    assert.equal(fb.url(), groupUrl, "Direct execution never navigates to the second group composer");
    assert.equal(await fb.evaluate(() => globalThis.fixtureClicks || 0), 0, "Direct execution never clicks a composer Post button");
    assert.equal(blockedMutations, 0);
    for (const page of native.pages())
      if (page.url().startsWith("https://www.facebook.com/"))
        assert.equal(
          await page.evaluate(() => globalThis.fixturePage === true),
          true,
          "All Facebook pages must be synthetic fixtures",
        );
    await context.addCookies(await native.cookies(origin));
    await api("inspect", {});
    assert.equal(job.targets[1].state, "live");
    assert.equal(job.targets[0].state, "live");
    assert.equal(job.targets[0].provider_code, "direct_story_receipt");
    console.log(
      "PASS: real native MV3 campaign UI, signed media retrieval, actor binding, exact approval, single Direct submission/receipt, owner confirmation and sequential next-group submission through authenticated dashboard/real disposable Supabase; all Facebook responses intercepted, not live compatibility proof",
    );
  } catch (error) {
    const result = await admin
      .from("campaign_targets")
      .select("state,provider_code")
      .eq("campaign_id", id);
    const pages = [];
    if (native)
      for (const page of native.pages()) {
        if (page.url().startsWith("https://www.facebook.com/"))
          pages.push(
            await page
              .evaluate(() => ({
                fixture: globalThis.fixturePage === true,
                published: globalThis.fixturePublished === true,
                editors:
                  globalThis.document.querySelectorAll('[role="textbox"]')
                    .length,
              }))
              .catch(() => ({ unavailable: true })),
          );
      }
    console.error(
      JSON.stringify({
        nativeTargetDiagnostics: result.data,
        blockedPaths,
        facebookFixturePages: pages,
      }),
    );
    console.error(
      JSON.stringify({
        nativeCampaignFailure:
          /loadUnpacked|administrator|extension.*policy/i.test(String(error))
            ? "native_extension_unavailable"
            : "integration_boundary",
        privateMediaFailures: networkFailures.length,
        blockedFacebookMutations: blockedMutations,
      }),
    );
    throw new Error("Native campaign integration failed at the reported stage");
  } finally {
    if (native) {
      await context.addCookies(await native.cookies(origin)).catch(() => {});
      await native.close();
    }
    try {
      const media = await admin
        .from("campaign_media")
        .select("object_path")
        .eq("campaign_id", id);
      if (media.data?.length)
        await admin.storage
          .from("campaign-media")
          .remove(media.data.map((m) => m.object_path));
      await admin.from("campaign_media").delete().eq("campaign_id", id);
      await admin.from("campaign_targets").delete().eq("campaign_id", id);
      await admin.from("campaign_jobs").delete().eq("id", id);
      await admin.from("saved_groups").delete().eq("id", secondGroupId);
    } finally {
      await rm(profile, { recursive: true, force: true });
    }
  }
}

