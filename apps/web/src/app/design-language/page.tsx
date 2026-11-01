import Link from "next/link";
import { Button } from "@staysuite/ui";
import { GroupReviewDemo } from "@/components/onboarding/group-review-demo";
import { DesignThemeToggle } from "@/components/onboarding/design-theme-toggle";
import "./showcase.css";

const palette = [
  ["Deep Twilight", "#03045e"],
  ["French Blue", "#023e8a"],
  ["Bright Teal Blue", "#0077b6"],
  ["Blue Green", "#0096c7"],
  ["Turquoise Surf", "#00b4d8"],
  ["Sky Aqua", "#48cae4"],
  ["Frosted Blue", "#90e0ef"],
  ["Pale Frost", "#ade8f4"],
  ["Light Cyan", "#caf0f8"],
] as const;

export const metadata = { title: "Coastal design language" };
export default function DesignLanguagePage() {
  return (
    <main className="coastal-showcase">
      <header className="coastal-showcase-header">
        <Link href="/dashboard/overview" className="coastal-wordmark">
          StaySuite<span>Coastal design language</span>
        </Link>
        <DesignThemeToggle />
      </header>
      <section className="coastal-showcase-intro">
        <p className="muted">Built around your coastal palette</p>
        <h1>A clearer way to grow.</h1>
        <p>
          Confident blue actions. Quiet surfaces. Useful motion. A shared visual
          language for the communities behind every stay.
        </p>
        <Button asChild>
          <Link href="/dashboard/overview">Open your workspace</Link>
        </Button>
      </section>
      <section
        aria-labelledby="palette-title"
        className="coastal-showcase-section"
      >
        <h2 id="palette-title">One palette. Clear roles.</h2>
        <p className="muted">
          Navy anchors the content. Blue signals action. Aqua supports selection
          and illustration.
        </p>
        <div className="coastal-palette">
          {palette.map(([name, hex]) => (
            <div key={hex}>
              <div
                className="coastal-swatch"
                style={{ backgroundColor: hex }}
              />
              <strong>{name}</strong>
              <span>{hex}</span>
            </div>
          ))}
        </div>
      </section>
      <div className="coastal-specimen-grid">
        <section className="panel" aria-labelledby="type-title">
          <h2 id="type-title">Readable by design</h2>
          <p className="coastal-type-sample">Your next good connection.</p>
          <p className="muted">
            Manrope pairs open letterforms with a clear hierarchy. Supporting
            copy stays readable, and numbers align for comparison.
          </p>
          <p className="coastal-number-sample">
            128 <span>saved communities · example</span>
          </p>
        </section>
        <section className="panel" aria-labelledby="states-title">
          <h2 id="states-title">Color with a purpose</h2>
          <p className="muted">
            Actions use blue. Status always includes a written label.
          </p>
          <div className="coastal-status-samples">
            <span className="review-pill review-reviewed">
              Personally reviewed
            </span>
            <span className="review-pill review-review_required">
              Rules need review
            </span>
            <span className="review-pill review-not_suitable">
              Not suitable
            </span>
          </div>
          <Button asChild>
            <Link href="/dashboard/my-groups">Review your groups</Link>
          </Button>
        </section>
      </div>
      <section className="coastal-demo-section" aria-labelledby="motion-title">
        <div>
          <h2 id="motion-title">Motion that explains the next step.</h2>
          <p className="muted">
            A Stageshow illustration of recording a personal rule review. Plays
            once, holds the result, and respects reduced motion.
          </p>
        </div>
        <GroupReviewDemo />
      </section>
      <footer>
        StaySuite Coastal · Interface foundations and an illustrated example. No
        live activity is shown on this page.
      </footer>
    </main>
  );
}
