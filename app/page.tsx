"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import Image from "next/image";
import type { Session } from "@supabase/supabase-js";
import { QRCodeSVG } from "qrcode.react";
import {
  addEmployeeHost,
  addGuest,
  approveDemoGuest,
  getReceptionWorkspace,
  getSupabase,
  hasSupabaseConfig,
  listEmployeeHosts,
  listGuests,
  listReceptionHosts,
  listReceptionMembers,
  removeEmployeeHost,
  removeReceptionMember,
  inviteReceptionMember,
  setGuestStatus,
  updateCompanyName,
  type EmployeeHost,
  type Guest,
  type GuestStatus,
} from "../lib/guests";

type IconName = "grid" | "users" | "chart" | "settings" | "search" | "plus" | "arrow" | "check" | "clock" | "close" | "download" | "logout" | "qr";

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  const paths: Record<IconName, ReactNode> = {
    grid: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    chart: <><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-5 5" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1a1.7 1.7 0 0 1-2.4 2.4l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a1.7 1.7 0 0 1-3.4 0v-.2a1.7 1.7 0 0 0-2.9-1.2l-.1.1a1.7 1.7 0 0 1-2.4-2.4l.1-.1a1.7 1.7 0 0 0-1.2-2.9H4a1.7 1.7 0 0 1 0-3.4h.2a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a1.7 1.7 0 0 1 2.4-2.4l.1.1a1.7 1.7 0 0 0 2.9-1.2V2a1.7 1.7 0 0 1 3.4 0v.2a1.7 1.7 0 0 0 2.9 1.2l.1-.1a1.7 1.7 0 0 1 2.4 2.4l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a1.7 1.7 0 0 1 0 3.4h-.2a1.7 1.7 0 0 0-1.2 2.9Z" transform="translate(-1 -1) scale(.96)" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    arrow: <><path d="M7 17 17 7M7 7h10v10" /></>,
    check: <><path d="m5 12 4 4L19 6" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></>,
    logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></>,
    qr: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3zM20 14v2M14 20h2M20 19v2M19 20h2" /></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

const avatarColors = ["rose", "blue", "amber", "violet", "teal", "orange", "pink"];
const statusLabels: Record<GuestStatus, string> = {
  pending_approval: "Pending approval",
  checked_in: "On site",
  checked_out: "Checked out",
};

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function formatTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function formatToday() {
  return new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date());
}

