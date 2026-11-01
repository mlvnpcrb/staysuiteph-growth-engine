import Link from "next/link";
import { Compass, ShieldCheck, Settings } from "lucide-react";
import { Button } from "@staysuite/ui";
import type { Section } from "@staysuite/types";
export function EmptySection({
  section,
  title,
  description,
}: {
  section: Section;
  title: string;
  description: string;
}) {
  const planned = [
    "ai-post-studio",
    "lead-radar",
    "templates",
    "group-finder",
  ].includes(section);
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h1>{title}</h1>
          <p className="muted">{description}</p>
        </div>
        {planned ? (
          <span className="subtle-badge">Planned · not implemented</span>
        ) : null}
      </div>
      {section === "account-safety" ? (
        <section className="panel safety-principles">
          <ShieldCheck size={32} />
          <h2>Review before running a campaign</h2>
          <ul>
            <li>Check each group’s current rules and posting permission.</li>
            <li>
              Approve the exact campaign content, media, and selected groups.
              Changes require review again.
            </li>
            <li>
              Publishing requires a connected extension and validation for the
              selected posting method.
            </li>
            <li>
              Pause on warnings, restrictions, or uncertain outcomes. An
              interval is not an account-safety guarantee.
            </li>
          </ul>
          <p className="muted">
            This page explains the workflow. It does not monitor or certify your
            Facebook account.
          </p>
        </section>
      ) : section === "settings" ? (
        <section className="panel safety-principles">
          <Settings size={32} />
          <h2>Workspace preferences</h2>
          <p>
            Switch light and dark themes using the theme button in the top bar.
            Manage your extension connection and group imports from All groups.
          </p>
          <Button asChild variant="outline">
            <Link href="/dashboard/my-groups">
              Manage groups and connection
            </Link>
          </Button>
        </section>
      ) : (
        <section className="empty-state panel">
          <span className="empty-icon">
            <Compass size={32} />
          </span>
          <h2>{title} is not implemented yet.</h2>
          <p>{description}</p>
          <Button asChild variant="outline">
            <Link href="/dashboard/compose">Back to Compose</Link>
          </Button>
        </section>
      )}
    </div>
  );
}
