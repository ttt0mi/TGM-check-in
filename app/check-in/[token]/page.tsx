"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  getReceptionCompanyName,
  listReceptionHosts,
  registerVisitor,
  type GuestStatus,
} from "../../../lib/guests";

type VisitReceipt = {
  name: string;
  company: string;
  host_name: string;
  status: GuestStatus;
  checked_in_at: string | null;
};

export default function CheckInPage({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [hosts, setHosts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<VisitReceipt | null>(null);

  useEffect(() => {
    let active = true;
    params.then(async ({ token: receptionToken }) => {
      const [name, hostNames] = await Promise.all([
        getReceptionCompanyName(receptionToken),
        listReceptionHosts(receptionToken),
      ]);
      if (!name) throw new Error("This reception QR code is invalid. Please ask the front desk for help.");
      if (active) {
        setToken(receptionToken);
        setCompanyName(name);
        setHosts(hostNames);
      }
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : "Unable to load the visitor form.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [params]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const host_name = String(form.get("host_name") ?? "").trim();
    const purpose = String(form.get("purpose") ?? "").trim();
    if (!name || !email || !host_name || !purpose) {
      setError("Complete all required fields to check in.");
      setSaving(false);
      return;
    }

    try {
      const registered = await registerVisitor(token, {
        name,
        email,
        company: String(form.get("company") ?? "").trim(),
        host_name,
        purpose,
      });
      if (!registered) {
        setError("This reception QR code is invalid. Please ask the front desk for help.");
        return;
      }
      setReceipt(registered);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to check you in. Please ask the front desk for help.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="checkin-screen">
      <div className="checkin-top-brand"><span className="brand-mark">t<span>.</span></span><span>tgm<span>check-in</span></span></div>
      <section className="checkin-card">
        <div className={`checkin-symbol ${receipt ? "success" : ""}`}><span>{receipt ? "✓" : "✳"}</span></div>
        <p className="eyebrow">{loading ? "COMPANY VISITOR CHECK-IN" : companyName.toUpperCase() || "COMPANY VISITOR CHECK-IN"}</p>
        {loading ? (
          <><h1>One moment</h1><p className="checkin-description">We&apos;re opening the visitor check-in form.</p><span className="spinner" /></>
        ) : error && !companyName ? (
          <><h1>Check-in unavailable</h1><p className="checkin-description">{error}</p></>
        ) : receipt ? (
          <><h1>Waiting for reception</h1><p className="checkin-description">Thank you, <strong>{receipt.name}</strong>. Reception will verify your visit and notify <strong>{receipt.host_name}</strong> when you&apos;re approved.</p><span className="welcome-badge">✓ &nbsp;Check-in request received</span></>
        ) : (
          <>
            <h1>Welcome to {companyName}</h1>
            <p className="checkin-description">Please share a few details. Reception will verify your arrival and notify your host.</p>
            <form className="guest-form visitor-form" onSubmit={handleSubmit}>
              <label>Your full name<input name="name" autoComplete="name" placeholder="e.g. Jordan Lee" maxLength={120} required /></label>
              <label>Email address<input name="email" type="email" autoComplete="email" placeholder="jordan@company.com" maxLength={254} required /></label>
              <label>Company <span className="optional-label">Optional</span><input name="company" autoComplete="organization" placeholder="e.g. Acme Inc." maxLength={120} /></label>
              <label>Who are you visiting?<select name="host_name" required defaultValue=""><option value="" disabled>Select an employee</option>{hosts.map((host) => <option key={host} value={host}>{host}</option>)}</select></label>
              <label>Purpose of visit<input name="purpose" placeholder="e.g. Meeting, interview, delivery" maxLength={240} required /></label>
              {error && <p className="form-error" role="alert">{error}</p>}
              <button className="primary-button full-button confirm-checkin" disabled={saving || hosts.length === 0}>{saving ? <><span className="button-spinner" /> Submitting…</> : "Request check-in"}</button>
              {hosts.length === 0 && <p className="form-error">The employee directory is empty. Please speak with reception.</p>}
            </form>
          </>
        )}
      </section>
      <p className="checkin-footer">Need help? Please speak with the <strong>reception team</strong>.</p>
      <Link className="checkin-home-link" href="/">Powered by TGM Check-in</Link>
    </main>
  );
}
