"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@staysuite/ui";
import {
  campaignApprovalSnapshot,
  campaignGroupBlockers,
  campaignPlanSchema,
  categorizeGroupName,
  detectCampaignMediaType,
  type CampaignPlan,
} from "@staysuite/validation";
import { useGroups } from "../groups/use-groups";
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
  const [interval, setInterval] = useState(15);
  const [selected, setSelected] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [media, setMedia] = useState<Media[]>([]);
  const [mediaError, setMediaError] = useState("");
  const [busy, setBusy] = useState(false);
  const [approved, setApproved] = useState("");
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
  let snapshot = "";
  if (parsed.success) {
    try {
      snapshot = campaignApprovalSnapshot(plan, groups);
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
  async function addMedia(files: File[]) {
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
  function download() {
    if (!parsed.success || !snapshot) return;
    const payload = {
      kind: "staysuite-campaign-preparation",
      plan,
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
    <div className="page group-workspace">
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
      <section className="panel">
        <h2>1. Write your post</h2>
        <label htmlFor="campaign-text">Post text</label>
        <textarea
          id="campaign-text"
          rows={7}
          maxLength={10000}
          value={text}
          onChange={(e) => {
            invalidateApproval();
            setText(e.target.value);
          }}
          placeholder="Describe your accommodation, location, dates and offer."
        />
        <p className="muted text-sm">
          {text.length}/10,000 characters · No generated claims or automatic
          text variations.
        </p>
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
      <section className="panel">
        <h2>2. Add photos or a video</h2>
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
            disabled={busy}
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
            Files stay in this browser tab; they are not uploaded to StaySuite
            or Facebook. Keep your originals. Closing or reloading this page
            discards this draft and its attachments. Facebook and individual
            groups may impose different media limits. The downloaded plan
            contains file names and fingerprints, not the media files.
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
                disabled={busy}
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
      <section className="panel">
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
                      "Permission reviewed; recheck eligibility before dispatch"}
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
      <section className="panel">
        <h2>4. Review the campaign plan</h2>
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
            This is a planning setting, not a ban-safe interval. A future
            executor must respect stricter group rules, persist waiting times
            and stop on restrictions. No account rotation, warning bypass or
            automatic retry of uncertain submissions.
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
        <Button disabled>Start bulk posting — adapter not validated</Button>
        <p className="muted text-sm">
          Automatic posting is not connected. A validated Facebook adapter,
          current account and group eligibility checks, and durable duplicate
          protection are required before dispatch. Approval here is only a local
          plan review, not server authorization or proof of publication.
        </p>
      </section>
    </div>
  );
}
