import { useEffect, useState } from "react";
import { suiteFetch } from "@staysuite/ui";
import {
  campaignJobSchema,
  groupResponseSchema,
  type CampaignJob,
  type ComposeEngineOpen,
} from "@staysuite/validation";
import { nativeMessage } from "../lib/native-ui";
export function NativeValidation({
  input,
  initial,
  close,
}: {
  input: ComposeEngineOpen;
  initial: CampaignJob;
  close: () => void;
}) {
  const [job, setJob] = useState(initial),
    [consent, setConsent] = useState(false),
    [receiptChecked, setReceiptChecked] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const receipt = job.targets.find(
    (target) =>
      ["live", "pending_admin"].includes(target.state) && target.post_url,
  );
  const attempted = job.targets.some((target) => target.state !== "queued");
  const [firstGroup, setFirstGroup] = useState<{
    title: string;
    url: string;
  } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void suiteFetch("/api/groups", {
      signal: controller.signal,
      headers: { "x-staysuite-viewer": input.viewer_id },
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("The selected group could not be checked.");
        const value = groupResponseSchema.parse(await response.json());
        if (value.viewer_id !== input.viewer_id)
          throw new Error("Account changed.");
        const group = value.groups?.find(
          (item) => item.id === initial.targets[0]?.group_id,
        );
        if (!group) throw new Error("The first selected group is unavailable.");
        if (!controller.signal.aborted)
          setFirstGroup({ title: group.title, url: group.url });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error ? error.message : "Group check failed.",
          );
      });
    return () => controller.abort();
  }, [input.viewer_id, initial]);
  async function trial() {
    if (!consent || !firstGroup || busy || attempted) return;
    setBusy(true);
    setError("");
    try {
      const result = await nativeMessage({
        type: "NATIVE_VALIDATE_ONE",
        input: { ...input, revision: job.revision, digest: job.digest },
      });
      setJob(campaignJobSchema.parse(result.job));
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Validation stopped. Check the saved result before retrying.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!receipt?.post_url || !receiptChecked || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await nativeMessage({
        type: "NATIVE_CONFIRM_VALIDATION",
        id: job.id,
        revision: job.revision,
        digest: job.digest,
        actor_id: input.actor_id,
        post_url: receipt.post_url,
        reviewed: true,
      });
      setJob(campaignJobSchema.parse(result.job));
      setConfirmed(true);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Validation confirmation failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="panel native-validation"
      aria-labelledby="native-validation-title"
    >
      <h2 id="native-validation-title">First posting check</h2>
      <p>
        This profile needs one real compatibility check before automatic group
        posting is enabled.
      </p>
      <p>
        Facebook profile: {input.actor_id}. The first selected group will
        receive the exact message below and {job.plan.media.length}{" "}
        attachment(s). The other groups will wait.
      </p>
      <pre className="native-validation-text">{job.plan.text}</pre>
      <p>
        First selected group:{" "}
        {firstGroup
          ? `${firstGroup.title} · ${firstGroup.url}`
          : "Checking selected group…"}
      </p>
      {job.plan.media.length > 0 && (
        <ul>
          {job.plan.media.map((media) => (
            <li key={media.sha256}>
              {media.name} · {media.type} · {media.size} bytes
            </li>
          ))}
        </ul>
      )}
      {!attempted && (
        <>
          <label>
            <input
              type="checkbox"
              checked={consent}
              disabled={busy || !firstGroup}
              onChange={(event) => setConsent(event.target.checked)}
            />{" "}
            I authorize one real post with this exact content to the first
            selected group.
          </label>
          <button
            type="button"
            disabled={!consent || !firstGroup || busy}
            onClick={() => void trial()}
          >
            Publish one validation post
          </button>
        </>
      )}
      {attempted && (
        <p role="status">
          Result: {job.targets[0]?.state}. {job.stop_reason}
        </p>
      )}
      {receipt?.post_url && !confirmed && (
        <>
          <a href={receipt.post_url} target="_blank" rel="noreferrer">
            Inspect this post in Facebook
          </a>
          <label>
            <input
              type="checkbox"
              checked={receiptChecked}
              disabled={busy}
              onChange={(event) => setReceiptChecked(event.target.checked)}
            />{" "}
            I checked this exact post and its content on Facebook.
          </label>
          <button
            type="button"
            disabled={!receiptChecked || busy}
            onClick={() => void confirm()}
          >
            Confirm this profile
          </button>
        </>
      )}
      {confirmed && (
        <p role="status">
          Profile validation confirmed. This check already sent one post; review
          its result before creating another run.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <button type="button" disabled={busy} onClick={close}>
        Return to Compose
      </button>
    </section>
  );
}
