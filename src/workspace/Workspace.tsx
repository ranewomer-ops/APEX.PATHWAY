import {
  Car,
  ClipboardCheck,
  Gauge,
  GitBranch,
  LayoutDashboard,
  LogOut,
  Menu,
  Sparkles,
  WalletCards,
  Wrench
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { LogoMark } from "@/components/BootScreen";
import type { BuildRow } from "@/lib/types";
import { useApexStore } from "@/state/apexStore";
import { PageRouter } from "@/workspace/PageRouter";

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "planner", label: "Planner", icon: Sparkles },
  { id: "build", label: "Build Details", icon: Car },
  { id: "parts", label: "Parts", icon: Wrench },
  { id: "budget", label: "Budget", icon: WalletCards },
  { id: "timeline", label: "Timeline", icon: GitBranch },
  { id: "maintenance", label: "Maintenance", icon: ClipboardCheck },
  { id: "performance", label: "Performance", icon: Gauge }
] as const;

const PAGE_COPY: Record<string, [string, string]> = {
  dashboard: ["Dashboard", "Live build status, budget posture, and next operational actions."],
  planner: ["Customer Planner", "Turn a short customer brief into an editable Apex Pathway build plan."],
  build: ["Build Details", "Vehicle identity, build status, and user-owned project setup."],
  parts: ["Parts Management", "Supabase-backed part records with status-driven progress."],
  budget: ["Budget", "Automatic totals calculated from the current build parts."],
  timeline: ["Timeline", "Read-only project history generated from part status changes."],
  maintenance: ["Maintenance", "Independent service tracking for the selected build."],
  performance: ["Performance Estimator", "Boosted power range modeling with reliability warnings."]
};

function getRoute(): string {
  const route = window.location.hash.replace(/^#\/?/, "").split("?")[0];
  return route || "dashboard";
}

function getCurrentBuild(builds: BuildRow[], currentBuildId: string | null) {
  return builds.find((b) => b.id === currentBuildId) || null;
}

export function Workspace() {
  const profile = useApexStore((s) => s.profile);
  const builds = useApexStore((s) => s.builds);
  const currentBuildId = useApexStore((s) => s.currentBuildId);
  const loading = useApexStore((s) => s.loading);
  const error = useApexStore((s) => s.error);
  const notice = useApexStore((s) => s.notice);
  const useFallback = useApexStore((s) => s.useFallbackWorkspace);
  const templatesFb = useApexStore((s) => s.templatesTouchedFallback);

  const [route, setRoute] = useState(getRoute);

  useEffect(() => {
    const onHash = () => setRoute(getRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const page = NAV_ITEMS.some((i) => i.id === route) ? route : "dashboard";
  const [title, subtitle] = PAGE_COPY[page] || PAGE_COPY.dashboard;
  const build = useMemo(() => getCurrentBuild(builds, currentBuildId), [builds, currentBuildId]);

  function toggleNav() {
    document.body.classList.toggle("nav-open");
  }

  async function onLogout() {
    await useApexStore.getState().logout();
  }

  async function onSelectBuild(id: string) {
    try {
      useApexStore.getState().setNotice("Working...");
      await useApexStore.getState().setCurrentBuild(id);
      useApexStore.getState().setNotice("Build loaded");
    } catch (e: unknown) {
      useApexStore.getState().setNotice(e instanceof Error ? e.message : "Error");
    }
  }

  return (
    <div className="app-shell">
      <div className="mobile-bar">
        <button className="btn icon-only ghost" type="button" onClick={toggleNav} aria-label="Open navigation">
          <Menu size={18} />
        </button>
        <LogoMark size={48} />
      </div>

      <aside className="sidebar" aria-label="Apex Pathway navigation">
        <div className="brand">
          <LogoMark size={54} />
          <div className="brand-title">
            <strong>Apex Pathway</strong>
            <span>Automotive SaaS</span>
          </div>
        </div>
        <nav className="side-nav">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <a
              key={item.id}
              className={`nav-link${item.id === page ? " active" : ""}`}
              href={`#/${item.id}`}
              onClick={() => document.body.classList.remove("nav-open")}
            >
                <Icon size={18} />
                {item.label}
              </a>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <div className="user-chip">
            <span>Signed in</span>
            <strong>{profile?.username || "Apex user"}</strong>
          </div>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="page-title">
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
          <div className="topbar-actions">
            <div className="field build-select">
              <span>Current build</span>
              <select
                value={currentBuildId || ""}
                disabled={!builds.length}
                onChange={(e) => void onSelectBuild(e.target.value)}
              >
                {!builds.length ? (
                  <option value="">No builds yet</option>
                ) : (
                  builds.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))
                )}
              </select>
            </div>
            <button className="btn ghost" type="button" onClick={() => void onLogout()}>
              <LogOut size={18} />
              Logout
            </button>
          </div>
        </header>

        {(useFallback || templatesFb) && (
          <div className="notice" style={{ marginBottom: 12 }}>
            {useFallback
              ? "Showing embedded demo project — your account has no builds yet. Create a build to persist data."
              : null}
            {templatesFb && !useFallback ? "Planner templates loaded from embedded fallback (database empty or migration pending)." : null}
          </div>
        )}

        {notice ? (
          <div className={/error|failed|invalid|required|not|missing|supabase/i.test(notice) ? "notice error" : "notice"}>
            {notice}
          </div>
        ) : null}

        {error ? <div className="notice error">{error}</div> : null}

        {loading ? <div className="skeleton" /> : <PageRouter page={page} build={build} />}
      </main>
    </div>
  );
}

export function runForm(
  e: FormEvent,
  action: () => Promise<void>,
  success = "Saved"
) {
  e.preventDefault();
  useApexStore.getState().setNotice("Working...");
  void action()
    .then(() => {
      useApexStore.getState().setNotice(success);
      window.setTimeout(() => useApexStore.getState().setNotice(""), 2400);
    })
    .catch((err: unknown) => {
      useApexStore.getState().setNotice(err instanceof Error ? err.message : "Something went wrong.");
    });
}
