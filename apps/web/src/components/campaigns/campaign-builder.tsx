"use client";
import { SuiteLink } from "@staysuite/ui";
import { suiteFetch } from "@staysuite/ui";
import { useEffect, useRef, useState } from "react";
import { isNativeSuite } from "@staysuite/ui";
import { ComposeSaveTemplate } from "./compose-save-template";
import { useComposeEngine } from "./compose-engine";
import { ComposeEngineProgress } from "./compose-engine-progress";
import { ScheduleEditor } from "../automations/schedule-editor";
import { readTemplate } from "../templates/template-api";
import { SuiteImage as Image } from "@staysuite/ui";
import { SuiteLink as Link } from "@staysuite/ui";
import {
  UsersRound,
  UserRound,
  ChevronDown,
  ImagePlus,
  FileImage,
  Eye,
} from "lucide-react";
import {
  ComposeTemplatePicker,
  ComposeLinkDialog,
} from "./compose-template-picker";
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
  detectCampaignMediaType,
  type CampaignPlan,
} from "@staysuite/validation";
import { useLibrary } from "../library/use-library";
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
export function CampaignBuilder({
  view = "compose",
  showHeading = true,
}: {
  view?: "compose" | "automations";
  showHeading?: boolean;
}) {
  const scheduleDialog = useRef<HTMLDialogElement>(null);
  const [scheduling, setScheduling] = useState<{
    id: string;
    revision: number;
  } | null>(null);
  const reviewDialog = useRef<HTMLDialogElement>(null);
  const audienceDialog = useRef<HTMLDialogElement>(null);
  const [editorOpen, setEditorOpen] = useState(view === "compose");
  const { groups, loading, error, reload, viewer: groupViewer } = useGroups();
  const collections = useLibrary(groupViewer);
  const engine = useComposeEngine(view === "compose" ? groupViewer : "");
  const engineConnectionDialog = useRef<HTMLDialogElement>(null);
  const [engineBusy, setEngineBusy] = useState(false),
    [engineMessage, setEngineMessage] = useState("");
  const [engineRun, setEngineRun] = useState<{
    id: string;
    viewer: string;
  } | null>(null);
  const engineAttempt = useRef<{
    fingerprint: string;
    requestId: string;
  } | null>(null);
  const liveOwner = useRef(groupViewer);
  liveOwner.current = groupViewer;
  const lastOwner = useRef("");
  const [templateSelection, setTemplateSelection] = useState<{
    id: string;
  } | null>(null);
  const [collectionError, setCollectionError] = useState("");
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
  const saveError = useRef("");
  const [templateNotice, setTemplateNotice] = useState<{
    text: string;
    error: boolean;
  } | null>(null);
  const [storageState, setStorageState] = useState<
    "checking" | "ready" | "unavailable"
  >("checking");
  const [storageMessage, setStorageMessage] = useState("");
  const [storageCheck, setStorageCheck] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setStorageState("checking");
    void suiteFetch("/api/campaigns", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body: unknown = await response.json();
        if (controller.signal.aborted) return;
        if (response.ok && campaignListSchema.safeParse(body).success) {
          setStorageState("ready");
          setStorageMessage("Private campaign saving is connected.");
          if (isNativeSuite() && view === "compose") {
            const list = campaignListSchema.parse(body);
            const running = list.campaigns.find(
              (job) => job.state === "running",
            );
            if (running)
              setEngineRun({ id: running.id, viewer: list.viewer_id });
          }
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
  }, [storageCheck, view]);
  const [settings, setSettings] = useState<CampaignSettings>({
    method: "direct",
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
  const liveContent = useRef("");
  liveContent.current = JSON.stringify({
    text,
    title,
    media: media.map(metadata),
  });
  useEffect(() => {
    if (view !== "compose") return;
    const id = new URL(location.href).searchParams.get("template");
    setTemplateSelection(id ? { id } : null);
  }, [view]);
  useEffect(() => {
    if (!groupViewer) return;
    if (lastOwner.current && lastOwner.current !== groupViewer) {
      setText("");
      setTitle("");
      setDescription("");
      setSelected([]);
      setMedia([]);
      for (const url of previews.current) URL.revokeObjectURL(url);
      previews.current.clear();
      setSavedJob(null);
      pendingId.current = null;
      remotePlan.current = "";
      setApproved("");
      setConfirmed(false);
      setEngineRun(null);
      setTemplateNotice(null);
      setTemplateSelection(null);
      engineAttempt.current = null;
      setEngineMessage("");
      reviewDialog.current?.close();
    }
    lastOwner.current = groupViewer;
  }, [groupViewer]);
  useEffect(() => {
    active.current = true;
    const urls = previews.current;
    return () => {
      active.current = false;
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, []);
  useEffect(() => {
    if (view !== "compose") return;
    const id = templateSelection?.id;
    if (!id || !groupViewer) return;
    const loadingOwner = groupViewer,
      loadingContent = liveContent.current;
    const controller = new AbortController();
    const created: string[] = [];
    setBusy(true);
    setTemplateNotice({ text: "Loading template…", error: false });
    processing.current = true;
    void (async () => {
      try {
        const result = await readTemplate(id, controller.signal);
        if (
          result.viewer_id !== loadingOwner ||
          result.template.user_id !== loadingOwner
        )
          throw new Error(
            "Your account changed. Reopen Compose before loading a template.",
          );
        if (result.template.state !== "ready")
          throw new Error("Finish saving this template before using it.");
        const restored: Media[] = [];
        for (const asset of result.template.assets) {
          const signed = result.assets?.find((item) => item.id === asset.id);
          if (!signed) throw new Error("A template attachment is unavailable.");
          const url = new URL(signed.url);
          if (
            url.protocol !== "https:" ||
            url.username ||
            url.password ||
            !url.pathname.startsWith("/storage/v1/object/sign/template-media/")
          )
            throw new Error("Attachment destination was not accepted.");
          const response = await suiteFetch(url, {
            signal: controller.signal,
            credentials: "omit",
            redirect: "error",
            referrerPolicy: "no-referrer",
          });
          if (!response.ok)
            throw new Error("Template attachments could not be downloaded.");
          const bytes = await response.arrayBuffer();
          const sha256 = Array.from(
            new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
            (v) => v.toString(16).padStart(2, "0"),
          ).join("");
          if (
            bytes.byteLength !== asset.size ||
            sha256 !== asset.sha256 ||
            detectCampaignMediaType(new Uint8Array(bytes).subarray(0, 256)) !==
              asset.content_type
          )
            throw new Error("Template attachment verification failed.");
          const preview = URL.createObjectURL(
            new Blob([bytes], { type: asset.content_type }),
          );
          created.push(preview);
          restored.push({
            name: asset.name,
            type: asset.content_type,
            size: asset.size,
            sha256: asset.sha256,
            preview,
          });
        }
        if (controller.signal.aborted) return;
        if (
          !campaignPlanSchema.shape.media.safeParse(restored.map(metadata))
            .success ||
          (restored.some((item) => item.type.startsWith("video/")) &&
            restored.length !== 1)
        )
          throw new Error(
            "This template's attachment combination cannot be used in Compose.",
          );
        if (liveOwner.current !== loadingOwner)
          throw new Error("Your account changed. Reopen Compose.");
        if (liveContent.current !== loadingContent)
          throw new Error(
            "Your draft changed while the template was loading. The current draft was kept.",
          );
        for (const preview of previews.current) URL.revokeObjectURL(preview);
        previews.current.clear();
        for (const preview of created) previews.current.add(preview);
        setSavedJob(null);
        pendingId.current = null;
        remotePlan.current = "";
        viewer.current = loadingOwner;
        setTemplateNotice({
          text: `Loaded “${result.template.name}”. Your audience and settings were kept.`,
          error: false,
        });
        setText(result.template.text);
        setTitle(result.template.name);
        setMedia(restored);
        setApproved("");
        setConfirmed(false);
        setCloudMessage(
          "Template opened. Choose groups and review before posting.",
        );
        const url = new URL(window.location.href);
        url.searchParams.delete("template");
        window.history.replaceState(null, "", url);
      } catch (error) {
        for (const preview of created) URL.revokeObjectURL(preview);
        if (!controller.signal.aborted) {
          const message =
            error instanceof Error
              ? error.message
              : "Template could not be opened.";
          setCloudMessage(message);
          setTemplateNotice({ text: message, error: true });
        }
      } finally {
        if (!controller.signal.aborted) {
          setBusy(false);
          processing.current = false;
        } else for (const preview of created) URL.revokeObjectURL(preview);
      }
    })();
    return () => controller.abort();
  }, [view, templateSelection, groupViewer]);
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
    setTemplateSelection(null);
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
    const savingOwner = groupViewer;
    if (!savingOwner || (viewer.current && viewer.current !== savingOwner)) {
      setCloudMessage("Your account changed. Reload Compose before saving.");
      return;
    }
    viewer.current = savingOwner;
    const run: typeof campaignCommand = async (input, owner) => {
      const result = await campaignCommand(input, owner);
      if (liveOwner.current !== savingOwner)
        throw new Error("Your account changed. Reload Compose.");
      return result;
    };
    saveError.current = "";
    setCloudBusy(true);
    setCloudMessage("");
    try {
      let current = savedJob;
      if (!current) {
        const id = pendingId.current ?? crypto.randomUUID();
        pendingId.current = id;
        if (remotePlan.current === "creation-attempted") {
          try {
            const recovered = await run(
              { id, revision: 0, command: "inspect", payload: {} },
              viewer.current,
            );
            current = recovered.job;
            viewer.current = recovered.viewer_id;
          } catch (error) {
            if (!(error instanceof CampaignApiError) || error.status !== 403)
              throw error;
            const created = await run(
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
          const created = await run(
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
        const updated = await run(
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
        const reserved = await run(
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
          const reconciled = await run(
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
        const bytes = await (await suiteFetch(original.preview)).blob();
        if (reserved.upload.path !== asset.object_path)
          throw new Error("Upload target changed. Reload before retrying.");
        await uploadCampaignMedia(reserved.upload.signedUrl, bytes);
        const done = await run(
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
      return current;
    } catch (e) {
      saveError.current =
        e instanceof Error
          ? e.message
          : "Campaign could not be saved. Reload before retrying.";
      setCloudMessage(saveError.current);
    } finally {
      setCloudBusy(false);
    }
  }
  async function openSchedule() {
    const version = liveDraft.current;
    const reviewedActor = engine.status?.actor_id;
    let saved = await saveCampaign();
    if (!saved) {
      if (view === "compose")
        setEngineMessage(
          saveError.current ||
            storageMessage ||
            "Saving was not confirmed. Check the draft before retrying.",
        );
      return;
    }
    if (version !== liveDraft.current) {
      setCloudMessage(
        "Your earlier draft was saved. Review your latest changes before scheduling.",
      );
      return;
    }
    if (isNativeSuite()) {
      const owner = liveOwner.current;
      try {
        const identity = await engine.refresh();
        if (
          !identity ||
          identity.actor_id !== reviewedActor ||
          !identity.publisher_ready ||
          identity.viewer_id !== owner ||
          settings.method !== "direct"
        )
          throw new Error(
            "Connect and validate Direct posting for this Facebook profile before scheduling.",
          );
        if (version !== liveDraft.current || owner !== liveOwner.current)
          throw new Error(
            "Your content or account changed. Review before scheduling.",
          );
        if (saved.actor_id !== identity.actor_id) {
          saved = (
            await campaignCommand(
              {
                id: saved.id,
                revision: saved.revision,
                command: "bind_actor",
                payload: {
                  actor_id: identity.actor_id,
                  actor_type: identity.actor_type,
                },
              },
              owner,
            )
          ).job;
        }
        if (version !== liveDraft.current || owner !== liveOwner.current)
          throw new Error(
            "Your content or account changed. Review before scheduling.",
          );
        // The Schedule click binds the exact composed content; enabling the saved
        // recurrence remains a separate explicit action in the schedule editor.
        saved = (
          await campaignCommand(
            {
              id: saved.id,
              revision: saved.revision,
              command: "approve",
              payload: { digest: saved.digest },
            },
            owner,
          )
        ).job;
        setSavedJob(saved);
      } catch (error) {
        setEngineMessage(
          error instanceof Error
            ? error.message
            : "Schedule approval could not be confirmed.",
        );
        return;
      }
    }
    setScheduling({ id: saved.id, revision: saved.revision });
    scheduleDialog.current?.showModal();
  }
  async function launchPostingEngine() {
    if (engineBusy || cloudBusy || busy || !parsed.success) return;
    const owner = groupViewer,
      version = liveDraft.current,
      reviewedActor = engine.status?.actor_id;
    setEngineBusy(true);
    setEngineMessage("");
    try {
      if (settings.method !== "direct")
        throw new Error("Choose Direct posting to use this posting engine.");
      if (storageState !== "ready")
        throw new Error(storageMessage || "Posting storage is not connected.");
      const identity = await engine.refresh();
      if (!identity || identity.viewer_id !== owner)
        throw new Error(
          "Connect StaySuite and Facebook in extension 0.5.4+ before posting.",
        );
      if (owner !== liveOwner.current || version !== liveDraft.current)
        throw new Error(
          "Your post or account changed. Review the current draft before posting.",
        );
      if (identity.actor_id !== reviewedActor)
        throw new Error(
          "Facebook identity changed. Review the posting identity before posting.",
        );
      if (!identity.publisher_ready && !isNativeSuite())
        throw new Error(
          "This Facebook profile needs Direct publisher validation in the extension workspace before posting. No posting tab was opened.",
        );
      let current = await saveCampaign();
      if (!current)
        throw new Error(
          saveError.current ||
            "Save was not confirmed. Check the saved post before retrying.",
        );
      if (owner !== liveOwner.current || version !== liveDraft.current)
        throw new Error(
          "Your post changed while saving. Review the current draft before posting.",
        );
      if (
        current.actor_id !== identity.actor_id ||
        current.actor_type !== identity.actor_type
      ) {
        const bound = await campaignCommand(
          {
            id: current.id,
            revision: current.revision,
            command: "bind_actor",
            payload: {
              actor_id: identity.actor_id,
              actor_type: identity.actor_type,
            },
          },
          owner,
        );
        current = bound.job;
      }
      if (owner !== liveOwner.current || version !== liveDraft.current)
        throw new Error("Your post or account changed. Review before posting.");
      setSavedJob(current);
      const fingerprint = JSON.stringify({
        id: current.id,
        revision: current.revision,
        digest: current.digest,
        actor: identity.actor_id,
        owner,
      });
      if (engineAttempt.current?.fingerprint !== fingerprint)
        engineAttempt.current = { fingerprint, requestId: crypto.randomUUID() };
      setEngineRun({ id: current.id, viewer: owner });
      setCloudMessage(
        "Saved for posting-engine dispatch. Check the engine and confirmed results before retrying.",
      );
      await engine.open({
        request_id: engineAttempt.current.requestId,
        campaign_id: current.id,
        revision: current.revision,
        digest: current.digest,
        actor_id: identity.actor_id,
        actor_type: identity.actor_type,
        viewer_id: owner,
        reviewed: true,
      });
      if (owner !== liveOwner.current) return;
      reviewDialog.current?.close();
      setEngineMessage(
        identity.publisher_ready
          ? isNativeSuite()
            ? "Posting started in the extension background. Follow confirmed results here. Keep Chrome and your signed-in Facebook tab open."
            : "Posting started in the extension background. Follow the confirmed results below; keep StaySuite and your signed-in Facebook tab open."
          : "Publisher validation is required in the extension workspace before posting.",
      );
    } catch (error) {
      if (owner === liveOwner.current)
        setEngineMessage(
          error instanceof Error
            ? error.message
            : "The posting queue could not start. Check saved execution history before retrying.",
        );
    } finally {
      setEngineBusy(false);
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
  if (lastOwner.current && groupViewer !== lastOwner.current)
    return (
      <section className="page group-workspace">
        <h1>{view === "compose" ? "Compose" : "Automations"}</h1>
        <p role={error ? "alert" : "status"}>
          {error || "Checking your current StaySuite account…"}
        </p>
        <button
          type="button"
          className="gpp-secondary"
          onClick={() => void reload()}
        >
          Reconnect workspace
        </button>
      </section>
    );
  return (
    <div className="page group-workspace campaign-workspace" data-view={view}>
      {showHeading && (
        <div className="page-heading reference-compose-heading">
          <h1>{view === "compose" ? "Compose" : "Automations"}</h1>
        </div>
      )}
      {view === "compose" && (
        <div className="gpp-compose-top-row">
          <div className="posting-as-chip">
            <span className="pa-avatar">
              <UserRound size={20} aria-hidden="true" />
            </span>
            <div className="pa-meta">
              <span className="pa-label">Posting as</span>
              <span className="pa-name">
                {engine.status?.actor_name ??
                  (engine.status?.actor_id || savedJob?.actor_id
                    ? `Facebook identity ${engine.status?.actor_id ?? savedJob?.actor_id}`
                    : "Choose your posting identity")}
              </span>
            </div>
            <button
              type="button"
              className="gpp-identity-change"
              onClick={() => engineConnectionDialog.current?.showModal()}
            >
              Change
            </button>
          </div>
        </div>
      )}
      {view === "automations" ? (
        <CampaignLibrary
          version={libraryVersion}
          onOpen={(value) => {
            restore(value);
            setEditorOpen(true);
          }}
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
      ) : null}
      {view === "automations" ? (
        <p className="panel">
          Edit saved campaigns here and manage their timing in Automations.
          Multi-step automation flows are not available yet.{" "}
          <SuiteLink href="/dashboard/compose">Compose a new post</SuiteLink>
        </p>
      ) : null}
      <div className="campaign-editor" hidden={!editorOpen}>
        <section className="panel campaign-audience" id="gppTargetSection">
          <header className="gpp-compose-step-header">
            <span className="gpp-compose-step-number" aria-hidden="true">
              1
            </span>
            <span className="gpp-compose-step-copy">
              <h2 className="gpp-compose-step-title">Choose your audience</h2>
              <span className="gpp-compose-step-help">
                Pick a tag, or choose groups one by one.
              </span>
            </span>
          </header>
          <div className="gpp-audience-controls">
            <button
              className="gpp-target-summary"
              type="button"
              onClick={() => audienceDialog.current?.showModal()}
            >
              <UsersRound size={16} aria-hidden="true" />
              <span>
                {selected.length
                  ? `${selected.length} groups selected`
                  : "Pick a tag or choose groups"}
              </span>
              <ChevronDown size={16} aria-hidden="true" />
            </button>
            <button
              className="gpp-secondary"
              type="button"
              onClick={() => audienceDialog.current?.showModal()}
            >
              Advanced selector
            </button>
          </div>
          <div className="reference-selected-groups">
            {selected.map((id) => {
              const group = groups.find((item) => item.id === id);
              return (
                <span key={id}>
                  {group?.title ?? "Unavailable group"}
                  <button
                    type="button"
                    aria-label={`Remove ${group?.title ?? "group"} from audience`}
                    onClick={() => {
                      invalidateApproval();
                      setSelected((items) =>
                        items.filter((item) => item !== id),
                      );
                    }}
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>
          <dialog
            ref={audienceDialog}
            className="reference-dialog reference-audience-dialog"
            aria-labelledby="audience-dialog-title"
          >
            <header>
              <h2 id="audience-dialog-title">Select groups</h2>
              <button
                type="button"
                aria-label="Close group selector"
                onClick={() => audienceDialog.current?.close()}
              >
                ×
              </button>
            </header>
            <p className="muted">
              {selected.length}/50 selected. Selection order determines queue
              order.
            </p>
            {collections.snapshot && (
              <label>
                Group collection
                <select
                  aria-label="Group collection"
                  value=""
                  onChange={(event) => {
                    const collection = collections.snapshot?.collections.find(
                      (item) => item.id === event.target.value,
                    );
                    if (!collection) return;
                    const merged = [
                      ...new Set([...selected, ...collection.group_ids]),
                    ];
                    if (merged.length > 50) {
                      setCollectionError(
                        "Choose up to 50 groups. This collection exceeds the remaining audience capacity.",
                      );
                      return;
                    }
                    if (
                      collection.group_ids.some(
                        (id) => !groups.some((group) => group.id === id),
                      )
                    ) {
                      setCollectionError(
                        "A collection group is unavailable. Reload your library before continuing.",
                      );
                      return;
                    }
                    invalidateApproval();
                    setSelected(merged);
                    setCollectionError("");
                  }}
                >
                  <option value="">Choose a collection</option>
                  {collections.snapshot.collections.map((collection) => (
                    <option key={collection.id} value={collection.id}>
                      {collection.name} ({collection.group_ids.length})
                    </option>
                  ))}
                </select>
              </label>
            )}
            {collectionError && <p role="alert">{collectionError}</p>}
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
                  g.title
                    .toLocaleLowerCase()
                    .includes(filter.toLocaleLowerCase()),
                )
                .map((g) => (
                  <label key={g.id} className="campaign-target">
                    <input
                      type="checkbox"
                      checked={selected.includes(g.id)}
                      disabled={
                        !selected.includes(g.id) && selected.length >= 50
                      }
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
                Review group rules in All groups
              </Link>
            </p>
            <button
              type="button"
              className="gpp-secondary"
              onClick={() => audienceDialog.current?.close()}
            >
              Done selecting groups
            </button>
          </dialog>
        </section>
        <section className="panel campaign-compose" id="gppComposerSection">
          <div className="group-actions">
            <header className="gpp-compose-step-header">
              <span className="gpp-compose-step-number" aria-hidden="true">
                2
              </span>
              <span className="gpp-compose-step-copy">
                <h2 className="gpp-compose-step-title">Create your content</h2>
                <span className="gpp-compose-step-help">
                  Start fresh, edit one saved post, or add several saved posts.
                </span>
              </span>
            </header>
            {view === "automations" ? (
              <Button
                variant="outline"
                disabled={busy || cloudBusy}
                onClick={newDraft}
              >
                New draft
              </Button>
            ) : null}
          </div>
          {view === "automations" && (
            <details className="reference-draft-metadata">
              <summary>Campaign details</summary>
              <label htmlFor="campaign-title">
                Campaign title <span className="muted">(private)</span>
              </label>
              <input
                id="campaign-title"
                name="campaignTitle"
                autoComplete="off"
                maxLength={120}
                value={title}
                placeholder="Post title…"
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
                Only the post text below is intended for Facebook. Title and
                notes stay in StaySuite.
              </p>
            </details>
          )}
          <div className="unified-composer-box">
            <div className="composer-template-bar">
              <ComposeTemplatePicker
                variant="source"
                viewer={groupViewer}
                dirty={!!text.trim() || !!media.length}
                disabled={busy || cloudBusy || engineBusy}
                onSelect={(id) => setTemplateSelection({ id })}
              />
            </div>
            <div className="composer-divider">
              <span>OR WRITE A FRESH POST</span>
            </div>
            {templateNotice && (
              <p
                className="compose-template-notice"
                role={templateNotice.error ? "alert" : "status"}
              >
                {templateNotice.text}
              </p>
            )}
            <CampaignTextEditor
              actions={
                <>
                  <ComposeTemplatePicker
                    dirty={!!text.trim() || !!media.length}
                    viewer={groupViewer}
                    disabled={busy || cloudBusy || engineBusy}
                    onSelect={(id) => setTemplateSelection({ id })}
                  />
                  <ComposeSaveTemplate
                    text={text}
                    media={media}
                    viewer={groupViewer}
                    disabled={busy || cloudBusy || engineBusy}
                  />
                </>
              }
              value={text}
              onChange={(next) => {
                invalidateApproval();
                setText(next);
              }}
            />

            <div className="gpp-attach-strip">
              <button
                type="button"
                className="gpp-attach-btn"
                onClick={() =>
                  document.getElementById("campaign-media")?.click()
                }
              >
                <ImagePlus size={15} aria-hidden="true" />
                Media
              </button>
              <button
                type="button"
                className="gpp-attach-btn"
                disabled
                title="Image card designer is not implemented yet"
              >
                <FileImage size={15} aria-hidden="true" />
                Card
              </button>
              <ComposeLinkDialog
                value={text}
                disabled={busy || cloudBusy}
                onChange={(value) => {
                  invalidateApproval();
                  setText(value);
                }}
              />
              <span className="gpp-attach-counts">
                {text.length.toLocaleString()} characters · {media.length} media
              </span>
            </div>
          </div>
          <div className="campaign-assets">
            <h3 className="sr-only">Add photos or a video</h3>
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

            {busy && (
              <p role="status">Checking media and preparing previews…</p>
            )}
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
          </div>
        </section>
        <section className="panel campaign-review">
          <details className="reference-automation-settings">
            <summary>Advanced Automation Settings</summary>
            <div className="reference-settings-body">
              <h2>Pauses &amp; protection</h2>
              <label>
                Posting method
                <select
                  aria-label="Posting method"
                  value={settings.method}
                  disabled={cloudBusy || busy}
                  onChange={(e) => {
                    invalidateApproval();
                    setSettings({
                      ...settings,
                      method:
                        e.target.value === "direct" ? "direct" : "classic",
                    });
                  }}
                >
                  <option value="direct">
                    Direct — automatic text and photo posting
                  </option>
                  <option value="classic">Classic — browser composer</option>
                </select>
              </label>
              <p className="muted text-sm">
                Direct posts your approved campaign through the extension
                without opening each group composer. This version supports text
                and photos. Live compatibility must be validated separately.
              </p>
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
                    setSettings({
                      ...settings,
                      delayAfterFailure: e.target.checked,
                    });
                  }}
                />
                Keep the extra pause after a failure
              </label>
              <p className="muted text-sm">
                These settings organize waiting times. They cannot guarantee
                account protection. Refused or uncertain submissions stop the
                campaign for review.
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
                  setInterval(
                    e.target.value === "" ? NaN : Number(e.target.value),
                  );
                }}
              />
              <details>
                <summary>Interval help</summary>
                <p>
                  Waiting between posts cannot guarantee that your account will
                  avoid restrictions. Group rules may require longer waits. Stop
                  when Facebook shows a warning, restriction or access denial,
                  and check uncertain results before posting again.
                </p>
              </details>
            </div>
          </details>
          <div className="reference-compose-footer">
            <button
              type="button"
              className="gpp-secondary reference-preview"
              aria-label="Preview"
              onClick={() => reviewDialog.current?.showModal()}
            >
              <Eye size={17} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="gpp-secondary"
              disabled={
                !snapshot ||
                !settingsValid ||
                storageState !== "ready" ||
                busy ||
                cloudBusy ||
                loading ||
                !!error
              }
              title="Save this draft and choose a schedule"
              onClick={() => void openSchedule()}
            >
              Schedule
            </button>
            <button
              type="button"
              className="gpp-post-now"
              disabled={
                !parsed.success ||
                busy ||
                loading ||
                !!error ||
                engineBusy ||
                cloudBusy
              }
              onClick={() => {
                if (view !== "compose") {
                  reviewDialog.current?.showModal();
                  return;
                }
                if (!engine.status) engineConnectionDialog.current?.showModal();
                else void launchPostingEngine();
              }}
            >
              {engineBusy ? "Opening engine…" : "Post Now"}
            </button>
          </div>
          <dialog
            ref={reviewDialog}
            className="reference-dialog reference-review-dialog"
            aria-labelledby="post-review-title"
          >
            <header>
              <h2 id="post-review-title">Review your post</h2>
              <button
                type="button"
                aria-label="Close post review"
                onClick={() => reviewDialog.current?.close()}
              >
                ×
              </button>
            </header>
            {view === "automations" && (
              <>
                {" "}
                <details>
                  <summary>Post text help</summary>
                  <p>
                    Use accurate prices, dates and availability. Check whether
                    each group permits links, contact information and
                    promotional content. Changing text, media, target order,
                    interval or saved rule evidence invalidates plan approval.
                  </p>
                </details>
                <details>
                  <summary>Media help</summary>
                  <p>
                    Files stay in this browser tab until you choose Save
                    campaign privately. Saving uploads them to your private
                    StaySuite workspace. Nothing is sent to Facebook. Keep your
                    originals; unsaved edits are lost on reload. Facebook and
                    individual groups may impose different media limits. The
                    downloaded plan contains file names and fingerprints, not
                    the media files.
                  </p>
                </details>
              </>
            )}{" "}
            <h3>Post preview</h3>
            <div
              className="compose-facebook-preview"
              aria-label="Facebook post preview"
            >
              <header>
                <span className="compose-preview-avatar">
                  <UserRound size={22} aria-hidden="true" />
                </span>
                <div>
                  <strong>
                    {engine.status?.actor_name ??
                      (engine.status?.actor_id
                        ? `Facebook identity ${engine.status.actor_id}`
                        : "Your posting identity")}
                  </strong>
                  <span>Preview · Selected Facebook groups</span>
                </div>
              </header>
              <p className="campaign-post-preview">
                {text || "Your post text will appear here."}
              </p>
              {!!media.length && (
                <div className="compose-preview-media">
                  {media.map((asset, index) =>
                    asset.type.startsWith("video/") ? (
                      <video
                        key={asset.preview}
                        src={asset.preview}
                        controls
                        aria-label={`Preview attachment ${index + 1}: ${asset.name}`}
                      />
                    ) : (
                      <Image
                        key={asset.preview}
                        src={asset.preview}
                        width={600}
                        height={400}
                        unoptimized
                        alt={`Preview attachment ${index + 1}: ${asset.name}`}
                      />
                    ),
                  )}
                </div>
              )}
            </div>
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
            {view === "compose" ? (
              <>
                <p>
                  Post Now opens the posting engine and submits this exact saved
                  post to the selected groups using your connected Facebook
                  identity.
                </p>
                <Button
                  disabled={
                    !parsed.success ||
                    !confirmed ||
                    busy ||
                    cloudBusy ||
                    engineBusy ||
                    !engine.status
                  }
                  onClick={() => void launchPostingEngine()}
                >
                  Post Now
                </Button>
                <p>
                  {blockers.length} selected target(s) need rule or permission
                  review. Unreviewed targets cannot be published.
                </p>
              </>
            ) : (
              <>
                {" "}
                <div className="group-actions">
                  <Button
                    disabled={
                      !snapshot || !confirmed || busy || loading || !!error
                    }
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
                  {blockers.length} selected target(s) need rule or permission
                  review.
                </p>
                <Button disabled>
                  Start bulk posting — use the extension workspace
                </Button>
                <p className="muted text-sm">
                  Bulk posting is not available in this Preview. You can prepare
                  and download a campaign plan. Nothing is sent to Facebook.
                  Rules and posting permission need checking for every selected
                  group before publishing.
                </p>
              </>
            )}
          </dialog>
        </section>
        {view === "compose" && (
          <>
            <p role="status" className="compose-engine-message">
              {engineMessage}
            </p>
            {engineRun?.viewer === groupViewer && (
              <ComposeEngineProgress id={engineRun.id} viewer={groupViewer} />
            )}
            <dialog
              ref={engineConnectionDialog}
              className="reference-dialog"
              aria-labelledby="compose-engine-connection-title"
            >
              <header>
                <h2 id="compose-engine-connection-title">
                  Connect posting engine
                </h2>
                <button
                  type="button"
                  aria-label="Close engine connection"
                  onClick={() => engineConnectionDialog.current?.close()}
                >
                  ×
                </button>
              </header>
              <p>
                {isNativeSuite()
                  ? "Click Connect Facebook at the top of this extension. Keep Facebook signed in to this Chrome profile; no StaySuite dashboard tab is needed."
                  : "In Chrome, open StaySuite extension 0.5.4+ and choose the campaign workspace. Click Connect StaySuite and Facebook with this dashboard and Facebook open. This pairs the engine with your account and posting identity."}
              </p>
              <button
                type="button"
                className="gpp-secondary"
                disabled={engine.checking}
                onClick={() => void engine.refresh()}
              >
                Check engine connection
              </button>
              {engine.error && <p role="alert">{engine.error}</p>}
              {engine.status && (
                <p role="status">
                  Connected: Facebook identity {engine.status.actor_id}.{" "}
                  {engine.status.publisher_ready
                    ? "Direct publishing is verified for this profile."
                    : "Complete Direct publisher validation in the extension workspace before posting."}
                </p>
              )}
            </dialog>
          </>
        )}
        {view === "automations" && (
          <details className="panel campaign-save" aria-label="Save campaign">
            <summary>Save campaign</summary>
            <h2>Keep this campaign</h2>
            <p className="muted">
              Save text, group order and media to your private StaySuite
              workspace. This does not approve or start publishing.
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
                <Link href="/dashboard/activity">Open Activity</Link>
              </Button>
            </div>
            {storageState !== "ready" && (
              <p className="campaign-save-hint">
                Saving is{" "}
                {storageState === "checking" ? "being checked" : "unavailable"}.
                Unsaved text and attachments stay in this tab and are lost on
                reload. You can download the plan metadata from the review
                section.
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
          </details>
        )}
      </div>
      {view === "automations" && (
        <details className="reference-connection-details">
          <summary>Workspace connection</summary>
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
            <span className="subtle-badge">Extension controls publishing</span>
            {storageState === "unavailable" && (
              <Button
                variant="outline"
                onClick={() => setStorageCheck((value) => value + 1)}
              >
                Retry connection
              </Button>
            )}
          </aside>
        </details>
      )}
      <dialog
        ref={scheduleDialog}
        className="reference-dialog schedule-dialog"
        aria-labelledby="compose-schedule-title"
      >
        <header>
          <h2 id="compose-schedule-title">Schedule Post</h2>
          <button
            type="button"
            aria-label="Close schedule"
            onClick={() => scheduleDialog.current?.close()}
          >
            ×
          </button>
        </header>
        {scheduling && (
          <ScheduleEditor
            key={scheduling.id}
            campaignId={scheduling.id}
            campaignRevision={scheduling.revision}
            onSaved={(schedule) =>
              setCloudMessage(
                `Schedule ${schedule.state}. Open Automations to manage future runs.`,
              )
            }
          />
        )}
      </dialog>
    </div>
  );
}
