import { useEffect, useState } from "react";
import {
  campaignJobSchema,
  composeEngineOpenSchema,
  type CampaignJob,
  type ComposeEngineOpen,
} from "@staysuite/validation";
import { CampaignBuilder } from "../../web/src/components/campaigns/campaign-builder";
import { TemplateLibrary } from "../../web/src/components/templates/template-library";
import { AutomationWorkspace } from "../../web/src/components/automations/automation-workspace";
import { RadarWorkspace } from "../../web/src/components/radar/radar-workspace";
import { PostingQueue } from "../../web/src/components/campaigns/posting-queue";
import { MyGroups } from "../../web/src/components/groups/my-groups";
import {
  installNativeUi,
  nativeMessage,
  allowNativeAccount,
  setNativeViewer,
  nativeHref,
} from "../lib/native-ui";
import { NativeValidation } from "./native-validation";
import { NativeImport } from "./native-import";
import "../generated/suite.css";
import "../native-suite.css";
installNativeUi();
const sections = [
  ["compose", "Compose"],
  ["templates", "Templates"],
  ["automations", "Automations"],
  ["lead-radar", "Lead Radar"],
  ["activity", "Activity"],
  ["my-groups", "All groups"],
] as const;
type User = { id: string; email: string };
function userFrom(value: unknown): User | null {
  return value &&
    typeof value === "object" &&
    "id" in value &&
    typeof value.id === "string" &&
    "email" in value &&
    typeof value.email === "string"
    ? { id: value.id, email: value.email }
    : null;
}
const sectionFromLocation = () =>
  location.hash.replace(/^#\/dashboard\//, "").split("?")[0] || "compose";
export function NativeSuite() {
  const [user, setUser] = useState<User | null>(null),
    [checking, setChecking] = useState(true),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [section, setSection] = useState(sectionFromLocation),
    [groupsVersion, setGroupsVersion] = useState(0);
  const [validation, setValidation] = useState<{
    input: ComposeEngineOpen;
    job: CampaignJob;
  } | null>(null);
  useEffect(() => {
    document.documentElement.lang = "en";
    let active = true;
    const refresh = async () => {
      try {
        const result = await nativeMessage({ type: "NATIVE_USER" });
        const next = userFrom(result.user);
        if (active) {
          setNativeViewer(next?.id ?? "");
          setUser(next);
          setChecking(false);
        }
      } catch (error) {
        if (active) {
          setChecking(false);
          setError(
            error instanceof Error ? error.message : "Account unavailable.",
          );
        }
      }
    };
    void refresh();
    const route = () => {
      setSection(sectionFromLocation());
      setValidation(null);
    };
    const trial = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const value: unknown = event.detail;
      if (
        !value ||
        typeof value !== "object" ||
        !("input" in value) ||
        !("job" in value)
      )
        return;
      const input = composeEngineOpenSchema.safeParse(value.input),
        job = campaignJobSchema.safeParse(value.job);
      if (input.success && job.success)
        setValidation({ input: input.data, job: job.data });
    };
    const groups = () => setGroupsVersion((value) => value + 1);
    window.addEventListener("focus", refresh);
    window.addEventListener("hashchange", route);
    window.addEventListener("staysuite:native-validation", trial);
    window.addEventListener("staysuite:groups-synced", groups);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("hashchange", route);
      window.removeEventListener("staysuite:native-validation", trial);
      window.removeEventListener("staysuite:groups-synced", groups);
    };
  }, []);
  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await allowNativeAccount();
      const result = await nativeMessage({
        type: "NATIVE_SIGN_IN",
        email,
        password,
      });
      const next = userFrom(result.user);
      if (!next) throw new Error("Sign-in was not confirmed.");
      setNativeViewer(next.id);
      setUser(next);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Sign-in failed.");
    } finally {
      setPassword("");
      setBusy(false);
    }
  }
  async function signOut() {
    setBusy(true);
    setError("");
    try {
      await nativeMessage({ type: "NATIVE_SIGN_OUT" });
      setNativeViewer("");
      setUser(null);
      setValidation(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Sign-out failed.");
    } finally {
      setBusy(false);
    }
  }
  async function facebook() {
    setError("");
    try {
      if (
        !(await chrome.permissions.request({
          permissions: ["tabs"],
          origins: ["https://www.facebook.com/*"],
        }))
      )
        throw new Error("Facebook access was not allowed.");
      await nativeMessage({ type: "NATIVE_ENGINE_STATUS" });
      window.dispatchEvent(new Event("focus"));
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Facebook could not be connected.",
      );
    }
  }
  return (
    <div className="native-suite reference-workspace">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="reference-header">
        <span className="reference-wordmark">StaySuite</span>
        <div className="reference-header-actions">
          <button
            type="button"
            aria-label="Toggle color theme"
            onClick={() => document.documentElement.classList.toggle("dark")}
          >
            ◐
          </button>
          {user && (
            <>
              <span className="native-account">{user.email}</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void signOut()}
              >
                Sign out
              </button>
            </>
          )}
        </div>
      </header>
      {checking ? (
        <main id="main-content">
          <p role="status">Checking your StaySuite account…</p>
        </main>
      ) : !user ? (
        <main id="main-content" className="native-login">
          <h1>Sign in to StaySuite</h1>
          <p>
            Your groups, templates and posting queue stay inside this extension.
            No dashboard pairing is needed.
          </p>
          <form onSubmit={(event) => void signIn(event)}>
            <label>
              Email
              <input
                type="email"
                autoComplete="username"
                value={email}
                required
                disabled={busy}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                required
                disabled={busy}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <button type="submit" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
          {error && <p role="alert">{error}</p>}
        </main>
      ) : (
        <div key={user.id}>
          <nav className="native-navigation" aria-label="Main navigation">
            {sections.map(([slug, label]) => (
              <a
                key={slug}
                href={nativeHref(`/dashboard/${slug}`)}
                className={section === slug ? "active" : ""}
                aria-current={section === slug ? "page" : undefined}
              >
                {label}
              </a>
            ))}
          </nav>
          <section
            className="native-connection"
            aria-label="Facebook connection"
          >
            <button type="button" onClick={() => void facebook()}>
              Connect Facebook
            </button>
            <span>Uses Facebook signed in to this Chrome profile.</span>
          </section>
          {error && (
            <p className="native-error" role="alert">
              {error}
            </p>
          )}
          <main
            id="main-content"
            className="reference-main"
            key={`${section}:${groupsVersion}`}
          >
            {validation ? (
              <NativeValidation
                input={validation.input}
                initial={validation.job}
                close={() => {
                  setValidation(null);
                  setGroupsVersion((value) => value + 1);
                }}
              />
            ) : section === "templates" ? (
              <TemplateLibrary />
            ) : section === "automations" ? (
              <AutomationWorkspace />
            ) : section === "lead-radar" ? (
              <RadarWorkspace />
            ) : section === "activity" ? (
              <PostingQueue />
            ) : section === "my-groups" ? (
              <>
                <NativeImport viewer={user.id} />
                <MyGroups />
              </>
            ) : (
              <CampaignBuilder view="compose" />
            )}
          </main>
        </div>
      )}
    </div>
  );
}
