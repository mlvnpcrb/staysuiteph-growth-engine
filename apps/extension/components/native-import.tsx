import { useEffect, useState } from "react";
import {
  facebookLibrarySchema,
  type FacebookLibrary,
} from "@staysuite/validation";
import { nativeMessage } from "../lib/native-ui";
import { FACEBOOK_ORIGIN } from "../lib/facebook-store";
export function NativeImport({ viewer }: { viewer: string }) {
  const [library, setLibrary] = useState<FacebookLibrary | null>(null),
    [busy, setBusy] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    async function read() {
      try {
        const result: unknown = await chrome.runtime.sendMessage({
          type: "FACEBOOK_STATE",
        });
        const value =
          result && typeof result === "object" && "library" in result
            ? facebookLibrarySchema.safeParse(result.library)
            : null;
        if (active) setLibrary(value?.success ? value.data : null);
      } catch {
        /* User can explicitly reconnect. */
      }
    }
    void read();
    const timer = setInterval(() => void read(), 1500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  async function scan() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (
        !(await chrome.permissions.request({
          permissions: ["cookies", "tabs"],
          origins: [FACEBOOK_ORIGIN],
        }))
      )
        throw new Error("Facebook group access was not allowed.");
      const result: unknown = await chrome.runtime.sendMessage({
        type: "FACEBOOK_START",
      });
      if (
        !result ||
        typeof result !== "object" ||
        !("ok" in result) ||
        result.ok !== true
      )
        throw new Error(
          "Facebook groups could not be imported. Check the signed-in Facebook tab.",
        );
      setNotice(
        "Import started. Saved groups will appear here when the scan finishes.",
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setSaving(true);
    setError("");
    try {
      const result = await nativeMessage({
        type: "NATIVE_SYNC_GROUPS",
        viewer,
      });
      setNotice(
        `${result.saved} groups saved. Review group rules before posting.`,
      );
      window.dispatchEvent(new Event("staysuite:groups-synced"));
    } catch (error) {
      setError(error instanceof Error ? error.message : "Saving stopped.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="panel native-import">
      <h2>Import your Facebook groups</h2>
      <p>
        Uses Facebook in this Chrome profile. No StaySuite dashboard tab is
        required.
      </p>
      <div className="row">
        <button
          type="button"
          onClick={() => void scan()}
          disabled={busy || saving || library?.phase === "fetching"}
        >
          Sync Facebook groups
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={
            busy ||
            saving ||
            !library?.groups.length ||
            library.phase === "fetching"
          }
        >
          Save imported groups
        </button>
      </div>
      {library && (
        <p role="status">
          {library.groups.length} found · {library.phase}
          {library.error ? ` · ${library.error}` : ""}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
