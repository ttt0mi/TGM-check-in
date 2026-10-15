import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type GuestStatus = "pending_approval" | "checked_in" | "checked_out";
export type VisitorReportPeriod = "daily" | "weekly" | "monthly";

export const VISIT_PURPOSES = ["Meeting", "Interview", "Delivery", "Client visit", "Vendor visit", "Other"] as const;

export type Guest = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string;
  host_name: string;
  host_id: string | null;
  purpose: string;
  status: GuestStatus;
  checked_in_at: string | null;
  checked_out_at: string | null;
  host_notified_at: string | null;
  created_at: string;
};

export type NewGuest = {
  first_name: string;
  middle_name: string;
  last_name: string;
  email: string;
  phone: string;
  company: string;
  host_name: string;
  purpose: string;
};
export type EmployeeHost = { id: string; name: string; email: string; created_at: string };
export type ReceptionWorkspace = { company_name: string; reception_token: string; owner_id: string; role: "admin" | "reception" };
export type ReceptionMember = { user_id: string; email: string; created_at: string };

const STORAGE_KEY = "tgm-check-in-visits";
const WORKSPACE_KEY = "tgm-check-in-workspace";
const HOSTS_KEY = "tgm-check-in-hosts";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const hasSupabaseConfig = Boolean(supabaseUrl && supabasePublishableKey);

let supabaseClient: SupabaseClient | null = null;

export function getSupabase() {
  if (!hasSupabaseConfig) return null;
  if (!supabaseClient && supabaseUrl && supabasePublishableKey) {
    supabaseClient = createClient(supabaseUrl, supabasePublishableKey);
  }
  return supabaseClient;
}

function minutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

const demoGuests: Guest[] = [
  {
    id: "4c177761-7988-48b1-95a1-0d913a8c21f3",
    name: "Olivia Rhye",
    email: "olivia@untitledui.com",
    phone: null,
    company: "Untitled UI",
    host_name: "Alex Smith",
    host_id: "demo-host-alex",
    purpose: "Project meeting",
    status: "checked_in",
    checked_in_at: minutesAgo(52),
    checked_out_at: null,
    host_notified_at: null,
    created_at: minutesAgo(52),
  },
  {
    id: "4c177761-7988-48b1-95a1-0d913a8c21f4",
    name: "Phoenix Baker",
    email: "phoenix@acme.com",
    phone: null,
    company: "Acme Inc.",
    host_name: "Jordan Lee",
    host_id: "demo-host-jordan",
    purpose: "Interview",
    status: "checked_in",
    checked_in_at: minutesAgo(39),
    checked_out_at: null,
    host_notified_at: null,
    created_at: minutesAgo(39),
  },
  {
    id: "4c177761-7988-48b1-95a1-0d913a8c21f5",
    name: "Lana Steiner",
    email: "lana@circooles.com",
    phone: null,
    company: "Circooles",
    host_name: "Alex Smith",
    host_id: "demo-host-alex",
    purpose: "Client meeting",
    status: "checked_in",
    checked_in_at: minutesAgo(23),
    checked_out_at: null,
    host_notified_at: null,
    created_at: minutesAgo(23),
  },
  {
    id: "4c177761-7988-48b1-95a1-0d913a8c21f6",
    name: "Demi Wilkinson",
    email: "demi@layers.com",
    phone: null,
    company: "Layers",
    host_name: "Sam Rivera",
    host_id: "demo-host-sam",
    purpose: "Delivery",
    status: "checked_out",
    checked_in_at: minutesAgo(46),
    checked_out_at: minutesAgo(35),
    host_notified_at: null,
    created_at: minutesAgo(46),
  },
  {
    id: "4c177761-7988-48b1-95a1-0d913a8c21f7",
    name: "Candice Wu",
    email: "candice@catalog.com",
    phone: null,
    company: "Catalog",
    host_name: "Morgan Chen",
    host_id: "demo-host-morgan",
    purpose: "Vendor meeting",
    status: "checked_out",
    checked_in_at: minutesAgo(34),
    checked_out_at: minutesAgo(21),
    host_notified_at: null,
    created_at: minutesAgo(34),
  },
];

const demoHosts: EmployeeHost[] = [
  { id: "demo-host-alex", name: "Alex Smith", email: "alex@example.invalid", created_at: minutesAgo(500) },
  { id: "demo-host-jordan", name: "Jordan Lee", email: "jordan@example.invalid", created_at: minutesAgo(500) },
  { id: "demo-host-sam", name: "Sam Rivera", email: "sam@example.invalid", created_at: minutesAgo(500) },
  { id: "demo-host-morgan", name: "Morgan Chen", email: "morgan@example.invalid", created_at: minutesAgo(500) },
];

function getReportRange(period: VisitorReportPeriod) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === "weekly") start.setDate(start.getDate() - start.getDay());
  if (period === "monthly") start.setDate(1);
  const end = new Date(start);
  if (period === "daily") end.setDate(end.getDate() + 1);
  if (period === "weekly") end.setDate(end.getDate() + 7);
  if (period === "monthly") end.setMonth(end.getMonth() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function loadLocalGuests(): Guest[] {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored) {
    const guests: unknown = JSON.parse(stored);
    if (!Array.isArray(guests)) throw new Error("Saved visitor list has an invalid format.");
    return guests as Guest[];
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(demoGuests));
  return demoGuests;
}

