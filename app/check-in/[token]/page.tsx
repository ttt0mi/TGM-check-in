"use client";

import { useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  getReceptionCompanyName,
  hasSupabaseConfig,
  listReceptionHosts,
  registerVisitor,
  VISIT_PURPOSES,
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
  const [checkoutMode, setCheckoutMode] = useState(false);
  const [checkoutChallengeId, setCheckoutChallengeId] = useState("");
  const [checkoutCodeRequested, setCheckoutCodeRequested] = useState(false);
  const [checkoutComplete, setCheckoutComplete] = useState(false);
  const [checkoutEmail, setCheckoutEmail] = useState("");
  const [checkoutNotice, setCheckoutNotice] = useState("");

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
    const first_name = String(form.get("first_name") ?? "").trim();
    const middle_name = String(form.get("middle_name") ?? "").trim();
    const last_name = String(form.get("last_name") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const phone = String(form.get("phone") ?? "").trim();
    const host_name = String(form.get("host_name") ?? "").trim();
    const purpose = String(form.get("purpose") ?? "").trim();
    if (!first_name || !last_name || !email || !phone || !host_name || !purpose) {
      setError("Complete all required fields to check in.");
      setSaving(false);
      return;
    }

    try {
      const registered = await registerVisitor(token, {
        first_name,
        middle_name,
        last_name,
        email,
        phone,
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

  async function handleRequestCheckoutCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setCheckoutNotice("");
    if (!hasSupabaseConfig) {
      setError("Email-verified self-checkout needs a connected company account. Please ask reception for help.");
      setSaving(false);
      return;
    }
    try {
      const response = await fetch("/api/self-checkout/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reception_token: token, email: checkoutEmail.trim() }),
      });
      const result = await response.json() as { challenge_id?: string; message?: string; error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to request a checkout code.");
      if (!result.challenge_id) throw new Error("Unable to start checkout verification. Please ask reception for help.");
      setCheckoutChallengeId(result.challenge_id);
      setCheckoutCodeRequested(true);
      setCheckoutNotice(result.message || "If you have an active visit with this email, a checkout code will be sent.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to request a checkout code. Please ask reception for help.");
    } finally {
      setSaving(false);
    }
  }

  async function handleVerifyCheckoutCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const code = String(new FormData(event.currentTarget).get("checkout_code") ?? "").trim();
    try {
      const response = await fetch("/api/self-checkout/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challenge_id: checkoutChallengeId, code }),
      });
      const result = await response.json() as { error?: string; checked_out?: boolean };
      if (!response.ok) throw new Error(result.error || "Unable to verify your checkout code.");
      if (!result.checked_out) throw new Error("Your visit could not be checked out. Please ask reception for help.");
      setCheckoutComplete(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to verify your checkout code. Please ask reception for help.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="checkin-screen">
      <div className="checkin-top-brand"><Image className="checkin-logo" src="/tgm-logo.jpg" alt="TGM Marchnata" width={200} height={63} priority /></div>
      <section className="checkin-card">
        <div className={`checkin-symbol ${receipt || checkoutComplete ? "success" : ""}`}><span>{receipt || checkoutComplete ? "✓" : "✳"}</span></div>
        <p className="eyebrow">{loading ? "COMPANY VISITOR CHECK-IN" : companyName.toUpperCase() || "COMPANY VISITOR CHECK-IN"}</p>
        {loading ? (
          <><h1>One moment</h1><p className="checkin-description">We&apos;re opening the visitor check-in form.</p><span className="spinner" /></>
        ) : error && !companyName ? (
          <><h1>Check-in unavailable</h1><p className="checkin-description">{error}</p></>
        ) : checkoutComplete ? (
          <><h1>You&apos;re checked out</h1><p className="checkin-description">Your departure has been recorded. Thank you for visiting {companyName}.</p><span className="welcome-badge">✓ &nbsp;Checkout complete</span></>
        ) : receipt ? (
          <><h1>Waiting for reception</h1><p className="checkin-description">Thank you, <strong>{receipt.name}</strong>. Reception will verify your visit and notify <strong>{receipt.host_name}</strong> when you&apos;re approved.</p><span className="welcome-badge">✓ &nbsp;Check-in request received</span></>
        ) : checkoutMode ? (
          <>
            <h1>{checkoutCodeRequested ? "Enter your checkout code" : "Check out of your visit"}</h1>
            <p className="checkin-description">{checkoutCodeRequested ? `Enter the six-digit code sent to ${checkoutEmail}.` : "Enter the email address you used when you checked in. We’ll email you a one-time verification code."}</p>
            {!checkoutCodeRequested ? (
              <form className="guest-form visitor-form" onSubmit={handleRequestCheckoutCode}>
                <label>Email address<input name="checkout_email" type="email" autoComplete="email" value={checkoutEmail} onChange={(event) => setCheckoutEmail(event.target.value)} placeholder="you@example.com" maxLength={254} required /></label>
                {error && <p className="form-error" role="alert">{error}</p>}
                {!hasSupabaseConfig && <p className="form-error">Email-verified self-checkout is unavailable in demo mode. Please ask reception.</p>}
                <button className="primary-button full-button confirm-checkin" disabled={saving || !hasSupabaseConfig}>{saving ? <><span className="button-spinner" /> Sending code…</> : "Email me a checkout code"}</button>
              </form>
            ) : (
              <form className="guest-form visitor-form" onSubmit={handleVerifyCheckoutCode}>
                {checkoutNotice && <p className="form-success" role="status">{checkoutNotice}</p>}
                <label>Six-digit code<input name="checkout_code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="000000" required /></label>
                {error && <p className="form-error" role="alert">{error}</p>}
                <button className="primary-button full-button confirm-checkin" disabled={saving}>{saving ? <><span className="button-spinner" /> Verifying…</> : "Verify and check out"}</button>
                <button className="text-button checkout-change-email" type="button" onClick={() => { setCheckoutCodeRequested(false); setCheckoutChallengeId(""); setCheckoutNotice(""); setError(""); }}>Back to email entry</button>
              </form>
            )}
            <button className="text-button checkout-back" type="button" onClick={() => { setCheckoutMode(false); setCheckoutCodeRequested(false); setCheckoutChallengeId(""); setCheckoutNotice(""); setError(""); }}>Back to visitor check-in</button>
          </>
        ) : (
          <>
            <h1>Welcome to {companyName}</h1>
            <p className="checkin-description">Please share a few details. Reception will verify your arrival and notify your host.</p>
            <div className="checkin-mode-toggle" role="group" aria-label="Visitor action">
              <button type="button" className="active" aria-pressed="true">Check in</button>
              <button type="button" aria-pressed="false" onClick={() => { setCheckoutMode(true); setError(""); }}>Check out</button>
            </div>
            <form className="guest-form visitor-form" onSubmit={handleSubmit}>
              <label>First name<input name="first_name" autoComplete="given-name" placeholder="e.g. Jordan" maxLength={120} required /></label>
              <label>Middle name <span className="optional-label">Optional</span><input name="middle_name" autoComplete="additional-name" placeholder="e.g. Taylor" maxLength={120} /></label>
              <label>Last name<input name="last_name" autoComplete="family-name" placeholder="e.g. Lee" maxLength={120} required /></label>
              <label>Email address<input name="email" type="email" autoComplete="email" placeholder="jordan@company.com" maxLength={254} required /></label>
              <label>Phone number<input name="phone" type="tel" autoComplete="tel" placeholder="e.g. +1 555 123 4567" maxLength={32} required /></label>
              <label>Company <span className="optional-label">Optional</span><input name="company" autoComplete="organization" placeholder="e.g. Acme Inc." maxLength={120} /></label>
              <label>Who are you visiting?<select name="host_name" required defaultValue=""><option value="" disabled>Select an employee</option>{hosts.map((host) => <option key={host} value={host}>{host}</option>)}</select></label>
              <label>Purpose of visit<select name="purpose" required defaultValue=""><option value="" disabled>Select a purpose</option>{VISIT_PURPOSES.map((purpose) => <option key={purpose} value={purpose}>{purpose}</option>)}</select></label>
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
