"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import {
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Compass,
  FilePenLine,
  House,
  Layers,
  Menu,
  Moon,
  Radar,
  Settings,
  ShieldCheck,
  Sun,
  Users,
  X,
} from "lucide-react";
import { navigation } from "@staysuite/types";
import { Button } from "@staysuite/ui";
import { signOut } from "@/app/login/actions";
const icons = [
  House,
  Compass,
  Users,
  FilePenLine,
  Layers,
  CalendarDays,
  Radar,
  BarChart3,
  ShieldCheck,
  Settings,
];
export function DashboardShell({
  children,
  demo,
}: {
  children: React.ReactNode;
  demo: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  useEffect(() => {
    setMounted(true);
  }, []);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const drawer = document.getElementById("workspace-navigation");
    const links = drawer?.querySelectorAll<HTMLAnchorElement>("a[href]");
    const first = links?.[0];
    const last = links?.[links.length - 1];
    first?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Tab" && first && last) {
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    const resize = () => {
      if (window.matchMedia("(min-width: 851px)").matches) setOpen(false);
    };
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", resize);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", resize);
      // Restore focus only after React removes inert from the underlying page.
      document.getElementById("menu-toggle")?.focus();
    };
  }, [open]);
  const current =
    navigation.find((item) => pathname === `/dashboard/${item.slug}`)?.label ??
    "Workspace";
  return (
    <div className="workspace">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {open ? (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
      ) : null}
      <aside
        id="workspace-navigation"
        className={`sidebar ${open ? "sidebar-open" : ""}`}
        aria-label="Workspace navigation"
      >
        <Link
          className="brand"
          href="/dashboard/overview"
          onClick={() => setOpen(false)}
        >
          <span className="brand-mark">
            <House size={22} />
          </span>
          <span>
            StaySuite<span className="brand-subtitle">Growth Engine</span>
          </span>
        </Link>
        <div className="workspace-label">
          <span className="avatar small">PH</span>
          <div>
            Philippines workspace<small>Accommodation community</small>
          </div>
        </div>
        <p className="nav-caption">Workspace</p>
        <nav aria-label="Main navigation">
          {navigation.map((item, index) => {
            const Icon = icons[index] ?? House;
            const active = pathname === `/dashboard/${item.slug}`;
            return (
              <Link
                key={item.slug}
                href={`/dashboard/${item.slug}`}
                className={`nav-link ${active ? "active" : ""}`}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
              >
                <Icon size={19} aria-hidden="true" />
                <span>{item.label}</span>
                {item.slug === "ai-post-studio" ? (
                  <span className="nav-new">Soon</span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-note">
          <ShieldCheck size={22} />
          <strong>Your pace. Your control.</strong>
          <p>Review every draft. You choose when and where to publish.</p>
          <Link href="/dashboard/account-safety" onClick={() => setOpen(false)}>
            Our safety approach <ArrowUpRight size={14} />
          </Link>
        </div>
        <div className="sidebar-footer">
          <span className="status-dot" /> Foundation preview <span>v0.1</span>
        </div>
      </aside>
      <div className="workspace-body" inert={open ? true : undefined}>
        <header className="topbar">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              id="menu-toggle"
              className="mobile-menu"
              variant="ghost"
              size="icon"
              aria-label={open ? "Close navigation" : "Open navigation"}
              aria-expanded={open}
              aria-controls="workspace-navigation"
              onClick={() => setOpen(!open)}
            >
              {open ? <X size={20} /> : <Menu size={20} />}
            </Button>
            <span className="muted hidden sm:inline">Workspace</span>
            <span className="muted hidden sm:inline">/</span>
            <span className="truncate font-medium">{current}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="preview-badge">
              {demo ? "Demo workspace" : "Foundation preview"}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Toggle color theme"
              onClick={() =>
                setTheme(resolvedTheme === "dark" ? "light" : "dark")
              }
            >
              {mounted && resolvedTheme === "dark" ? (
                <Sun size={19} />
              ) : (
                <Moon size={19} />
              )}
            </Button>
            <span className="avatar" aria-label="Philippines workspace">
              PH
            </span>
            {!demo ? (
              <form action={signOut}>
                <Button variant="ghost" type="submit">
                  Sign out
                </Button>
              </form>
            ) : null}
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          {children}
        </main>
        <footer className="page-footer">
          Built for meaningful stays in the Philippines.
          <span>Asia/Manila · All publishing stays in your hands</span>
        </footer>
      </div>
    </div>
  );
}