function saveLocalGuests(guests: Guest[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(guests));
}

export async function listGuests(period: VisitorReportPeriod = "daily"): Promise<Guest[]> {
  const client = getSupabase();
  const { start, end } = getReportRange(period);
  if (!client) {
    return loadLocalGuests()
      .filter((guest) => guest.created_at >= start && guest.created_at < end)
      .map((guest) => ({ ...guest, phone: guest.phone ?? null }))
      .sort((first, second) => second.created_at.localeCompare(first.created_at));
  }

  const { data, error } = await client
    .from("guests")
    .select("id, name, email, phone, company, host_name, host_id, purpose, status, checked_in_at, checked_out_at, host_notified_at, created_at")
    .gte("created_at", start)
    .lt("created_at", end)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data as Guest[];
}

export async function addGuest(input: NewGuest, receptionToken: string): Promise<void> {
  const registered = await registerVisitor(receptionToken, input);
  if (!registered) throw new Error("Unable to add visitor: the reception QR code is invalid.");
}

export async function setGuestStatus(id: string, status: GuestStatus): Promise<void> {
  const checked_in_at = status === "checked_in" ? new Date().toISOString() : undefined;
  const checked_out_at = status === "checked_out" ? new Date().toISOString() : null;
  const client = getSupabase();
  if (client) {
    const { error } = await client
      .from("guests")
      .update({ status, checked_in_at, checked_out_at })
      .eq("id", id);
    if (error) throw error;
    return;
  }

  const guests = loadLocalGuests().map((guest) =>
    guest.id === id
      ? { ...guest, status, checked_in_at: checked_in_at ?? guest.checked_in_at, checked_out_at }
      : guest,
  );
  saveLocalGuests(guests);
}

export async function getReceptionWorkspace(): Promise<ReceptionWorkspace> {
  const client = getSupabase();
  if (client) {
    const { data, error } = await client.rpc("get_my_reception_access");
    if (error) throw error;
    const workspace = data?.[0] as ReceptionWorkspace | undefined;
    if (!workspace) throw new Error("This account does not have access to a reception workspace.");
    return workspace;
  }

  const stored = window.localStorage.getItem(WORKSPACE_KEY);
  if (stored) {
    const workspace: unknown = JSON.parse(stored);
    if (
      typeof workspace !== "object"
      || workspace === null
      || !("company_name" in workspace)
      || !("reception_token" in workspace)
      || typeof workspace.company_name !== "string"
      || typeof workspace.reception_token !== "string"
    ) {
      throw new Error("Saved company workspace has an invalid format.");
    }
    return { company_name: workspace.company_name, reception_token: workspace.reception_token, owner_id: "demo-owner", role: "admin" };
  }

  const workspace = { company_name: "Tomorrow Studio", reception_token: crypto.randomUUID() };
  window.localStorage.setItem(WORKSPACE_KEY, JSON.stringify(workspace));
  return { ...workspace, owner_id: "demo-owner", role: "admin" };
}

export async function updateCompanyName(name: string): Promise<void> {
  const client = getSupabase();
  if (client) {
    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError) throw userError;
    if (!userData.user) throw new Error("Sign in to update your company name.");
    const { error } = await client
      .from("workspaces")
      .update({ company_name: name })
      .eq("owner_id", userData.user.id);
    if (error) throw error;
    return;
  }

  const workspace = await getReceptionWorkspace();
  window.localStorage.setItem(WORKSPACE_KEY, JSON.stringify({ ...workspace, company_name: name }));
}

export async function registerVisitor(
  receptionToken: string,
  input: NewGuest,
): Promise<Pick<Guest, "name" | "company" | "host_name" | "status" | "checked_in_at"> | null> {
  const client = getSupabase();
  if (client) {
    const { data, error } = await client.rpc("register_visitor_by_qr", {
      reception_token: receptionToken,
      visitor_first_name: input.first_name,
      visitor_middle_name: input.middle_name || null,
      visitor_last_name: input.last_name,
      visitor_email: input.email,
      visitor_phone: input.phone,
      visitor_company: input.company,
      visitor_host: input.host_name,
      visit_purpose: input.purpose,
    });
    if (error) throw error;
    return (data?.[0] as Pick<Guest, "name" | "company" | "host_name" | "status" | "checked_in_at"> | undefined) ?? null;
  }

  const workspace = await getReceptionWorkspace();
  if (workspace.reception_token !== receptionToken) return null;
  const host = loadLocalHosts().find((item) => item.name.toLowerCase() === input.host_name.toLowerCase());
  if (!host) throw new Error("That employee is no longer in the host directory. Please select another host.");
  const created_at = new Date().toISOString();
  const guests = loadLocalGuests();
  const name = [input.first_name, input.middle_name, input.last_name].filter(Boolean).join(" ");
  const guest: Guest = {
    name,
    email: input.email,
    phone: input.phone,
    company: input.company,
    purpose: input.purpose,
    host_name: host.name,
    host_id: host.id,
    id: crypto.randomUUID(),
    status: "pending_approval",
    checked_in_at: null,
    checked_out_at: null,
    host_notified_at: null,
    created_at,
  };
  saveLocalGuests([guest, ...guests]);
  return {
    name: guest.name,
    company: guest.company,
    host_name: guest.host_name,
    status: guest.status,
    checked_in_at: guest.checked_in_at,
  };
}

