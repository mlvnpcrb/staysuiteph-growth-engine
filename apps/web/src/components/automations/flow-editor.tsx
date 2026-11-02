"use client";
import { suiteFetch } from "@staysuite/ui";
import { useEffect, useRef, useState } from "react";
import {
  automationDefinitionSchema,
  campaignListSchema,
  campaignRestoreSchema,
  campaignSettingsSchema,
  templateListSchema,
  groupResponseSchema,
  radarScopeSchema,
  type AutomationFlow,
  type AutomationStep,
  type CampaignJob,
  type CampaignList,
  type PostTemplate,
  type ScheduleCadence,
} from "@staysuite/validation";
import type { SavedGroup } from "@staysuite/types";
import { FlowTrigger } from "./flow-trigger";
import { flowCommand, prepareFlowPost, readFlows } from "./flow-api";
type PostStep = Extract<AutomationStep, { type: "post" }> & {
  template_ids: string[];
  group_ids: string[];
};
type DraftStep = Exclude<AutomationStep, { type: "post" }> | PostStep;
const selected = (event: React.ChangeEvent<HTMLSelectElement>) =>
  Array.from(event.target.selectedOptions, (option) => option.value);
const message = (error: unknown) =>
  error instanceof Error ? error.message : "Automation operation failed.";
