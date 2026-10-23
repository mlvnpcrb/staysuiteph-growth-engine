import assert from "node:assert/strict";
import { URL } from "node:url";
import { Buffer, Blob } from "node:buffer";
const { FormData } = globalThis;
import { randomUUID, createHash } from "node:crypto";
/** Only called by the disposable loopback Supabase harness. Never enables a hosted publisher. */
export async function testCampaignQueue({ admin, a, b, apiUrl, onStage }) {
  assert.ok(["127.0.0.1", "localhost"].includes(new URL(apiUrl).hostname));
  const ids = [],
    groups = [];
  let mediaPath, userId;
  async function cleanup() {
    await admin
      .from("campaign_publishers")
      .update({ enabled: false, verified_at: null })
      .eq("method", "classic");
    if (mediaPath)
      await admin.storage.from("campaign-media").remove([mediaPath]);
    if (userId) {
      const existing = await admin
        .from("campaign_jobs")
        .select("id")
        .eq("user_id", userId);
      for (const row of existing.data ?? [])
        if (!ids.includes(row.id)) ids.push(row.id);
    }
    for (const id of ids) {
      await admin.from("campaign_media").delete().eq("campaign_id", id);
      await admin.from("campaign_targets").delete().eq("campaign_id", id);
      await admin.from("campaign_jobs").delete().eq("id", id);
    }
    for (const id of groups)
      await admin.from("saved_groups").delete().eq("id", id);
  }
  try {
    const user = (await a.client.auth.getUser()).data.user;
    assert.ok(user);
    userId = user.id;
    onStage("campaign fixture group insert");
    const groupUrl = "https://www.facebook.com/groups/987654321/";
    const inserted = await a.client
      .from("saved_groups")
      .insert({
        user_id: user.id,
        identity: "987654321",
        url: groupUrl,
        title: "Disposable QA accommodation group",
        destination: "",
        accommodation: "",
        audience: "",
      })
      .select("id")
      .single();
    assert.equal(inserted.error, null);
    const groupId = inserted.data.id;
    groups.push(groupId);
    onStage("campaign fixture rule update");
    assert.equal(
      (
        await a.client
          .from("saved_groups")
          .update({
            review_status: "reviewed",
            rule_evidence: "Fixture only: promotional posts allowed",
            last_reviewed_at: new Date().toISOString(),
            marketing_evidence: {
              observed_at: new Date().toISOString(),
              source_url: groupUrl,
              promotion_allowed: true,
            },
          })
          .eq("id", groupId)
      ).error,
      null,
    );
    const bytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1cAAAAASUVORK5CYII=",
      "base64",
    );
    const plan = {
      version: 1,
      text: "Disposable fixture offer; never published",
      intervalMinutes: 2,
      groupIds: [groupId],
      media: [
        {
          name: "fixture.png",
          type: "image/png",
          size: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        },
      ],
    };
    const id = randomUUID();
    ids.push(id);
    async function command(command, revision, payload = {}) {
      const result = await a.client.rpc("campaign_command", {
        p_id: id,
        p_revision: revision,
        p_command: command,
        p_payload: payload,
      });
      assert.equal(result.error, null, `Campaign ${command} failed`);
      return result.data;
    }
    onStage("campaign create and ownership checks");
    let job = await command("create", 0, {
      actor_id: "12345",
      actor_type: "personal",
      plan,
      settings: { avoidNight: false },
    });
    assert.equal(
      (await b.client.from("campaign_jobs").select("id").eq("id", id)).data
        .length,
      0,
    );
    assert.equal(
      (
        await b.client.rpc("campaign_command", {
          p_id: id,
          p_revision: job.revision,
          p_command: "cancel",
          p_payload: {},
        })
      ).error?.code,
      "42501",
    );
    onStage("campaign signed media reservation and upload");
    job = await command("reserve_media", job.revision, { position: 0 });
    const asset = job.media[0];
    mediaPath = asset.object_path;
    const signed = await a.client.storage
      .from("campaign-media")
      .createSignedUploadUrl(mediaPath);
    assert.equal(signed.error, null);
    const form = new FormData();
    form.append("cacheControl", "3600");
    form.append("", new Blob([bytes], { type: "image/png" }));
    assert.equal(
      (
        await fetch(signed.data.signedUrl, {
          method: "PUT",
          headers: { "x-upsert": "false" },
          body: form,
        })
      ).ok,
      true,
    );
    assert.ok(
      (await b.client.storage.from("campaign-media").download(mediaPath)).error,
    );
    onStage("campaign media reconciliation and approval");
    job = await command("media_uploaded", job.revision, { asset_id: asset.id });
    job = await command("approve", job.revision, { digest: job.digest });
    assert.ok(
      (
        await a.client.storage
          .from("campaign-media")
          .upload(mediaPath, bytes, { upsert: true, contentType: "image/png" })
      ).error,
    );
    assert.equal(
      (
        await a.client.rpc("campaign_command", {
          p_id: id,
          p_revision: job.revision,
          p_command: "start",
          p_payload: { actor_id: "12345", actor_type: "personal" },
        })
      ).error?.code,
      "55000",
    );
    assert.equal(
      (
        await admin
          .from("campaign_publishers")
          .update({ enabled: true, verified_at: new Date().toISOString() })
          .eq("method", "classic")
      ).error,
      null,
    );
    job = await command("start", job.revision, {
      actor_id: "12345",
      actor_type: "personal",
    });
    onStage("campaign concurrent claims");
    const claims = await Promise.all(
      [0, 1].map(() =>
        a.client.rpc("campaign_command", {
          p_id: id,
          p_revision: job.revision,
          p_command: "claim",
          p_payload: { actor_id: "12345", actor_type: "personal" },
        }),
      ),
    );
    assert.equal(claims.filter((r) => !r.error).length, 1);
    assert.equal(claims.filter((r) => r.error?.code === "40001").length, 1);
    job = claims.find((r) => !r.error).data;
    assert.equal(job.targets.filter((t) => t.state === "claimed").length, 1);
    onStage("campaign cancellation and uncertain result");
    job = await command("cancel", job.revision);
    job = await command("report", 0, {
      attempt_token: job.targets[0].attempt_token,
      outcome: "uncertain",
    });
    assert.equal(job.state, "cancelled");
    assert.equal(job.targets[0].state, "uncertain");
    assert.equal(
      (
        await admin
          .from("campaign_publishers")
          .update({ enabled: false, verified_at: null })
          .eq("method", "classic")
      ).error,
      null,
    );
    console.log(
      "PASS: isolated campaign RPC ownership, private signed media, immutable uploads, concurrent claims and cancellation ambiguity; no Facebook requests",
    );
    return { groupId, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
