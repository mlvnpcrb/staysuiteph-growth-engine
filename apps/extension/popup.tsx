import { useState } from "react";
import { safeDashboardUrl } from "@staysuite/validation";
import "./style.css";
export default function Popup() {
  const [error, setError] = useState("");
  function openDashboard() {
    try {
      const origin = safeDashboardUrl(
        process.env.PLASMO_PUBLIC_DASHBOARD_URL || "http://localhost:3000",
      );
      window.open(
        `${origin}/dashboard/overview`,
        "_blank",
        "noopener,noreferrer",
      );
    } catch {
      setError(
        "Dashboard URL is invalid. Contact your workspace administrator.",
      );
    }
  }
  return (
    <main>
      <span className="wordmark">StaySuite</span>
      <span className="badge">Foundation preview</span>
      <h1>Your next connection starts here.</h1>
      <p>
        A companion for thoughtful Facebook Groups outreach. You stay in control
        of every final publish.
      </p>
      <section>
        <span className="dot" /> Not connected
        <p>No Facebook access, account monitoring, or publishing is active.</p>
      </section>
      <button onClick={openDashboard}>Open dashboard ↗</button>
      {error ? <p role="alert">{error}</p> : null}
      <small>
        Sign in securely on your dashboard. Extension pairing is planned for a
        later phase.
      </small>
    </main>
  );
}
