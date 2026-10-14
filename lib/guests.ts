import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type GuestStatus = "checked_in" | "checked_out";

export type Guest = {
  id: string;
  name: string;
  email: string;
  company: string;
  host_name: string;
  purpose: string;
  status: GuestStatus;
  checked_in_at: string;
  checked_out_at: string | null;
  created_at: string;
};

export type NewGuest = Pick<Guest, "name" | "email" | "company" | "host_name" | "purpose">;
export type ReceptionWorkspace = { company_name: string; reception_token: string };

const STORAGE_KEY = "tgm-check-in-visits";
const WORKSPACE_KEY = "tgm-check-in-workspace";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);

let supabaseClient: SupabaseClient | null = null;

export function getSupabase() {
  if (!hasSupabaseConfig) return null;
  if (!supabaseClient && supabaseUrl && supabaseAnonKey) {
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
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
    company: "Untitled UI",
    host_name: "Alex Smith",
    purpose: "Project meeting",
    status: "checked_in",
    checked_in_at: minutesAgo(52),
    checked_out_at: null,
    created_at: minutesAgo(52),
  },
  {
    id: "4c177761-7988-48b1-95a1-0d913a8c21f4",
    name: "Phoenix Baker",
    email: "phoenix@acme.com",
    company: "Acme Inc.",
    host_name: "Jordan Lee",
    purpose: "Interview",
    status: "checked_in",
    checked_in_at: minutesAgo(39),
    checked_out_at: null,
    created_at: minutesAgo(39),
  },
  {
    id: "4c177761-7988-48b1-95a1-0d913a8c21f5",
    name: "Lana Steiner",
    email: "lana@circooles.com",
    company: "Circooles",
    host_name: "Alex Smith",
    purpose: "Client meeting",
    status: "checked_in",
    checked_in_at: minutesAgo(23),
    checked_out_at: null,
    created_at: minutesAgo(23),
  },
  {
    id: "4c177761-7988-48b1-95a1-0d913a8c21f6",
    name: "Demi Wilkinson",
    email: "demi@layers.com",
    company: "Layers",
    host_name: "Sam Rivera",
    purpose: "Delivery",
    status: "checked_out",
    checked_in_at: minutesAgo(46),
    checked_out_at: minutesAgo(35),
    created_at: minutesAgo(46),
  },
  {
    id: "4c177761-7988-48b1-95a1-0d913a8c21f7",
    name: "Candice Wu",
    email: "candice@catalog.com",
    company: "Catalog",
    host_name: "Morgan Chen",
    purpose: "Vendor meeting",
    status: "checked_out",
    checked_in_at: minutesAgo(34),
    checked_out_at: minutesAgo(21),
    created_at: minutesAgo(34),
  },
];

function getTodayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
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

export async function listGuests(): Promise<Guest[]> {
  const client = getSupabase();
  const { start, end } = getTodayRange();
  if (!client) {
    return loadLocalGuests()
      .filter((guest) => guest.created_at >= start && guest.created_at < end)
      .sort((first, second) => second.created_at.localeCompare(first.created_at));
  }

  const { data, error } = await client
    .from("guests")
    .select("id, name, email, company, host_name, purpose, status, checked_in_at, checked_out_at, created_at")
    .gte("created_at", start)
    .lt("created_at", end)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data as Guest[];
}

export async function addGuest(input: NewGuest): Promise<Guest> {
  const client = getSupabase();
  if (client) {
    const { data, error } = await client
      .from("guests")
      .insert(input)
      .select("id, name, email, company, host_name, purpose, status, checked_in_at, checked_out_at, created_at")
      .single();
    if (error) throw error;
    return data as Guest;
  }

  const guests = loadLocalGuests();
  const checked_in_at = new Date().toISOString();
  const guest: Guest = {
    ...input,
    id: crypto.randomUUID(),
    status: "checked_in",
    checked_in_at,
    checked_out_at: null,
    created_at: checked_in_at,
  };
  saveLocalGuests([guest, ...guests]);
  return guest;
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
    const { data, error } = await client.rpc("get_or_create_reception_workspace");
    if (error) throw error;
    const workspace = data?.[0] as ReceptionWorkspace | undefined;
    if (!workspace) throw new Error("Unable to load the reception QR code.");
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
    return { company_name: workspace.company_name, reception_token: workspace.reception_token };
  }

  const workspace = { company_name: "Tomorrow Studio", reception_token: crypto.randomUUID() };
  window.localStorage.setItem(WORKSPACE_KEY, JSON.stringify(workspace));
  return workspace;
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
      visitor_name: input.name,
      visitor_email: input.email,
      visitor_company: input.company,
      visitor_host: input.host_name,
      visit_purpose: input.purpose,
    });
    if (error) throw error;
    return (data?.[0] as Pick<Guest, "name" | "company" | "host_name" | "status" | "checked_in_at"> | undefined) ?? null;
  }

  const workspace = await getReceptionWorkspace();
  if (workspace.reception_token !== receptionToken) return null;
  const checked_in_at = new Date().toISOString();
  const guests = loadLocalGuests();
  const guest: Guest = {
    ...input,
    id: crypto.randomUUID(),
    status: "checked_in",
    checked_in_at,
    checked_out_at: null,
    created_at: checked_in_at,
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
