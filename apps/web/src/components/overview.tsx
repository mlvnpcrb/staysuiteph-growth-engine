import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Compass,
  FilePenLine,
  Layers,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { Button } from "@staysuite/ui";
export function Overview() {
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="status-dot" /> A little direction for your next big
            stay
          </div>
          <h1>Make room for growth.</h1>
          <p className="muted">
            Your communities, stories, and next steps. All in one thoughtful
            workspace.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/group-finder">
            <Compass size={17} /> Explore Group Finder
          </Link>
        </Button>
      </div>
      <section className="welcome-panel" aria-label="Welcome to StaySuite">
        <div>
          <span className="welcome-kicker">
            Good stays start with good connections
          </span>
          <h2>
            Find your people.
            <br />
            Share your place.
          </h2>
          <p>
            A calmer way to prepare your Facebook Groups outreach, built around
            the communities that matter to you.
          </p>
          <Link className="welcome-link" href="/dashboard/campaigns">
            Explore your workspace <ArrowRight size={18} />
          </Link>
        </div>
        <div className="stay-illustration" aria-hidden="true">
          <div className="sun-disc" />
          <div className="island island-back" />
          <div className="villa">
            <div className="roof" />
            <div className="villa-windows">
              <i />
              <i />
              <i />
            </div>
            <div className="villa-door" />
          </div>
          <div className="island island-front" />
          <div className="water-line one" />
          <div className="water-line two" />
          <span className="illustration-caption">
            A fresh perspective, closer to home.
          </span>
        </div>
      </section>
      <div className="section-heading">
        <h2>Your workspace, ready to begin</h2>
        <span className="muted text-sm">No live activity connected</span>
      </div>
      <section className="metric-grid" aria-label="Workspace activity">
        {[
          {
            label: "Saved groups",
            icon: Users,
            note: "Build your community shortlist",
          },
          {
            label: "Prepared drafts",
            icon: FilePenLine,
            note: "Give your property a voice",
          },
          {
            label: "Active campaigns",
            icon: Layers,
            note: "Bring your next plan together",
          },
        ].map(({ label, icon: Icon, note }) => (
          <article key={label} className="metric-card">
            <div className="flex items-center justify-between">
              <span className="muted text-sm">{label}</span>
              <Icon size={20} className="text-teal-700 dark:text-teal-300" />
            </div>
            <p className="metric-value">—</p>
            <p className="muted text-sm">{note}</p>
          </article>
        ))}
      </section>
      <div className="overview-grid">
        <section className="panel getting-started">
          <div className="section-heading">
            <h2>A good place to start</h2>
            <span className="subtle-badge">Foundation</span>
          </div>
          <p className="muted text-sm">
            Get to know the tools taking shape for your hosting journey.
          </p>
          <div className="start-list">
            {[
              {
                n: "01",
                title: "Discover your communities",
                body: "A dedicated space for group relevance and verified rules.",
                href: "group-finder",
                icon: Compass,
              },
              {
                n: "02",
                title: "Prepare something worth sharing",
                body: "A future studio for property stories, with your review built in.",
                href: "ai-post-studio",
                icon: Sparkles,
              },
              {
                n: "03",
                title: "Plan at your own pace",
                body: "Sequential preparation, clear delays, and final control for you.",
                href: "posting-queue",
                icon: Layers,
              },
            ].map(({ n, title, body, href, icon: Icon }) => (
              <Link className="start-item" key={n} href={`/dashboard/${href}`}>
                <span className="step-number">{n}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </div>
                <Icon size={20} className="step-icon" />
                <ArrowUpRight size={18} className="muted" />
              </Link>
            ))}
          </div>
        </section>
        <section className="panel safety-panel">
          <div className="safety-icon">
            <ShieldCheck size={28} />
          </div>
          <h2>
            Confidence comes
            <br />
            from staying in control.
          </h2>
          <p className="muted">
            Group rules first. Thoughtful preparation. A fresh decision from you
            before every final publish.
          </p>
          <div className="connection-state">
            <span className="neutral-dot" />
            <div>
              <strong>Facebook not connected</strong>
              <p>No account activity is being monitored.</p>
            </div>
          </div>
          <Button asChild variant="outline">
            <Link href="/dashboard/account-safety">
              View safety principles <ArrowRight size={16} />
            </Link>
          </Button>
        </section>
      </div>
      <div className="foundation-notice">
        <Sparkles size={18} />
        <p>
          <strong>A foundation, with possibilities ahead.</strong> This preview
          contains no live Facebook data. Group discovery, AI generation,
          campaigns, and publishing integrations are not implemented yet.
        </p>
      </div>
    </div>
  );
}