function loadLocalHosts(): EmployeeHost[] {
  const stored = window.localStorage.getItem(HOSTS_KEY);
  if (!stored) {
    window.localStorage.setItem(HOSTS_KEY, JSON.stringify(demoHosts));
    return demoHosts;
  }
  const hosts: unknown = JSON.parse(stored);
  if (!Array.isArray(hosts)) throw new Error("Saved employee directory has an invalid format.");
  return hosts as EmployeeHost[];
}

export async function listEmployeeHosts(): Promise<EmployeeHost[]> {
  const client = getSupabase();
  if (!client) return loadLocalHosts();
  const { data, error } = await client
    .from("employee_hosts")
    .select("id, name, email, created_at")
    .eq("active", true)
    .order("name");
  if (error) throw error;
  return data as EmployeeHost[];
}

export async function listReceptionHosts(receptionToken: string): Promise<string[]> {
  const client = getSupabase();
  if (client) {
    const { data, error } = await client.rpc("get_reception_hosts_by_qr", {
      reception_token: receptionToken,
    });
    if (error) throw error;
    return (data ?? []).map((row: { host_name: string }) => row.host_name);
  }
  const workspace = await getReceptionWorkspace();
  if (workspace.reception_token !== receptionToken) return [];
  return loadLocalHosts().map((host) => host.name);
}

export async function addEmployeeHost(name: string, email: string): Promise<EmployeeHost> {
  const client = getSupabase();
  if (client) {
    const { data, error } = await client
      .from("employee_hosts")
      .insert({ name, email })
      .select("id, name, email, created_at")
      .single();
    if (error) throw error;
    return data as EmployeeHost;
  }
  const hosts = loadLocalHosts();
  if (hosts.some((host) => host.name.toLowerCase() === name.toLowerCase())) {
    throw new Error("An employee with this name is already in the directory.");
  }
  const host = { id: crypto.randomUUID(), name, email, created_at: new Date().toISOString() };
  window.localStorage.setItem(HOSTS_KEY, JSON.stringify([...hosts, host]));
  return host;
}

export async function removeEmployeeHost(id: string): Promise<void> {
  const client = getSupabase();
  if (client) {
    const { error } = await client.from("employee_hosts").update({ active: false }).eq("id", id);
    if (error) throw error;
    return;
  }
  window.localStorage.setItem(HOSTS_KEY, JSON.stringify(loadLocalHosts().filter((host) => host.id !== id)));
}

export async function inviteReceptionMember(email: string): Promise<void> {
  const client = getSupabase();
  if (!client) throw new Error("Reception team invitations require a connected Supabase workspace.");
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  if (!data.session) throw new Error("Sign in as a company administrator to invite reception staff.");
  const response = await fetch("/api/reception-team", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email }),
  });
  const result = await response.json() as { error?: string };
  if (!response.ok) throw new Error(result.error || "Unable to invite reception team member.");
}

export async function listReceptionMembers(): Promise<ReceptionMember[]> {
  const client = getSupabase();
  if (!client) return [];
  const { data, error } = await client.rpc("list_reception_team");
  if (error) throw error;
  return (data ?? []) as ReceptionMember[];
}

export async function removeReceptionMember(userId: string): Promise<void> {
  const client = getSupabase();
  if (!client) throw new Error("Reception team management requires a connected Supabase workspace.");
  const { data, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  if (!data.session) throw new Error("Sign in as a company administrator to manage reception staff.");
  const response = await fetch("/api/reception-team", {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ user_id: userId }),
  });
  const result = await response.json() as { error?: string };
  if (!response.ok) throw new Error(result.error || "Unable to remove reception team member.");
}

export async function approveDemoGuest(id: string): Promise<void> {
  if (getSupabase()) throw new Error("Visitor approvals must use the authenticated approval endpoint.");
  const guests = loadLocalGuests();
  const guest = guests.find((item) => item.id === id);
  if (!guest || guest.status !== "pending_approval") throw new Error("This visitor is no longer awaiting approval.");
  saveLocalGuests(guests.map((item) => item.id === id
    ? { ...item, status: "checked_in", checked_in_at: new Date().toISOString() }
    : item));
}

export async function getReceptionCompanyName(receptionToken: string): Promise<string | null> {
  const client = getSupabase();
  if (client) {
    const { data, error } = await client.rpc("get_reception_company_by_qr", {
      reception_token: receptionToken,
    });
    if (error) throw error;
    return typeof data?.[0]?.company_name === "string" ? data[0].company_name : null;
  }

  const workspace = await getReceptionWorkspace();
  return workspace.reception_token === receptionToken ? workspace.company_name : null;
}
