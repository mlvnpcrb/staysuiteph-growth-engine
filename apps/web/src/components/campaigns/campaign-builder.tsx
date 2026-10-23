"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  campaignCommand,
  CampaignApiError,
  uploadCampaignMedia,
} from "./campaign-api";
import type { CampaignJob, CampaignSettings } from "@staysuite/validation";
import { Button } from "@staysuite/ui";
import {
  campaignApprovalSnapshot,
  campaignListSchema,
  campaignSettingsSchema,
  campaignGroupBlockers,
  campaignPlanSchema,
  categorizeGroupName,
  detectCampaignMediaType,
  type CampaignPlan,
} from "@staysuite/validation";
import { useGroups } from "../groups/use-groups";
import { CampaignLibrary, type RestoredCampaign } from "./campaign-library";
import { CampaignTextEditor } from "./campaign-text-editor";
type Media = CampaignPlan["media"][number] & { preview: string };
const metadata = (item: Media): CampaignPlan["media"][number] => ({
  name: item.name,
  type: item.type,
  size: item.size,
  sha256: item.sha256,
});
export function CampaignBuilder() {
  const { groups, loading, error, reload } = useGroups();
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [libraryVersion, setLibraryVersion] = useState(0);
  const [interval, setInterval] = useState(15);
  const [selected, setSelected] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [media, setMedia] = useState<Media[]>([]);
  const [mediaError, setMediaError] = useState("");
  const [busy, setBusy] = useState(false);
  const [approved, setApproved] = useState("");
  const [savedJob, setSavedJob] = useState<CampaignJob | null>(null);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudMessage, setCloudMessage] = useState("");
  const [storageState, setStorageState] = useState<
    "checking" | "ready" | "unavailable"
  >("checking");
  const [storageMessage, setStorageMessage] = useState("");
  const [storageCheck, setStorageCheck] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setStorageState("checking");
    void fetch("/api/campaigns", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body: unknown = await response.json();
        if (controller.signal.aborted) return;
        if (response.ok && campaignListSchema.safeParse(body).success) {
          setStorageState("ready");
          setStorageMessage("Private campaign saving is connected.");
        } else {
          setStorageState("unavailable");
          setStorageMessage(
            typeof body === "object" &&
              body &&
              "error" in body &&
              typeof body.error === "string"
              ? body.error
              : "Private saving is unavailable. Your draft stays in this tab.",
          );
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setStorageState("unavailable");
          setStorageMessage(
            "Private saving could not be reached. Your draft stays in this tab.",
          );
        }
      });
    return () => controller.abort();
  }, [storageCheck]);
  const [settings, setSettings] = useState<CampaignSettings>({
    method: "classic",
    pauseEvery: 1,
    pauseMinutes: 2,
    avoidNight: true,
    delayAfterFailure: true,
  });
  const remotePlan = useRef("");
  const pendingId = useRef<string | null>(null);
  const viewer = useRef<string | undefined>(undefined);
  const [confirmed, setConfirmed] = useState(false);
  const previews = useRef(new Set<string>());
  const active = useRef(true);
  const processing = useRef(false);
  useEffect(() => {
    active.current = true;
    const urls = previews.current;
    return () => {
      active.current = false;
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, []);
  const plan = {
    version: 1 as const,
    text,
    intervalMinutes: interval,
    groupIds: selected,
    media: media.map(metadata),
  };
  const parsed = campaignPlanSchema.safeParse(plan);
  const settingsValid = campaignSettingsSchema.safeParse(settings).success;
  const liveDraft = useRef("");
  liveDraft.current = JSON.stringify({ plan, settings, title, description });
  let snapshot = "";
  if (parsed.success) {
    try {
      snapshot =
        campaignApprovalSnapshot(plan, groups) + JSON.stringify(settings);
    } catch {
      /* A removed target invalidates approval. */
    }
  }
  const isApproved = !!snapshot && snapshot === approved;
  const targets = selected.map((id) => groups.find((g) => g.id === id));
  const blockers = targets.flatMap((g) =>
    g ? campaignGroupBlockers(g) : ["A selected group is unavailable"],
  );
  function invalidateApproval() {
    setApproved("");
    setConfirmed(false);
  }
  function restore(value: RestoredCampaign) {
    if (busy || cloudBusy) {
      setCloudMessage(
        "Finish saving or preparing media before reopening another draft.",
      );
      return;
    }
    if (
      (text.trim() || media.length) &&
      !window.confirm(
        "Replace the current draft with this saved campaign? Unsaved edits will be lost.",
      )
    )
      return;
    const { job, files, duplicate } = value;
    if (
      !duplicate &&
      ((job.state !== "draft" &&
        job.state !== "ready" &&
        job.state !== "paused" &&
        job.state !== "blocked") ||
        job.targets.some((t) => t.state !== "queued"))
    ) {
      setCloudMessage(
        "This campaign has submission history. Duplicate it to prepare a new draft.",
      );
      return;
    }
    for (const url of previews.current) URL.revokeObjectURL(url);
    previews.current.clear();
    const restored = files.map((file, index) => {
      const manifest = job.plan.media[index]!;
      const preview = URL.createObjectURL(file);
      previews.current.add(preview);
      return { ...manifest, preview };
    });
    setText(job.plan.text);
    setTitle(
      duplicate ? `${job.title || "Campaign"} (copy)`.slice(0, 120) : job.title,
    );
    setDescription(job.description);
    setSettings(job.settings);
    setInterval(job.plan.intervalMinutes);
    setSelected(job.plan.groupIds);
    setMedia(restored);
    invalidateApproval();
    viewer.current = value.viewer;
    pendingId.current = null;
    setSavedJob(duplicate ? null : job);
    remotePlan.current = duplicate
      ? ""
      : JSON.stringify({
          plan: job.plan,
          settings: job.settings,
          title: job.title,
          description: job.description,
        });
    setCloudMessage(
      duplicate
        ? "Copy loaded. Save it to create a separate campaign; nothing is published."
        : "Saved draft and verified attachments restored. Review it before saving changes.",
    );
    document.getElementById("campaign-title")?.focus();
  }
  function newDraft() {
    if (
      (text.trim() || media.length) &&
      !window.confirm(
        "Start a new draft? Unsaved changes in this tab will be lost.",
      )
    )
      return;
    for (const url of previews.current) URL.revokeObjectURL(url);
    previews.current.clear();
    setText("");
    setTitle("");
    setDescription("");
    setSelected([]);
    setMedia([]);
    setSavedJob(null);
    pendingId.current = null;
    remotePlan.current = "";
    invalidateApproval();
    setCloudMessage("");
  }
  async function addMedia(files: File[]) {
    if (savedJob?.media.length) {
      setMediaError("Duplicate this campaign to replace saved attachments.");
      return;
    }
    if (processing.current) return;
    processing.current = true;
    setBusy(true);
    setMediaError("");
    const created: Media[] = [];
    try {
      if (files.length + media.length > 10)
        throw new Error("Choose up to 10 photos or one video.");
      if (
        files.reduce(
          (sum, f) => sum + f.size,
          media.reduce((sum, f) => sum + f.size, 0),
        ) >
        50 * 1024 * 1024
      )
        throw new Error("The workspace limit is 50 MB per campaign.");
      for (const file of files) {
        if (!file.size) throw new Error("Empty files cannot be attached.");
        const buffer = await file.arrayBuffer();
        if (!active.current) return;
        const type = detectCampaignMediaType(
          new Uint8Array(buffer).slice(0, 256),
        );
        if (!type)
          throw new Error(
            "Use a JPEG, PNG, WebP, GIF, MP4, WebM or QuickTime file with a recognized signature.",
          );
        const sha256 = Array.from(
          new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)),
          (v) => v.toString(16).padStart(2, "0"),
        ).join("");
        if (!active.current) return;
        const preview = URL.createObjectURL(new Blob([buffer], { type }));
        previews.current.add(preview);
        created.push({
          name: file.name,
          type,
          size: file.size,
          sha256,
          preview,
        });
      }
      const combined = [...media, ...created];
      const validation = campaignPlanSchema.shape.media.safeParse(
        combined.map(metadata),
      );
      if (!validation.success)
        throw new Error("Check the file names, types and sizes.");
      if (
        combined.some((m) => m.type.startsWith("video/")) &&
        combined.length !== 1
      )
        throw new Error("Choose photos or one video, not a mixture.");
      if (new Set(combined.map((m) => m.sha256)).size !== combined.length)
        throw new Error("That media is already attached.");
      invalidateApproval();
      setMedia(combined);
    } catch (e) {
      for (const item of created) {
        URL.revokeObjectURL(item.preview);
        previews.current.delete(item.preview);
      }
      if (active.current)
        setMediaError(
          e instanceof Error ? e.message : "The files could not be prepared.",
        );
    } finally {
      processing.current = false;
      if (active.current) setBusy(false);
    }
  }
  async function saveCampaign() {
    if (
      !parsed.success ||
      !settingsValid ||
      busy ||
      cloudBusy ||
      storageState !== "ready"
    )
      return;
    const savingVersion = JSON.stringify({
      plan,
      settings,
      title,
      description,
    });
    setCloudBusy(true);
    setCloudMessage("");
    try {
      let current = savedJob;
      if (!current) {
        const id = pendingId.current ?? crypto.randomUUID();
        pendingId.current = id;
        if (remotePlan.current === "creation-attempted") {
          try {
            const recovered = await campaignCommand(
              { id, revision: 0, command: "inspect", payload: {} },
              viewer.current,
            );
            current = recovered.job;
            viewer.current = recovered.viewer_id;
          } catch (error) {
            if (!(error instanceof CampaignApiError) || error.status !== 403)
              throw error;
            const created = await campaignCommand(
              {
                id,
                revision: 0,
                command: "create",
                payload: { plan, settings, title, description },
              },
              viewer.current,
            );
            current = created.job;
            viewer.current = created.viewer_id;
          }
        } else {
          remotePlan.current = "creation-attempted";
          const created = await campaignCommand(
            {
              id,
              revision: 0,
              command: "create",
              payload: { plan, settings, title, description },
            },
            viewer.current,
          );
          current = created.job;
          viewer.current = created.viewer_id;
        }
        setSavedJob(current);
        remotePlan.current = JSON.stringify({
          plan: current.plan,
          settings: current.settings,
          title: current.title,
          description: current.description,
        });
      }
      if (!current) throw new Error("Saved campaign could not be recovered.");
      if (
        remotePlan.current !==
        JSON.stringify({ plan, settings, title, description })
      ) {
        const updated = await campaignCommand(
          {
            id: current.id,
            revision: current.revision,
            command: "edit",
            payload: { plan, settings, title, description },
          },
          viewer.current,
        );
        current = updated.job;
        setSavedJob(current);
        remotePlan.current = JSON.stringify({
          plan,
          settings,
          title,
          description,
        });
      }
      for (let position = 0; position < media.length; position++) {
        if (current.media.some((m) => m.position === position && m.uploaded))
          continue;
        const reserved = await campaignCommand(
          {
            id: current.id,
            revision: current.revision,
            command: "reserve_media",
            payload: { position },
          },
          viewer.current,
        );
        current = reserved.job;
        setSavedJob(current);
        const asset = current.media.find((m) => m.position === position);
        if (!asset || !reserved.upload)
          throw new Error("Media reservation unavailable.");
        try {
          const reconciled = await campaignCommand(
            {
              id: current.id,
              revision: current.revision,
              command: "media_uploaded",
              payload: { asset_id: asset.id },
            },
            viewer.current,
          );
          current = reconciled.job;
          setSavedJob(current);
          continue;
        } catch (error) {
          if (!(error instanceof CampaignApiError) || error.status !== 400)
            throw error;
        }
        const original = media[position];
        if (!original)
          throw new Error("Attachment changed. Review the campaign again.");
        const bytes = await (await fetch(original.preview)).blob();
        if (reserved.upload.path !== asset.object_path)
          throw new Error("Upload target changed. Reload before retrying.");
        await uploadCampaignMedia(reserved.upload.signedUrl, bytes);
        const done = await campaignCommand(
          {
            id: current.id,
            revision: current.revision,
            command: "media_uploaded",
            payload: { asset_id: asset.id },
          },
          viewer.current,
        );
        current = done.job;
        setSavedJob(current);
      }
      setLibraryVersion((v) => v + 1);
      setCloudMessage(
        liveDraft.current === savingVersion
          ? "Campaign and attachments saved privately. Nothing was sent to Facebook."
          : "The earlier version was saved. Your current edits still need saving.",
      );
    } catch (e) {
      setCloudMessage(
        e instanceof Error
          ? e.message
          : "Campaign could not be saved. Reload before retrying.",
      );
    } finally {
      setCloudBusy(false);
    }
  }
  function download() {
    if (!parsed.success || !snapshot) return;
    const payload = {
      kind: "staysuite-campaign-preparation",
      plan,
      settings,
      targets: targets.map((g) =>
        g
          ? {
              id: g.id,
              title: g.title,
              url: g.url,
              blockers: campaignGroupBlockers(g),
            }
          : null,
      ),
      planApproved: isApproved,
      approvalSnapshot: isApproved ? snapshot : null,
      publishingEnabled: false,
      mediaIncluded: false,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "staysuite-campaign-plan.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="page group-workspace campaign-workspace">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Group campaigns</span>
          <h1>Campaigns</h1>
          <p className="muted">
            One post, selected communities, a clear review before publishing.
          </p>
        </div>
        <span className="subtle-badge">
          Preparation workspace · no live publishing
        </span>
      </div>
      <aside
        className="campaign-availability"
        aria-label="Campaign availability"
      >
        <div>
          <strong>
            {storageState === "ready"
              ? "Private saving connected"
              : storageState === "checking"
                ? "Checking private saving…"
                : "Private saving needs attention"}
          </strong>
          <p className="muted text-sm">
            {storageMessage ||
              "Checking your StaySuite workspace. You can prepare your draft while we check."}
          </p>
        </div>
        <span className="subtle-badge">Publishing off</span>
        {storageState === "unavailable" && (
          <Button
            variant="outline"
            onClick={() => setStorageCheck((value) => value + 1)}
          >
            Retry connection
          </Button>
        )}
      </aside>
      <CampaignLibrary
        version={libraryVersion}
        onOpen={restore}
        onDeleted={(id) => {
          if (savedJob?.id === id) {
            setSavedJob(null);
            pendingId.current = null;
            remotePlan.current = "";
            invalidateApproval();
            setCloudMessage(
              "Saved campaign deleted. This tab keeps an unsaved copy; saving creates a new campaign.",
            );
          }
        }}
      />
      <section className="panel campaign-compose">
        <div className="group-actions">
          <h2>1. Write your post</h2>
          <Button
            variant="outline"
            disabled={busy || cloudBusy}
            onClick={newDraft}
          >
            New draft
          </Button>
        </div>
        <label htmlFor="campaign-title">
          Campaign title <span className="muted">(private)</span>
        </label>
        <input
          id="campaign-title"
          name="campaignTitle"
          autoComplete="off"
          maxLength={120}
          value={title}
          placeholder="Weekend staycation offer…"
          onChange={(e) => {
            setTitle(e.target.value);
            invalidateApproval();
          }}
        />
        <label htmlFor="campaign-description">
          Description <span className="muted">(private notes)</span>
        </label>
        <textarea
          id="campaign-description"
          name="campaignDescription"
          autoComplete="off"
          maxLength={2000}
          rows={2}
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            invalidateApproval();
          }}
        />
        <p className="muted text-sm">
          Only the post text below is intended for Facebook. Title and notes
          stay in StaySuite.
        </p>
        <CampaignTextEditor
          value={text}
          onChange={(next) => {
            invalidateApproval();
            setText(next);
          }}
        />
        <details>
          <summary>Post text help</summary>
          <p>
            Use accurate prices, dates and availability. Check whether each
            group permits links, contact information and promotional content.
            Changing text, media, target order, interval or saved rule evidence
            invalidates plan approval.
          </p>
        </details>
      </section>
      <section className="panel campaign-assets">
        <h2>2. Add photos or a video</h2>
        {savedJob?.media.length ? (
          <p className="muted">
            Saved attachments are immutable. Use Duplicate to replace them.
          </p>
        ) : null}
        <div
          className="campaign-dropzone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void addMedia(Array.from(e.dataTransfer.files));
          }}
        >
          <label htmlFor="campaign-media">
            Choose media or drop files here
          </label>
          <input
            id="campaign-media"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
            multiple
            disabled={busy || cloudBusy || !!savedJob?.media.length}
            onChange={(e) => {
              void addMedia(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
          <p className="muted text-sm">
            Up to 10 photos or one video · 50 MB total workspace limit.
          </p>
        </div>
        <details>
          <summary>Media help</summary>
          <p>
            Files stay in this browser tab until you choose Save campaign
            privately. Saving uploads them to your private StaySuite workspace.
            Nothing is sent to Facebook. Keep your originals; unsaved edits are
            lost on reload. Facebook and individual groups may impose different
            media limits. The downloaded plan contains file names and
            fingerprints, not the media files.
          </p>
        </details>
        {busy && <p role="status">Checking media and preparing previews…</p>}
        {mediaError && (
          <p role="alert" className="group-error">
            {mediaError}
          </p>
        )}
        <ul className="campaign-media-list">
          {media.map((item, index) => (
            <li key={item.sha256}>
              {item.type.startsWith("image/") ? (
                <Image
                  src={item.preview}
                  alt={`Attachment ${index + 1}: ${item.name}`}
                  width={160}
                  height={120}
                  unoptimized
                />
              ) : (
                <video
                  src={item.preview}
                  controls
                  preload="metadata"
                  aria-label={`Attachment ${index + 1}: ${item.name}`}
                />
              )}
              <span>
                {index + 1}. {item.name} ·{" "}
                {(item.size / 1024 / 1024).toFixed(1)} MB
              </span>
              <Button
                variant="outline"
                disabled={busy || cloudBusy || !!savedJob?.media.length}
                onClick={() => {
                  invalidateApproval();
                  URL.revokeObjectURL(item.preview);
                  previews.current.delete(item.preview);
                  setMedia(media.filter((m) => m !== item));
                }}
              >
                Remove {item.name}
              </Button>
            </li>
          ))}
        </ul>
      </section>
      <section className="panel campaign-audience">
        <h2>3. Select groups</h2>
        <p className="muted">
          {selected.length}/50 selected. Selection order determines queue order.
        </p>
        <label htmlFor="campaign-group-filter">Find a target group</label>
        <input
          id="campaign-group-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Group name"
        />
        {loading && <p role="status">Loading your saved groups…</p>}
        {error && (
          <div role="alert">
            {error}
            <Button variant="outline" onClick={() => void reload()}>
              Retry groups
            </Button>
          </div>
        )}
        {!loading && !error && !groups.length && (
          <p className="campaign-empty">
            Your saved group library is empty. Import or add groups in My
            Groups, then return to select your audience.
          </p>
        )}
        {!!groups.length &&
          !groups.some((group) =>
            group.title
              .toLocaleLowerCase()
              .includes(filter.toLocaleLowerCase()),
          ) && (
            <p className="campaign-empty">
              No groups match this search. Try another name.
            </p>
          )}
        <div className="campaign-targets">
          {groups
            .filter((g) =>
              g.title.toLocaleLowerCase().includes(filter.toLocaleLowerCase()),
            )
            .map((g) => (
              <label key={g.id} className="campaign-target">
                <input
                  type="checkbox"
                  checked={selected.includes(g.id)}
                  disabled={!selected.includes(g.id) && selected.length >= 50}
                  onChange={(e) => {
                    invalidateApproval();
                    setSelected(
                      e.target.checked
                        ? [...selected, g.id]
                        : selected.filter((id) => id !== g.id),
                    );
                  }}
                />
                <span>
                  <strong>{g.title}</strong>
                  <span className="muted text-sm">
                    {categorizeGroupName(g.title)
                      .map((c) => c.label)
                      .join(" · ")}{" "}
                    ·{" "}
                    {campaignGroupBlockers(g).join("; ") ||
                      "Permission reviewed; recheck eligibility before posting"}
                  </span>
                </span>
              </label>
            ))}
        </div>
        <Button
          variant="outline"
          onClick={() => {
            invalidateApproval();
            setSelected([]);
          }}
        >
          Clear selection
        </Button>
        <p>
          <Link href="/dashboard/my-groups">
            Review group rules in My Groups
          </Link>
        </p>
      </section>
      <section className="panel campaign-review">
        <h2>4. Review the campaign plan</h2>
        <div className="finder-fields">
          <label>
            Pause after every (posts)
            <input
              type="number"
              min={1}
              max={50}
              value={settings.pauseEvery}
              onChange={(e) => {
                invalidateApproval();
                setSettings({
                  ...settings,
                  pauseEvery: Number(e.target.value),
                });
              }}
            />
          </label>
          <label>
            Pause length (minutes)
            <input
              type="number"
              min={1}
              max={1440}
              value={settings.pauseMinutes}
              onChange={(e) => {
                invalidateApproval();
                setSettings({
                  ...settings,
                  pauseMinutes: Number(e.target.value),
                });
              }}
            />
          </label>
        </div>
        <label className="review-confirm">
          <input
            type="checkbox"
            checked={settings.avoidNight}
            onChange={(e) => {
              invalidateApproval();
              setSettings({ ...settings, avoidNight: e.target.checked });
            }}
          />
          Avoid night posting (10 PM–7 AM, Asia/Manila)
        </label>
        <label className="review-confirm">
          <input
            type="checkbox"
            checked={settings.delayAfterFailure}
            onChange={(e) => {
              invalidateApproval();
              setSettings({ ...settings, delayAfterFailure: e.target.checked });
            }}
          />
          Keep the extra pause after a failure
        </label>
        <p className="muted text-sm">
          These settings organize waiting times. They cannot guarantee account
          protection. Refused or uncertain submissions stop the campaign for
          review.
        </p>
        <label htmlFor="campaign-interval">
          Minimum interval between targets (minutes)
        </label>
        <input
          id="campaign-interval"
          type="number"
          min={1}
          max={1440}
          step={1}
          value={Number.isFinite(interval) ? interval : ""}
          onChange={(e) => {
            invalidateApproval();
            setInterval(e.target.value === "" ? NaN : Number(e.target.value));
          }}
        />
        <details>
          <summary>Interval help</summary>
          <p>
            Waiting between posts cannot guarantee that your account will avoid
            restrictions. Group rules may require longer waits. Stop when
            Facebook shows a warning, restriction or access denial, and check
            uncertain results before posting again.
          </p>
        </details>
        <h3>Post preview</h3>
        <p className="campaign-post-preview">
          {text || "Your post text will appear here."}
        </p>
        <p>
          {media.length} attachment(s) · {selected.length} target(s)
        </p>
        <ol>
          {targets.map((g, index) => (
            <li key={selected[index]}>{g?.title ?? "Unavailable group"}</li>
          ))}
        </ol>
        <label className="review-confirm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          I reviewed this exact text, media and target order.
        </label>
        <div className="group-actions">
          <Button
            disabled={!snapshot || !confirmed || busy || loading || !!error}
            onClick={() => setApproved(snapshot)}
          >
            Approve plan (not publish)
          </Button>
          <Button
            variant="outline"
            disabled={!snapshot || busy || loading || !!error}
            onClick={download}
          >
            Download campaign plan
          </Button>
        </div>
        <p role="status">
          {isApproved
            ? "This exact campaign plan is approved for preparation. No posts have been sent."
            : approved
              ? "Plan changed. Review and approve the current version again."
              : "Draft plan. Nothing has been sent."}
        </p>
        <p className="muted">
          {blockers.length} selected target(s) need rule or permission review.
        </p>
        <Button disabled>Start bulk posting — not available yet</Button>
        <p className="muted text-sm">
          Bulk posting is not available in this Preview. You can prepare and
          download a campaign plan. Nothing is sent to Facebook. Rules and
          posting permission need checking for every selected group before
          publishing.
        </p>
      </section>
      <section className="panel campaign-save" aria-label="Save campaign">
        <h2>Keep this campaign</h2>
        <p className="muted">
          Save text, group order and media to your private StaySuite workspace.
          This does not approve or start publishing.
        </p>
        <div className="group-actions">
          <Button
            disabled={
              !snapshot ||
              !settingsValid ||
              storageState !== "ready" ||
              busy ||
              cloudBusy ||
              loading ||
              !!error
            }
            onClick={() => void saveCampaign()}
          >
            {cloudBusy ? "Saving campaign…" : "Save campaign privately"}
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/posting-queue">Open Posting Queue</Link>
          </Button>
        </div>
        {storageState !== "ready" && (
          <p className="campaign-save-hint">
            Saving is{" "}
            {storageState === "checking" ? "being checked" : "unavailable"}.
            Unsaved text and attachments stay in this tab and are lost on
            reload. You can download the plan metadata from the review section.
          </p>
        )}
        {savedJob && (
          <p className="muted text-sm">
            Saved campaign version {savedJob.revision}.{" "}
            {savedJob.actor_id
              ? "Facebook identity selected; live verification still required."
              : "Connect a Facebook identity before publication approval."}
          </p>
        )}
        <p aria-live="polite" className="campaign-cloud-message">
          {cloudMessage}
        </p>
      </section>
    </div>
  );
}
