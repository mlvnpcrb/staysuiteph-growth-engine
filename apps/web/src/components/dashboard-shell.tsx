"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import {
  FilePenLine,
  Copy,
  Layers,
  Radar,
  CalendarDays,
  Users,
  Compass,
  ShieldCheck,
  Settings,
  SunMoon,
} from "lucide-react";
import { navigation, type Section } from "@staysuite/types";
import { Button } from "@staysuite/ui";
import { signOut } from "@/app/login/actions";
const icons = {
  compose: FilePenLine,
  templates: Copy,
  automations: Layers,
  "lead-radar": Radar,
  activity: CalendarDays,
  "my-groups": Users,
  "group-finder": Compass,
  "ai-post-studio": FilePenLine,
  "account-safety": ShieldCheck,
  settings: Settings,
} satisfies Record<Section, typeof FilePenLine>;
export function DashboardShell({
  children,
  demo,
}: {
  children: React.ReactNode;
  demo: boolean;
}) {
  const path = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const link = (item: (typeof navigation)[number]) => {
    const Icon = icons[item.slug];
    return (
      <Link
        key={item.slug}
        href={`/dashboard/${item.slug}`}
        aria-current={path === `/dashboard/${item.slug}` ? "page" : undefined}
        className={`reference-nav-link ${path === `/dashboard/${item.slug}` ? "active" : ""}`}
      >
        <Icon size={17} aria-hidden="true" />
        <span>{item.label}</span>
        {item.availability === "planned" ? (
          <span className="nav-new">Not implemented</span>
        ) : null}
      </Link>
    );
  };
  return (
    <div className="reference-workspace">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="reference-header">
        <Link href="/dashboard/compose" className="reference-wordmark">
          StaySuite
        </Link>
        <div className="reference-header-actions">
          {demo ? <span className="preview-badge">Demo workspace</span> : null}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Toggle color theme"
            onClick={() =>
              setTheme(resolvedTheme === "dark" ? "light" : "dark")
            }
          >
            <SunMoon size={19} />
          </Button>
          {!demo ? (
            <form action={signOut}>
              <Button variant="ghost" type="submit">
                Sign out
              </Button>
            </form>
          ) : null}
        </div>
      </header>
      <nav aria-label="Main navigation" className="reference-navigation">
        <div className="reference-primary-nav">
          {navigation.filter((item) => item.category === "primary").map(link)}
        </div>
        <div className="reference-tool-nav">
          {navigation.filter((item) => item.category !== "primary").map(link)}
        </div>
      </nav>
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