async function read(path: string, viewer: string, signal?: AbortSignal) {
  const response = await suiteFetch(path, {
    cache: "no-store",
    signal: signal ?? null,
    headers: { "x-staysuite-viewer": viewer },
  });
  const body: unknown = await response.json();
  if (!response.ok)
    throw new Error(
      typeof body === "object" && body && "error" in body
        ? String(body.error)
        : "Automation resources are unavailable.",
    );
  return body;
}
export function FlowEditor({
  initial,
  viewer,
  onSaved,
  onDirtyChange,
  onBusyChange,
}: {
  initial: AutomationFlow | null;
  viewer: string;
  onSaved: (flow: AutomationFlow) => void;
  onDirtyChange: (dirty: boolean) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [stored, setStored] = useState(initial),
    [title, setTitle] = useState(initial?.title ?? "New automation"),
    [steps, setSteps] = useState<DraftStep[]>(() =>
      initial
        ? initial.definition.steps.map((step) =>
            step.type === "post"
              ? { ...step, template_ids: [], group_ids: [] }
              : step,
          )
        : [
            { id: crypto.randomUUID(), type: "trigger", cadence: null },
            {
              id: crypto.randomUUID(),
              type: "post",
              campaign_ids: [],
              template_ids: [],
              group_ids: [],
            },
          ],
    );
  const trigger = initial?.definition.steps[0];
  const [cadence, setCadence] = useState<ScheduleCadence | null | undefined>(
    trigger?.type === "trigger" ? trigger.cadence : null,
  );
  const [resources, setResources] = useState<{
      campaigns: CampaignList["campaigns"];
      templates: PostTemplate[];
      groups: SavedGroup[];
    } | null>(null),
    [error, setError] = useState(""),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(!initial),
    [review, setReview] = useState<{
      flow: AutomationFlow;
      jobs: CampaignJob[];
      assets: { id: string; url: string }[];
    } | null>(null),
    [confirmed, setConfirmed] = useState(false);
  const params =
    typeof window === "undefined"
      ? new URLSearchParams()
      : new URLSearchParams(window.location.search);
  const parsedScope = radarScopeSchema.safeParse(params.get("scope"));
  const handoff =
    parsedScope.success && params.get("viewer") === viewer
      ? parsedScope.data.split(":")
      : [];
  const [actorId, setActorId] = useState(initial?.actor_id ?? handoff[1] ?? ""),
    [actorType, setActorType] = useState<"personal" | "page">(
      initial?.actor_type ?? (handoff[0] === "page" ? "page" : "personal"),
    ),
    [interval, setInterval] = useState(2),
    [avoidNight, setAvoidNight] = useState(true),
    [pauseEvery, setPauseEvery] = useState(1),
    [pauseMinutes, setPauseMinutes] = useState(2),
    [delayAfterFailure, setDelayAfterFailure] = useState(true);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => onBusyChange(busy), [busy, onBusyChange]);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (review) {
      reviewHeading.current?.scrollIntoView({ block: "start" });
      reviewHeading.current?.focus({ preventScroll: true });
    }
  }, [review]);
  const requests = useRef(new Map<string, string>()),
    active = useRef(true);
  useEffect(() => {
    active.current = true;
    const controller = new AbortController();
    void Promise.all([
      read("/api/campaigns", viewer, controller.signal),
      read("/api/templates", viewer, controller.signal),
      read("/api/groups", viewer, controller.signal),
    ])
      .then(([c, t, g]) => {
        const campaigns = campaignListSchema.parse(c),
          templates = templateListSchema.parse(t),
          groups = groupResponseSchema.parse(g);
        if (
          campaigns.viewer_id !== viewer ||
          templates.viewer_id !== viewer ||
          groups.viewer_id !== viewer
        )
          throw new Error("Your account changed. Reopen Automations.");
        if (!controller.signal.aborted)
          setResources({
            campaigns: campaigns.campaigns,
            templates: templates.templates,
            groups: groups.groups ?? [],
          });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(message(error));
      });
    return () => {
      active.current = false;
      controller.abort();
    };
  }, [viewer]);
  function changed() {
    setDirty(true);
    setReview(null);
    setConfirmed(false);
    setStatus("");
  }
  function patch(id: string, update: (step: DraftStep) => DraftStep) {
    setSteps((items) =>
      items.map((step) => (step.id === id ? update(step) : step)),
    );
    changed();
  }
  function move(index: number, delta: number) {
    const next = index + delta;
    if (next < 1 || next >= steps.length) return;
    setSteps((items) => {
      const copy = [...items];
      [copy[index], copy[next]] = [copy[next]!, copy[index]!];
      return copy;
    });
    changed();
  }
  function add(type: "post" | "wait" | "loop" | "stop") {
    const id = crypto.randomUUID();
    const step: DraftStep =
      type === "post"
        ? { id, type, campaign_ids: [], template_ids: [], group_ids: [] }
        : type === "wait"
          ? { id, type, minutes: 60 }
          : type === "loop"
            ? {
                id,
                type,
                target_id: steps[1]?.id ?? steps[0]!.id,
                max_loops: 2,
              }
            : { id, type };
    setSteps((items) => [...items, step]);
    changed();
  }
  async function save() {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      if (cadence === undefined)
        throw new Error("Complete the Trigger dates and recurrence.");
      const compiled: AutomationStep[] = [];
      for (const step of steps) {
        if (step.type === "trigger") {
          compiled.push({ ...step, cadence });
          continue;
        }
        if (step.type !== "post") {
          compiled.push(step);
          continue;
        }
        const ids = [...step.campaign_ids];
        if (ids.length + step.template_ids.length > 10)
          throw new Error("Use up to 10 posts in a Post block.");
        for (const templateId of step.template_ids) {
          const template = resources?.templates.find(
            (item) => item.id === templateId,
          );
          if (!template)
            throw new Error(
              "A selected template is unavailable. Reopen the editor.",
            );
          const payload = {
            template_id: template.id,
            template_revision: template.revision,
            group_ids: step.group_ids,
            actor_id: actorId,
            actor_type: actorType,
            interval_minutes: interval,
            settings: campaignSettingsSchema.parse({
              method: "direct",
              avoidNight,
              pauseEvery,
              pauseMinutes,
              delayAfterFailure,
            }),
          };
          const fingerprint = JSON.stringify({ step_id: step.id, ...payload });
          let requestId = requests.current.get(fingerprint);
          if (!requestId) {
            requestId = crypto.randomUUID();
            requests.current.set(fingerprint, requestId);
          }
          const result = await prepareFlowPost(
            { request_id: requestId, ...payload },
            viewer,
          );
          ids.push(result.job.id);
          if (active.current)
            setResources((current) =>
              current
                ? {
                    ...current,
                    campaigns: [
                      ...current.campaigns.filter(
                        (job) => job.id !== result.job.id,
                      ),
                      result.job,
                    ],
                  }
                : current,
            );
        }
        compiled.push({ id: step.id, type: "post", campaign_ids: ids });
      }
      const definition = automationDefinitionSchema.parse({
        version: 1,
        steps: compiled,
      });
      const result = await flowCommand(
        stored
          ? {
              operation: "save",
              id: stored.id,
              revision: stored.revision,
              title,
              definition,
            }
          : { operation: "create", title, definition },
        viewer,
      );
      if (!result.flow)
        throw new Error("The saved automation was not returned.");
      if (!active.current) return;
      setStored(result.flow);
      setTitle(result.flow.title);
      setSteps(
        definition.steps.map((step) =>
          step.type === "post"
            ? { ...step, template_ids: [], group_ids: [] }
            : step,
        ),
      );
      setDirty(false);
      setReview(null);
      setConfirmed(false);
      onSaved(result.flow);
      setStatus(
        "Automation saved and paused. Review the exact posts before enabling.",
      );
    } catch (error) {
      if (active.current) setError(message(error));
    } finally {
      if (active.current) setBusy(false);
    }
  }
  async function reviewSaved() {
    if (!stored) return;
    setBusy(true);
    setError("");
    setReview(null);
    setConfirmed(false);
    try {
      const snapshot = await readFlows(viewer, stored.id);
      const current = snapshot.flows[0];
      if (!current?.digest)
        throw new Error(
          "A saved post is missing. Repair the Post blocks before enabling.",
        );
      if (
        current.title !== stored.title ||
        JSON.stringify(current.definition) !== JSON.stringify(stored.definition)
      )
        throw new Error(
          "The automation changed in another tab. Close and reopen the editor to review its current steps.",
        );
      const ids = [
        ...new Set(
          current.definition.steps.flatMap((step) =>
            step.type === "post" ? step.campaign_ids : [],
          ),
        ),
      ];
      const posts = await Promise.all(
        ids.map(async (id) => {
          const post = campaignRestoreSchema.parse(
            await read(`/api/campaigns?id=${id}`, viewer),
          );
          if (post.viewer_id !== viewer || post.job.user_id !== viewer)
            throw new Error("Your account changed. Reopen Automations.");
          return post;
        }),
      );
      if (!active.current) return;
      setStored(current);
      setReview({
        flow: current,
        jobs: posts.map((post) => post.job),
        assets: posts.flatMap((post) => post.assets),
      });
      onSaved(current);
    } catch (error) {
      if (active.current) setError(message(error));
    } finally {
      if (active.current) setBusy(false);
    }
  }
  async function enable() {
    if (!review || !confirmed) return;
    setBusy(true);
    setError("");
    try {
      const actor = review.jobs[0];
      if (
        !actor?.actor_id ||
        review.jobs.some(
          (job) =>
            job.actor_id !== actor.actor_id ||
            job.actor_type !== actor.actor_type,
        )
      )
        throw new Error("All posts must use the same Facebook identity.");
      const result = await flowCommand(
        {
          operation: "enable",
          id: review.flow.id,
          revision: review.flow.revision,
          digest: review.flow.digest!,
          reviewed: true,
          actor_id: actor.actor_id,
          actor_type: actor.actor_type,
        },
        viewer,
      );
      if (!result.flow)
        throw new Error("The enabled automation was not returned.");
      if (!active.current) return;
      setStored(result.flow);
      onSaved(result.flow);
      setConfirmed(false);
      setReview(null);
      setStatus(
        "Automation enabled. Your connected extension handles due steps.",
      );
    } catch (error) {
      if (active.current) {
        setError(message(error));
        setConfirmed(false);
        setReview(null);
      }
    } finally {
      if (active.current) setBusy(false);
    }
  }
  const locked = busy || stored?.state === "enabled";
  return (
    <form
      className="flow-editor"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      {error && <p role="alert">{error}</p>}
      {status && <p role="status">{status}</p>}
      {!resources && !error && (
        <p role="status">Loading templates and groups…</p>
      )}
      <fieldset disabled={locked || !resources}>
        <label>
          Automation name
          <input
            aria-label="Automation name"
            value={title}
            maxLength={120}
            required
            onChange={(event) => {
              setTitle(event.target.value);
              changed();
            }}
          />
        </label>
        <details>
          <summary>Settings for new template posts</summary>
          <div className="flow-post-settings">
            <label>
              Facebook identity ID
              <input
                aria-label="Facebook identity ID"
                value={actorId}
                pattern="[1-9][0-9]{0,79}"
                onChange={(e) => {
                  setActorId(e.target.value);
                  changed();
                }}
              />
            </label>
            <label>
              Identity type
              <select
                aria-label="Identity type"
                value={actorType}
                onChange={(e) => {
                  setActorType(e.target.value === "page" ? "page" : "personal");
                  changed();
                }}
              >
                <option value="personal">Personal profile</option>
                <option value="page">Page</option>
              </select>
            </label>
            <label>
              Minutes between groups
              <input
                aria-label="Minutes between groups"
                type="number"
                min={1}
                max={1440}
                value={Number.isFinite(interval) ? interval : ""}
                onChange={(e) => {
                  setInterval(e.target.valueAsNumber);
                  changed();
                }}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={avoidNight}
                onChange={(e) => {
                  setAvoidNight(e.target.checked);
                  changed();
                }}
              />
              Avoid night hours
            </label>
            <label>
              Pause every (groups)
              <input
                aria-label="Pause every groups"
                type="number"
                min={1}
                max={50}
                value={Number.isFinite(pauseEvery) ? pauseEvery : ""}
                onChange={(event) => {
                  setPauseEvery(event.target.valueAsNumber);
                  changed();
                }}
              />
            </label>
            <label>
              Pause duration (minutes)
              <input
                aria-label="Pause duration minutes"
                type="number"
                min={1}
                max={1440}
                value={Number.isFinite(pauseMinutes) ? pauseMinutes : ""}
                onChange={(event) => {
                  setPauseMinutes(event.target.valueAsNumber);
                  changed();
                }}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={delayAfterFailure}
                onChange={(event) => {
                  setDelayAfterFailure(event.target.checked);
                  changed();
                }}
              />
              Delay after failure
            </label>
            <p>
              Use the public ID of your connected Facebook identity. Dispatch
              rechecks the active identity and requires its verified Direct
              publisher. Text up to 10,000 characters and supported photos are
              available; AI and automatic video publishing remain unavailable.
            </p>
          </div>
        </details>
        <ol className="flow-steps">
          {steps.map((step, index) => (
            <li key={step.id}>
              <header>
                <strong>
                  {index + 1}.{" "}
                  {step.type[0]!.toUpperCase() + step.type.slice(1)}
                </strong>
                {index > 0 && (
                  <span className="flow-step-actions">
                    <button
                      type="button"
                      aria-label={`Move step ${index + 1} up`}
                      disabled={index === 1}
                      onClick={() => move(index, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={`Move step ${index + 1} down`}
                      disabled={index === steps.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove step ${index + 1}`}
                      onClick={() => {
                        setSteps((items) =>
                          items.filter((item) => item.id !== step.id),
                        );
                        changed();
                      }}
                    >
                      ×
                    </button>
                  </span>
                )}
              </header>
              {step.type === "trigger" && (
                <FlowTrigger
                  initial={step.cadence}
                  onChange={(value) => {
                    setCadence(value);
                    changed();
                  }}
                />
              )}
              {step.type === "post" && (
                <div className="flow-post-fields">
                  <label>
                    Saved posts
                    <select
                      multiple
                      size={3}
                      aria-label={`Step ${index + 1} saved posts`}
                      value={step.campaign_ids}
                      onChange={(e) => {
                        const ids = selected(e);
                        patch(step.id, (s) =>
                          s.type === "post" ? { ...s, campaign_ids: ids } : s,
                        );
                      }}
                    >
                      {[
                        ...step.campaign_ids.map(
                          (id) =>
                            resources?.campaigns.find(
                              (job) => job.id === id,
                            ) ?? {
                              id,
                              title: `Saved post ${id}`,
                              plan: { text: "" },
                            },
                        ),
                        ...(resources?.campaigns.filter(
                          (job) => !step.campaign_ids.includes(job.id),
                        ) ?? []),
                      ].map((job) => (
                        <option key={job.id} value={job.id}>
                          {job.title || job.plan.text.slice(0, 50)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Templates
                    <select
                      multiple
                      size={3}
                      aria-label={`Step ${index + 1} templates`}
                      value={step.template_ids}
                      onChange={(e) => {
                        const ids = selected(e);
                        patch(step.id, (s) =>
                          s.type === "post" ? { ...s, template_ids: ids } : s,
                        );
                      }}
                    >
                      {resources?.templates.map((template) => {
                        const supported =
                          template.state === "ready" &&
                          template.text.trim().length > 0 &&
                          template.text.length <= 10000 &&
                          !template.assets.some((asset) =>
                            asset.content_type.startsWith("video/"),
                          );
                        return (
                          <option
                            key={template.id}
                            value={template.id}
                            disabled={!supported}
                          >
                            {template.name} · v{template.revision}
                            {!supported ? " · unavailable" : ""}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                  {!!step.template_ids.length && (
                    <label>
                      Groups for selected templates
                      <select
                        multiple
                        size={4}
                        aria-label={`Step ${index + 1} template groups`}
                        value={step.group_ids}
                        onChange={(e) => {
                          const ids = selected(e);
                          patch(step.id, (s) =>
                            s.type === "post" ? { ...s, group_ids: ids } : s,
                          );
                        }}
                      >
                        {resources?.groups.map((group) => (
                          <option key={group.id} value={group.id}>
                            {group.title}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <p>
                    Posts run in the displayed order. Templates are saved as
                    exact versions; existing saved posts retain their own groups
                    and settings.
                  </p>
                </div>
              )}
              {step.type === "wait" && (
                <label>
                  Minutes
                  <input
                    aria-label={`Step ${index + 1} wait minutes`}
                    type="number"
                    min={1}
                    max={525600}
                    value={Number.isFinite(step.minutes) ? step.minutes : ""}
                    onChange={(e) => {
                      const minutes = e.target.valueAsNumber;
                      patch(step.id, (s) =>
                        s.type === "wait" ? { ...s, minutes } : s,
                      );
                    }}
                  />
                </label>
              )}
              {step.type === "loop" && (
                <div className="flow-loop-fields">
                  <label>
                    Loop back to
                    <select
                      aria-label={`Step ${index + 1} loop target`}
                      value={step.target_id}
                      onChange={(e) => {
                        const target_id = e.target.value;
                        patch(step.id, (s) =>
                          s.type === "loop" ? { ...s, target_id } : s,
                        );
                      }}
                    >
                      {steps.slice(0, index).map((target, i) => (
                        <option key={target.id} value={target.id}>
                          Step {i + 1}: {target.type}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={step.max_loops === null}
                      onChange={(e) => {
                        const max_loops = e.target.checked ? null : 2;
                        patch(step.id, (s) =>
                          s.type === "loop" ? { ...s, max_loops } : s,
                        );
                      }}
                    />
                    Loop forever
                  </label>
                  {step.max_loops !== null && (
                    <label>
                      Total passes
                      <input
                        aria-label={`Step ${index + 1} total passes`}
                        type="number"
                        min={1}
                        max={1000}
                        value={
                          Number.isFinite(step.max_loops) ? step.max_loops : ""
                        }
                        onChange={(e) => {
                          const max_loops = e.target.valueAsNumber;
                          patch(step.id, (s) =>
                            s.type === "loop" ? { ...s, max_loops } : s,
                          );
                        }}
                      />
                    </label>
                  )}
                  <p>
                    The backward segment must contain a Wait. Two passes means
                    two total visits.
                  </p>
                </div>
              )}
              {step.type === "stop" && (
                <p>End the automation here, including recurring triggers.</p>
              )}
            </li>
          ))}
        </ol>
        <div className="flow-actions">
          {(["post", "wait", "loop", "stop"] as const).map((type) => (
            <button
              type="button"
              className="gpp-secondary"
              key={type}
              disabled={steps.length >= 30}
              onClick={() => add(type)}
            >
              Add {type[0]!.toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>
        <button className="gpp-secondary" type="submit" disabled={!dirty}>
          Save automation
        </button>
      </fieldset>
      {stored && (
        <section className="flow-review">
          <p>
            Status: <strong>{stored.state}</strong>
            {stored.stop_reason ? ` · ${stored.stop_reason}` : ""}
          </p>
          <button
            type="button"
            className="gpp-secondary"
            disabled={busy || dirty || stored.state === "enabled"}
            onClick={() => void reviewSaved()}
          >
            Review automation
          </button>
          {dirty && <p>Save your changes before reviewing.</p>}
          {review && (
            <>
              <h3 ref={reviewHeading} tabIndex={-1}>
                Exact saved posts
              </h3>
              {review.jobs.map((job) => (
                <article key={job.id}>
                  <h4>{job.title}</h4>
                  <p className="flow-exact-text">{job.plan.text}</p>
                  <p>
                    {job.actor_type} {job.actor_id ?? "not connected"} ·{" "}
                    {job.settings.method} · {job.plan.intervalMinutes} minutes
                    between groups
                  </p>
                  <p>
                    Pause {job.settings.pauseMinutes} minutes every{" "}
                    {job.settings.pauseEvery} groups · night hours{" "}
                    {job.settings.avoidNight ? "avoided" : "allowed"} · delay
                    after failure{" "}
                    {job.settings.delayAfterFailure ? "on" : "off"}
                  </p>
                  <ul>
                    {job.targets.map((target) => (
                      <li key={target.id}>
                        {resources?.groups.find(
                          (group) => group.id === target.group_id,
                        )?.title ?? target.group_id}
                      </li>
                    ))}
                  </ul>
                  <ul>
                    {job.media.map((media) => {
                      const asset = review.assets.find(
                        (asset) => asset.id === media.id,
                      );
                      return (
                        <li key={media.id}>
                          {asset ? (
                            <a
                              href={asset.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              referrerPolicy="no-referrer"
                            >
                              {media.manifest.name}
                            </a>
                          ) : (
                            media.manifest.name
                          )}{" "}
                          · {media.manifest.size} bytes
                        </li>
                      );
                    })}
                  </ul>
                </article>
              ))}
              <p>
                Only a verified Direct profile can run this flow. Chrome,
                Facebook and StaySuite extension 0.5.3+ must remain available.
                Arm background schedule checks in the extension. Missing starts
                are skipped after 15 minutes; uncertain submissions stop for
                review.
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={busy}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                I reviewed these exact posts, identities, groups, attachments
                and ordered steps.
              </label>
              <button
                type="button"
                className="gpp-secondary"
                disabled={busy || !confirmed}
                onClick={() => void enable()}
              >
                Enable automation
              </button>
            </>
          )}
        </section>
      )}
    </form>
  );
}