export default function Home() {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!hasSupabaseConfig);
  const [accessReady, setAccessReady] = useState(!hasSupabaseConfig);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [authError, setAuthError] = useState("");
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [realtimeError, setRealtimeError] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [receptionToken, setReceptionToken] = useState("");
  const [workspaceOwnerId, setWorkspaceOwnerId] = useState("");
  const [accessRole, setAccessRole] = useState<"admin" | "reception">("admin");
  const [accessError, setAccessError] = useState("");
  const [hostNames, setHostNames] = useState<string[]>([]);
  const [page, setPage] = useState("Overview");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  useEffect(() => {
    if (!hasSupabaseConfig) return;
    const client = getSupabase();
    if (!client) return;
    client.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) setAuthError(sessionError.message);
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: { subscription } } = client.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      setAuthError("");
      setAuthNotice("");
      if (event === "SIGNED_IN") {
        setAccessReady(false);
        setAccessError("");
        setWorkspaceOwnerId("");
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const refreshGuests = useCallback(async () => {
    setLoading(true);
    try {
      setGuests(await listGuests());
      setError("");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unable to load today's visitors.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authReady || (hasSupabaseConfig && !session)) return;
    void refreshGuests();
    getReceptionWorkspace().then(async (workspace) => {
      const hosts = workspace.role === "admin"
        ? (await listEmployeeHosts()).map((host) => host.name)
        : await listReceptionHosts(workspace.reception_token);
      setCompanyName(workspace.company_name);
      setReceptionToken(workspace.reception_token);
      setWorkspaceOwnerId(workspace.owner_id);
      setAccessRole(workspace.role);
      setAccessError("");
      setHostNames(hosts);
      setAccessReady(true);
    }).catch((cause: unknown) => {
      setAccessError(cause instanceof Error ? cause.message : "Unable to load your reception workspace.");
      setAccessReady(true);
    });
  }, [authReady, refreshGuests, session]);

  useEffect(() => {
    if (!hasSupabaseConfig || !session) return;
    const client = getSupabase();
    if (!client) return;
    const channel = client
      .channel(`guests:${session.user.id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "guests",
        filter: `owner_id=eq.${workspaceOwnerId}`,
      }, () => { void refreshGuests(); })
      .subscribe((status, subscriptionError) => {
        if (status === "SUBSCRIBED") {
          setRealtimeConnected(true);
          setRealtimeError("");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setRealtimeConnected(false);
          setRealtimeError(subscriptionError?.message ?? "Unable to connect to live visitor updates.");
        } else if (status === "CLOSED") {
          setRealtimeConnected(false);
        }
      });
    return () => {
      setRealtimeConnected(false);
      void client.removeChannel(channel);
    };
  }, [refreshGuests, session, workspaceOwnerId]);

  const stats = useMemo(() => ({
    total: guests.filter((guest) => guest.status === "checked_in" || guest.status === "checked_out").length,
    onSite: guests.filter((guest) => guest.status === "checked_in").length,
    checkedOut: guests.filter((guest) => guest.status === "checked_out").length,
    pending: guests.filter((guest) => guest.status === "pending_approval").length,
  }), [guests]);

  const filteredGuests = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return guests.filter((guest) => {
      const matchesQuery = !normalizedQuery || [
        guest.name, guest.email, guest.company, guest.host_name, guest.purpose,
      ].some((value) => value.toLowerCase().includes(normalizedQuery));
      return matchesQuery && (filter === "all" || guest.status === filter);
    });
  }, [filter, guests, query]);

  const arrivalHours = useMemo(() => {
    const startHour = 8;
    return Array.from({ length: 10 }, (_, index) => {
      const hour = startHour + index;
      return {
        hour,
        label: new Intl.DateTimeFormat("en", { hour: "numeric" }).format(new Date(2020, 0, 1, hour)),
        count: guests.filter((guest) => guest.checked_in_at !== null && new Date(guest.checked_in_at).getHours() === hour).length,
      };
    });
  }, [guests]);
  const maxArrivals = Math.max(3, ...arrivalHours.map((item) => item.count));
  const hostCounts = useMemo(() => {
    const counts = new Map<string, number>();
    guests.filter((guest) => guest.status === "checked_in" || guest.status === "checked_out")
      .forEach((guest) => counts.set(guest.host_name, (counts.get(guest.host_name) ?? 0) + 1));
    return [...counts.entries()].sort((first, second) => second[1] - first[1]).slice(0, 5);
  }, [guests]);

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");
    setAuthNotice("");
    const client = getSupabase();
    if (!client) return;
    const result = authMode === "signup"
      ? await client.auth.signUp({ email: authEmail, password: authPassword })
      : await client.auth.signInWithPassword({ email: authEmail, password: authPassword });
    if (result.error) setAuthError(result.error.message);
    else if (authMode === "signup" && !result.data.session) setAuthNotice("Check your inbox to confirm your email, then sign in.");
    else setSession(result.data.session);
  }

  async function handleSignOut() {
    const client = getSupabase();
    if (!client) return;
    const { error: signOutError } = await client.auth.signOut();
    if (signOutError) setError(signOutError.message);
  }

  async function handleAddVisitor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const host_name = String(form.get("host_name") ?? "").trim();
    const purpose = String(form.get("purpose") ?? "").trim();
    if (!name || !email || !host_name || !purpose) {
      setFormError("Enter the visitor's details, host, and visit purpose.");
      setSaving(false);
      return;
    }
    try {
      await addGuest({
        name,
        email,
        company: String(form.get("company") ?? "").trim(),
        host_name,
        purpose,
      }, receptionToken);
      setShowAdd(false);
      setNotice("Visitor request added. It is pending approval and the host will be notified after approval.");
      await refreshGuests();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Unable to add visitor.");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(guest: Guest) {
    const nextStatus: GuestStatus = guest.status === "checked_in" ? "checked_out" : "checked_in";
    try {
      await setGuestStatus(guest.id, nextStatus);
      await refreshGuests();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update visitor.");
    }
  }

  async function approveVisitor(guest: Guest) {
    setError("");
    setNotice("");
    setApprovingId(guest.id);
    try {
      if (!hasSupabaseConfig) {
        await approveDemoGuest(guest.id);
        setNotice("Visitor approved in demo mode. No email was sent; configure Supabase and Resend for real host notifications.");
      } else {
        const client = getSupabase();
        if (!client) throw new Error("Unable to connect to the workspace.");
        const { data, error: sessionError } = await client.auth.getSession();
        if (sessionError) throw sessionError;
        if (!data.session) throw new Error("Sign in again to approve visitors.");
        const response = await fetch(`/api/visitors/${encodeURIComponent(guest.id)}/approve`, {
          method: "POST",
          headers: { Authorization: `Bearer ${data.session.access_token}` },
        });
        const result = await response.json() as { error?: string; emailSent?: boolean };
        if (!response.ok) throw new Error(result.error || "Unable to approve visitor.");
        setNotice(result.emailSent
          ? `Visitor approved. An email notification was sent to ${guest.host_name}.`
          : result.error || `Visitor approved, but the notification to ${guest.host_name} is still pending.`);
      }
      await refreshGuests();
    } catch (cause) {
      await refreshGuests();
      setError(cause instanceof Error ? cause.message : "Unable to approve visitor.");
    } finally {
      setApprovingId(null);
    }
  }

  async function saveCompanyName(name: string) {
    await updateCompanyName(name);
    setCompanyName(name);
  }

  function getReceptionUrl() {
    return receptionToken ? `${window.location.origin}/check-in/${receptionToken}` : "";
  }

  function downloadReceptionQr() {
    const svg = document.querySelector("#reception-qr svg") as SVGSVGElement | null;
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "company-reception-check-in.svg";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  if (!authReady) return <main className="loading-screen"><span className="spinner" />Connecting to your workspace…</main>;

  if (hasSupabaseConfig && !session) {
    return (
      <main className="auth-screen">
        <div className="auth-card">
          <Image className="auth-logo" src="/tgm-logo.jpg" alt="TGM Marchnata" width={220} height={69} priority />
          <p className="eyebrow">TGM CHECK-IN</p>
          <h1>{authMode === "signin" ? "Welcome back" : "Set up your company"}</h1>
          <p className="auth-copy">{authMode === "signin" ? "Sign in with your company admin or invited reception team account." : "Create a company administrator account. Reception staff should use their email invitation to set a password."}</p>
          <form className="guest-form" onSubmit={handleAuth}>
            <label>Email address<input type="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} placeholder="you@company.com" autoComplete="email" required /></label>
            <label>Password<input type="password" value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} placeholder="At least 6 characters" autoComplete={authMode === "signin" ? "current-password" : "new-password"} minLength={6} required /></label>
            {authError && <p className="form-error">{authError}</p>}
            {authNotice && <p className="form-success">{authNotice}</p>}
            <button className="primary-button full-button" type="submit">{authMode === "signin" ? "Sign in" : "Create account"}</button>
          </form>
          <button className="text-button auth-toggle" onClick={() => { setAuthMode(authMode === "signin" ? "signup" : "signin"); setAuthError(""); setAuthNotice(""); }}>
            {authMode === "signin" ? "New to TGM? Set up your company" : "Already have an account? Sign in"}
          </button>
        </div>
      </main>
    );
  }

  if (hasSupabaseConfig && session && !accessReady) {
    return <main className="loading-screen"><span className="spinner" />Loading your reception access…</main>;
  }

  if (hasSupabaseConfig && session && accessError) {
    return <main className="auth-screen"><section className="auth-card"><Image className="auth-logo" src="/tgm-logo.jpg" alt="TGM Marchnata" width={220} height={69} priority /><p className="eyebrow">RECEPTION ACCESS</p><h1>Workspace unavailable</h1><p className="auth-copy">{accessError}</p><button className="primary-button full-button" onClick={handleSignOut}>Sign out</button></section></main>;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a href="#" className="brand" aria-label="TGM Check-in home"><Image className="brand-logo" src="/tgm-logo.jpg" alt="TGM Marchnata" width={190} height={60} priority /></a>
        <div className="workspace-select"><span className="workspace-icon">{(companyName || "C")[0].toUpperCase()}</span><span><strong>{companyName || "Your company"}</strong><small>Visitor workspace</small></span><span className="chevron">⌄</span></div>
        <p className="nav-label">WORKSPACE</p>
        <nav className="main-nav" aria-label="Main navigation">
          <button className={`nav-item ${page === "Overview" ? "active" : ""}`} onClick={() => setPage("Overview")}><Icon name="grid" />Overview</button>
          <button className={`nav-item ${page === "Visitors" ? "active" : ""}`} onClick={() => setPage("Visitors")}><Icon name="users" />Visitors<span className="nav-count">{stats.total}</span></button>
          <button className={`nav-item ${page === "Analytics" ? "active" : ""}`} onClick={() => setPage("Analytics")}><Icon name="chart" />Visitor report</button>
          {accessRole === "admin" && <button className={`nav-item ${page === "Settings" ? "active" : ""}`} onClick={() => setPage("Settings")}><Icon name="settings" />Settings</button>}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card"><div className="help-spark">✳</div><strong>Need a hand?</strong><p>We&apos;re here to make welcoming visitors a breeze.</p><a href="mailto:hello@tgmcheckin.com">Get in touch <Icon name="arrow" size={14} /></a></div>
          <div className="profile"><div className="profile-avatar">{initials(session?.user.email?.split("@")[0] || "Office admin")}</div><span><strong>{session?.user.email ?? "Office admin"}</strong><small>{hasSupabaseConfig ? accessRole === "admin" ? "Workspace admin" : "Reception team" : "Reception team"}</small></span>{session && <button className="icon-button profile-logout" aria-label="Sign out" onClick={handleSignOut}><Icon name="logout" /></button>}</div>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar"><div className="breadcrumb">{companyName || "Company"} <span>/</span> <strong>{page}</strong></div><div className="topbar-right"><span className="today-label">{formatToday()}</span><div className={`live-indicator ${!hasSupabaseConfig ? "demo" : realtimeConnected ? "" : "connecting"}`}><span />{!hasSupabaseConfig ? "Demo mode" : realtimeConnected ? "Live" : "Connecting"}</div></div></header>
        <div className="content">
          {(error || realtimeError) && <div className="error-banner" role="alert"><span>{error || realtimeError}</span><button className="text-button" onClick={() => { setError(""); setRealtimeError(""); }}>Dismiss</button></div>}
          {notice && <div className="success-banner" role="status"><span>{notice}</span><button className="text-button" onClick={() => setNotice("")}>Dismiss</button></div>}

          {page === "Overview" && <>
            <section className="page-heading"><div><p className="eyebrow">RECEPTION OVERVIEW</p><h1>Good morning <span className="wave">✳</span></h1><p className="heading-subtitle">Here&apos;s who&apos;s visiting {companyName || "your office"} today.</p></div><button className="primary-button" onClick={() => setShowAdd(true)}><Icon name="plus" size={17} /> Add visitor</button></section>
            {!hasSupabaseConfig && <div className="demo-note"><span className="demo-note-icon">i</span><span>Demo mode: visitor check-ins are saved in this browser.</span><button onClick={() => setPage("Settings")}>Connect Supabase <Icon name="arrow" size={13} /></button></div>}
            {stats.pending > 0 && <button className="pending-banner" onClick={() => { setPage("Visitors"); setFilter("pending_approval"); }}><span>{stats.pending} visitor{stats.pending === 1 ? "" : "s"} waiting for approval</span><span>Review arrivals <Icon name="arrow" size={14} /></span></button>}
            <section className="reception-banner"><div className="reception-icon"><Icon name="qr" size={22} /></div><div className="reception-info"><span className="event-kicker">YOUR FRONT DESK CHECK-IN</span><h2>One QR for every visitor</h2><p>Display this code at reception. Visitors submit their details for admin approval.</p></div><button className="reception-cta" onClick={() => setShowQr(true)}>Show QR code <Icon name="arrow" size={14} /></button><div className="banner-decoration banner-decoration-one" /><div className="banner-decoration banner-decoration-two" /></section>
            <section className="stats-grid" aria-label="Today's visitor statistics">
              <StatCard label="Visitors today" value={stats.total} caption="Approved visits today" icon="users" color="lavender" trend="Today" />
              <StatCard label="Currently on site" value={stats.onSite} caption="Visitors still in the office" icon="check" color="mint" trend="On site" />
              <StatCard label="Checked out" value={stats.checkedOut} caption="Visits completed today" icon="clock" color="peach" trend="Departed" />
            </section>
            <section className="dashboard-grid">
              <div className="panel arrivals-panel">
                <div className="panel-heading"><div><h2>Today&apos;s arrivals</h2><p>Visitor check-ins by hour</p></div><span className="chart-legend"><i /> Visitors</span></div>
                <div className="chart-wrap"><div className="chart-y-labels"><span>{maxArrivals}</span><span>{Math.round(maxArrivals * .75)}</span><span>{Math.round(maxArrivals * .5)}</span><span>{Math.round(maxArrivals * .25)}</span><span>0</span></div><div className="chart"><div className="chart-grid"><i /><i /><i /><i /><i /></div><div className="chart-bars">{arrivalHours.map((item) => <div key={item.hour} className={`chart-bar ${item.count > 0 ? "highlight" : ""}`} style={{ height: `${Math.max(item.count ? item.count / maxArrivals * 100 : 2, 2)}%` }} title={`${item.count} visitor${item.count === 1 ? "" : "s"} at ${item.label}`} />)}</div><div className="chart-x-labels">{arrivalHours.filter((item) => item.hour % 2 === 0).map((item) => <span key={item.hour}>{item.label}</span>)}</div></div></div>
                <div className="chart-foot"><span><i className="chart-foot-dot" /> Today&apos;s check-ins</span><strong>{stats.total} visitor{stats.total === 1 ? "" : "s"}</strong></div>
              </div>
              <div className="panel checkin-panel"><div className="panel-heading"><div><h2>Who&apos;s in the office</h2><p>Live visitor status</p></div><span className="live-small"><i /> {hasSupabaseConfig ? realtimeConnected ? "Live" : "Connecting" : "Demo"}</span></div><div className="donut-wrap"><div className="donut" style={{ "--progress": `${stats.total ? stats.onSite / stats.total * 100 : 0}%` } as React.CSSProperties}><div className="donut-center"><strong>{stats.onSite}</strong><span>on site now</span></div></div></div><div className="status-legend"><div><span className="legend-name"><i className="legend-checked" />On site</span><strong>{stats.onSite}</strong></div><div><span className="legend-name"><i className="legend-checked-out" />Checked out</span><strong>{stats.checkedOut}</strong></div></div></div>
            </section>
            <GuestTable guests={filteredGuests.slice(0, 5)} loading={loading} query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} onAdd={() => setShowAdd(true)} onStatus={changeStatus} onApprove={approveVisitor} approvingId={approvingId} canNotifyHost={hasSupabaseConfig} onSeeAll={() => setPage("Visitors")} />
          </>}

          {page === "Visitors" && <><section className="page-heading"><div><p className="eyebrow">TODAY&apos;S VISITOR LOG</p><h1>Visitors</h1><p className="heading-subtitle">Review arrivals, approve visitors, and manage who is on site.</p></div><button className="primary-button" onClick={() => setShowAdd(true)}><Icon name="plus" size={17} /> Add visitor</button></section><GuestTable guests={filteredGuests} loading={loading} query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} onAdd={() => setShowAdd(true)} onStatus={changeStatus} onApprove={approveVisitor} approvingId={approvingId} canNotifyHost={hasSupabaseConfig} /></>}

          {page === "Analytics" && <><section className="page-heading"><div><p className="eyebrow">DAILY VISITOR REPORT</p><h1>Visitor report</h1><p className="heading-subtitle">Office visitor activity for {formatToday()}.</p></div></section><section className="stats-grid"><StatCard label="Total visits" value={stats.total} caption="Recorded today" icon="users" color="lavender" trend="Today" /><StatCard label="Currently on site" value={stats.onSite} caption="Visitors in the office" icon="check" color="mint" trend="On site" /><StatCard label="Visits completed" value={stats.checkedOut} caption="Checked out today" icon="clock" color="peach" trend="Completed" /></section><section className="panel analytics-table"><div className="panel-heading"><div><h2>Visits by host</h2><p>Employees welcoming visitors today</p></div></div><div className="analytics-bars">{hostCounts.length ? hostCounts.map(([host, count]) => <div className="analytics-row" key={host}><span>{host}</span><div className="analytics-track"><i style={{ width: `${stats.total ? count / stats.total * 100 : 0}%`, background: "#5968de" }} /></div><strong>{count}</strong></div>) : <p className="settings-heading">No visitor activity recorded today.</p>}</div></section></>}

          {page === "Settings" && accessRole === "admin" && <SettingsPanel configured={hasSupabaseConfig} companyName={companyName} onShowQr={() => setShowQr(true)} onSaveCompanyName={saveCompanyName} onHostsChanged={async () => { const hosts = await listEmployeeHosts(); setHostNames(hosts.map((host) => host.name)); }} />}
        </div>
      </main>

      {showAdd && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowAdd(false); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="add-visitor-title"><div className="modal-heading"><div><p className="eyebrow">RECEPTION</p><h2 id="add-visitor-title">Add a visitor</h2><p>Record a visitor who is arriving at the office.</p></div><button className="icon-button" aria-label="Close" onClick={() => setShowAdd(false)}><Icon name="close" /></button></div><form className="guest-form" onSubmit={handleAddVisitor}><label>Full name<input name="name" placeholder="e.g. Jordan Lee" autoComplete="name" required maxLength={120} /></label><label>Email address<input name="email" type="email" placeholder="jordan@company.com" autoComplete="email" required maxLength={254} /></label><label>Company <span className="optional-label">Optional</span><input name="company" placeholder="e.g. Acme Inc." autoComplete="organization" maxLength={120} /></label><label>Who are they visiting?<select name="host_name" required defaultValue=""><option value="" disabled>Select an employee</option>{hostNames.map((host) => <option key={host} value={host}>{host}</option>)}</select></label><label>Purpose of visit<input name="purpose" placeholder="e.g. Meeting, interview, delivery" required maxLength={240} /></label>{formError && <p className="form-error" role="alert">{formError}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowAdd(false)}>Cancel</button><button type="submit" className="primary-button" disabled={saving || hostNames.length === 0}>{saving ? <><span className="button-spinner" /> Submitting…</> : <><Icon name="plus" size={16} /> Add for approval</>}</button></div></form></section></div>}

      {showQr && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowQr(false); }}><section className="modal qr-modal" role="dialog" aria-modal="true" aria-labelledby="qr-title"><div className="modal-heading"><div><p className="eyebrow">RECEPTION CHECK-IN</p><h2 id="qr-title">Your company QR code</h2><p>Display this reusable code at your reception desk.</p></div><button className="icon-button" aria-label="Close" onClick={() => setShowQr(false)}><Icon name="close" /></button></div><div className="qr-code-wrap" id="reception-qr">{receptionToken ? <QRCodeSVG value={getReceptionUrl()} size={220} level="H" includeMargin bgColor="#ffffff" fgColor="#202425" /> : <span className="spinner" />}</div><p className="qr-caption">Visitors scan to enter their details and check in at <strong>{companyName || "your office"}</strong>.</p><button className="primary-button full-button" onClick={downloadReceptionQr} disabled={!receptionToken}><Icon name="download" size={16} /> Download reception QR</button></section></div>}
    </div>
  );
}

function StatCard({ label, value, caption, icon, color, trend }: { label: string; value: string | number; caption: string; icon: IconName; color: string; trend: string }) {
  return <article className="stat-card"><div className={`stat-icon ${color}`}><Icon name={icon} size={19} /></div><div className="stat-label">{label}</div><div className="stat-value-row"><strong>{value}</strong><span className={`stat-trend ${color === "peach" ? "trend-neutral" : ""}`}>{trend}</span></div><p>{caption}</p></article>;
}

function GuestTable({
  guests,
  loading,
  query,
  setQuery,
  filter,
  setFilter,
  onAdd,
  onStatus,
  onApprove,
  approvingId,
  canNotifyHost,
  onSeeAll,
}: {
  guests: Guest[];
  loading: boolean;
  query: string;
  setQuery: (value: string) => void;
  filter: string;
  setFilter: (value: string) => void;
  onAdd: () => void;
  onStatus: (guest: Guest) => void;
  onApprove: (guest: Guest) => void;
  approvingId: string | null;
  canNotifyHost: boolean;
  onSeeAll?: () => void;
}) {
  return (
    <section className="panel guest-panel">
      <div className="guest-panel-heading"><div><div className="title-with-count"><h2>Today&apos;s visitors</h2><span className="table-count">{guests.length}</span></div><p>Review arrivals and manage visitor status</p></div>{onSeeAll && <button className="text-button see-all" onClick={onSeeAll}>View all visitors <Icon name="arrow" size={14} /></button>}</div>
      <div className="table-toolbar">
        <label className="search-box"><Icon name="search" size={17} /><input aria-label="Search visitors" placeholder="Search visitors..." value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <select aria-label="Filter visitors by status" className="filter-select" value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="all">All visitors</option><option value="pending_approval">Pending approval</option><option value="checked_in">On site</option><option value="checked_out">Checked out</option>
        </select>
      </div>
      <div className="table-scroll"><table>
        <thead><tr><th>VISITOR</th><th>STATUS</th><th>ARRIVAL</th><th>VISITING</th><th>COMPANY</th><th>PURPOSE</th><th aria-label="Actions" /></tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={7} className="table-message"><span className="spinner" />Loading today&apos;s visitors…</td></tr>
            : guests.length === 0 ? <tr><td colSpan={7} className="table-message"><div className="empty-state"><span className="empty-icon"><Icon name="users" size={21} /></span><strong>No visitors found</strong><span>Try another search or add a visitor to today&apos;s log.</span><button className="primary-button" onClick={onAdd}><Icon name="plus" size={16} /> Add visitor</button></div></td></tr>
              : guests.map((guest, index) => <tr key={guest.id}>
                <td><div className="guest-cell"><span className={`guest-avatar ${avatarColors[index % avatarColors.length]}`}>{initials(guest.name)}</span><span className="guest-name-cell"><strong>{guest.name}</strong><small>{guest.email}</small></span></div></td>
                <td><span className={`status-pill ${guest.status}`}><i />{statusLabels[guest.status]}</span>{guest.status === "checked_in" && guest.host_notified_at && <small className="notification-sent">Host notified</small>}</td>
                <td className="arrival-cell">{formatTime(guest.checked_in_at)}</td><td className="company-cell">{guest.host_name}</td><td className="company-cell">{guest.company || "—"}</td><td className="company-cell" title={guest.purpose}>{guest.purpose}</td>
                <td><div className="row-actions">
                  {guest.status === "pending_approval" && <button className="approve-action" disabled={approvingId === guest.id} onClick={() => onApprove(guest)}>{approvingId === guest.id ? "Sending…" : "Approve & notify"}</button>}
                  {guest.status === "checked_in" && canNotifyHost && !guest.host_notified_at && guest.host_id && <button className="approve-action" disabled={approvingId === guest.id} onClick={() => onApprove(guest)}>{approvingId === guest.id ? "Sending…" : "Retry email"}</button>}
                  {guest.status === "checked_in" && <button className="checkin-action" onClick={() => onStatus(guest)}>Check out</button>}
                  {guest.status === "checked_out" && <button className="checkin-action" onClick={() => onStatus(guest)}>Check in</button>}
                </div></td>
              </tr>)}
        </tbody>
      </table></div>
      <div className="table-footer"><span>Showing <strong>{guests.length}</strong> visitor{guests.length === 1 ? "" : "s"}</span><span>Today · {formatToday()}</span></div>
    </section>
  );
}

function SettingsPanel({ configured, companyName, onShowQr, onSaveCompanyName, onHostsChanged }: { configured: boolean; companyName: string; onShowQr: () => void; onSaveCompanyName: (name: string) => Promise<void>; onHostsChanged: () => Promise<void> }) {
  const [companyInput, setCompanyInput] = useState(companyName);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => { setCompanyInput(companyName); }, [companyName]);

  async function handleCompanySave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedName = companyInput.trim();
    if (!normalizedName) {
      setSaveError("Enter your company name.");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      await onSaveCompanyName(normalizedName);
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : "Unable to update the company name.");
    } finally {
      setSaving(false);
    }
  }

  return <>
    <section className="page-heading"><div><p className="eyebrow">COMPANY PREFERENCES</p><h1>Settings</h1><p className="heading-subtitle">Manage reception, hosts, and visitor approvals.</p></div></section>
    <section className="panel settings-card">
      <div className="settings-heading"><span className={`settings-status-icon ${configured ? "connected" : ""}`}><Icon name={configured ? "check" : "grid"} size={20} /></span><div><h2>{companyName || "Your company"}</h2><p>{configured ? "Company visitor records sync securely to your Supabase workspace." : "Demo visitor check-ins are saved locally in this browser."}</p></div><span className={`connection-pill ${configured ? "connected" : ""}`}><i />{configured ? "Connected" : "Local demo"}</span></div>
      <div className="settings-divider" />
      <form className="company-name-form guest-form" onSubmit={handleCompanySave}><label>Company name<input value={companyInput} onChange={(event) => setCompanyInput(event.target.value)} maxLength={120} required /></label>{saveError && <p className="form-error" role="alert">{saveError}</p>}<button className="secondary-button" type="submit" disabled={saving || companyInput.trim() === companyName}>{saving ? "Saving…" : "Save company name"}</button></form>
      <div className="settings-divider" />
      <div className="connection-instructions"><h3>Reception QR code</h3><p>Visitors submit their details and select a host. They remain pending until an administrator approves them; approval checks them in and sends an email to the host.</p><button className="primary-button settings-qr-button" onClick={onShowQr}><Icon name="qr" size={16} /> Show reception QR code</button></div>
    </section>
    <ReceptionTeam configured={configured} />
    <EmployeeDirectory configured={configured} onHostsChanged={onHostsChanged} />
    <section className="panel settings-card local-data-card"><div className="settings-heading"><span className="settings-status-icon local"><Icon name="users" size={20} /></span><div><h2>Daily visitor history</h2><p>Visitor log entries keep each office visit separate, including repeat visitors. The overview displays check-ins for today.</p></div></div></section>
  </>;
}

function ReceptionTeam({ configured }: { configured: boolean }) {
  const [members, setMembers] = useState<Awaited<ReturnType<typeof listReceptionMembers>>>([]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(configured);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    if (!configured) return;
    setLoading(true);
    try {
      setMembers(await listReceptionMembers());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load reception team.");
    } finally {
      setLoading(false);
    }
  }, [configured]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await inviteReceptionMember(email.trim());
      setEmail("");
      setNotice("Invitation sent. The team member can set their password from the email, then sign in here.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to invite reception team member.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(userId: string) {
    setError("");
    try {
      await removeReceptionMember(userId);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to remove reception access.");
    }
  }

  return <section className="panel settings-card directory-card">
    <div className="settings-heading"><span className="settings-status-icon"><Icon name="users" size={20} /></span><div><h2>Reception team access</h2><p>Invite staff to verify arrivals, approve check-ins, and check visitors out. They cannot change company or employee settings.</p></div></div>
    {!configured
      ? <p className="directory-demo-note">Connect Supabase to invite reception staff. Each team member signs in with their own account.</p>
      : <form className="directory-form team-invite-form guest-form" onSubmit={invite}>
        <label className="team-email-label">Team member email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="reception@company.com" maxLength={254} required /></label>
        <button className="primary-button" type="submit" disabled={saving}>{saving ? "Sending invite…" : "Invite reception staff"}</button>
      </form>}
    {error && <p className="form-error directory-error" role="alert">{error}</p>}
    {notice && <p className="form-success directory-error" role="status">{notice}</p>}
    {configured && (loading ? <p className="directory-empty">Loading reception team…</p> : members.length === 0 ? <p className="directory-empty">No reception team members invited yet.</p> : <ul className="host-list">{members.map((member) => <li key={member.user_id}><span><strong>{member.email}</strong><small>Reception staff</small></span><button className="text-button" type="button" onClick={() => void remove(member.user_id)}>Remove access</button></li>)}</ul>)}
  </section>;
}

function EmployeeDirectory({ configured, onHostsChanged }: { configured: boolean; onHostsChanged: () => Promise<void> }) {
  const [hosts, setHosts] = useState<EmployeeHost[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setHosts(await listEmployeeHosts());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load the employee directory.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function addHost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await addEmployeeHost(name.trim(), email.trim());
      setName("");
      setEmail("");
      await refresh();
      await onHostsChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to add employee.");
    } finally {
      setSaving(false);
    }
  }

  async function deactivateHost(host: EmployeeHost) {
    setError("");
    try {
      await removeEmployeeHost(host.id);
      await refresh();
      await onHostsChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to remove employee.");
    }
  }

  return <section className="panel settings-card directory-card">
    <div className="settings-heading"><span className="settings-status-icon"><Icon name="users" size={20} /></span><div><h2>Employee host directory</h2><p>Visitors choose from these names; approvals notify the matching email address.</p></div></div>
    {!configured && <p className="directory-demo-note">Demo addresses are placeholders. Real email is only sent after Supabase and Resend are configured.</p>}
    <form className="directory-form guest-form" onSubmit={addHost}>
      <label>Employee name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Jordan Lee" maxLength={120} required /></label>
      <label>Work email<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="jordan@company.com" maxLength={254} required /></label>
      <button className="primary-button" type="submit" disabled={saving}>{saving ? "Adding…" : "Add employee"}</button>
    </form>
    {error && <p className="form-error directory-error" role="alert">{error}</p>}
    {loading ? <p className="directory-empty">Loading employee directory…</p> : hosts.length === 0 ? <p className="directory-empty">No active employees yet. Add a host to enable visitor check-in.</p> : <ul className="host-list">{hosts.map((host) => <li key={host.id}><span><strong>{host.name}</strong><small>{host.email}</small></span><button className="text-button" type="button" onClick={() => void deactivateHost(host)}>Deactivate</button></li>)}</ul>}
  </section>;
}
