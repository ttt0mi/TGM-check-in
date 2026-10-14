"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  getReceptionCompanyName,
  registerVisitor,
  type GuestStatus,
} from "../../../lib/guests";

type VisitReceipt = {
  name: string;
  company: string;
  host_name: string;
  status: GuestStatus;
  checked_in_at: string;
};

export default function CheckInPage({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<VisitReceipt | null>(null);

  useEffect(() => {
    let active = true;
    params.then(async ({ token: receptionToken }) => {
      const name = await getReceptionCompanyName(receptionToken);
      if (!name) throw new Error("This reception QR code is invalid. Please ask the front desk for help.");
      if (active) {
        setToken(receptionToken);
        setCompanyName(name);
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
          <><h1>You&apos;re checked in!</h1><p className="checkin-description">Welcome, <strong>{receipt.name}</strong>. The front desk has recorded your visit with <strong>{receipt.host_name}</strong>.</p><span className="welcome-badge">✓ &nbsp;Checked in at {new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(receipt.checked_in_at))}</span></>
        ) : (
          <>
            <h1>Welcome to {companyName}</h1>
            <p className="checkin-description">Please share a few details so we can let your host know you&apos;ve arrived.</p>
            <form className="guest-form visitor-form" onSubmit={handleSubmit}>
              <label>Your full name<input name="name" autoComplete="name" placeholder="e.g. Jordan Lee" maxLength={120} required /></label>
              <label>Email address<input name="email" type="email" autoComplete="email" placeholder="jordan@company.com" maxLength={254} required /></label>
              <label>Company <span className="optional-label">Optional</span><input name="company" autoComplete="organization" placeholder="e.g. Acme Inc." maxLength={120} /></label>
              <label>Who are you visiting?<input name="host_name" placeholder="Employee's name" maxLength={120} required /></label>
              <label>Purpose of visit<input name="purpose" placeholder="e.g. Meeting, interview, delivery" maxLength={240} required /></label>
              {error && <p className="form-error" role="alert">{error}</p>}
              <button className="primary-button full-button confirm-checkin" disabled={saving}>{saving ? <><span className="button-spinner" /> Checking you in…</> : "Check in"}</button>
            </form>
          </>
        )}
      </section>
      <p className="checkin-footer">Need help? Please speak with the <strong>reception team</strong>.</p>
      <Link className="checkin-home-link" href="/">Powered by TGM Check-in</Link>
    </main>
  );
}
