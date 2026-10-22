import Link from "next/link";
import { Compass, ShieldCheck, Unplug } from "lucide-react";
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
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Your StaySuite workspace</span>
          <h1>{title}</h1>
          <p className="muted">{description}</p>
        </div>
        <span className="subtle-badge">Foundation preview</span>
      </div>
      {section === "account-safety" ? (
        <section className="panel safety-principles">
          <ShieldCheck size={32} />
          <h2>Thoughtful by design</h2>
          <ul>
            <li>Verify each group’s rules before preparing a post.</li>
            <li>
              You control every final publish in Facebook’s supported interface.
            </li>
            <li>Pause when Facebook presents a restriction or challenge.</li>
            <li>
              No CAPTCHA bypass, account rotation, or rate-limit circumvention.
            </li>
          </ul>
          <p className="muted">
            No Facebook connection or live account monitoring is implemented.
            This is guidance, not an account safety assessment.
          </p>
        </section>
      ) : (
        <section className="empty-state panel">
          <span className="empty-icon">
            {section === "settings" ? (
              <Unplug size={32} />
            ) : (
              <Compass size={32} />
            )}
          </span>
          <span className="subtle-badge">Not connected</span>
          <h2>
            {section === "settings"
              ? "Your preferences start here."
              : "A little space for what comes next."}
          </h2>
          <p>
            {section === "settings"
              ? "Use the theme button in the top bar to switch between light and dark. Supabase authentication can be configured by your workspace administrator."
              : `${title} is ready for its next chapter. There is no live data or functional integration in this Phase 1 preview.`}
          </p>
          <Button asChild variant="outline">
            <Link href="/dashboard/overview">Back to overview</Link>
          </Button>
        </section>
      )}
    </div>
  );
}
