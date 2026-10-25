"use client";

import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import styles from "./auth.module.css";

export function VerifyEmail() {
	const router = useRouter();
	const [email, setEmail] = useState("");
	const [captchaToken, setCaptchaToken] = useState("");
	const [message, setMessage] = useState("");
	const [isError, setIsError] = useState(false);
	const [busy, setBusy] = useState(false);
	const [cooldown, setCooldown] = useState(0);
	const captcha = useRef<TurnstileInstance | null>(null);
	const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
	useEffect(() => {
		void createClient()
			.auth.getUser()
			.then(({ data }) => {
				if (data.user?.email) setEmail(data.user.email);
			});
	}, []);
	useEffect(() => {
		if (cooldown <= 0) return;
		const timer = window.setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
		return () => window.clearTimeout(timer);
	}, [cooldown]);

	async function resend() {
		if (!captchaToken || cooldown > 0) return;
		setBusy(true);
		setMessage("");
		setIsError(false);
		try {
			const { error } = await createClient().auth.resend({
				type: "signup",
				email: email.trim(),
				options: { captchaToken, emailRedirectTo: `${window.location.origin}/auth/callback` },
			});
			if (error) throw error;
			setCooldown(60);
			setMessage(
				"If this address is awaiting verification, a new email is on its way. Check your spam folder too.",
			);
		} catch {
			setIsError(true);
			setMessage("Unable to request another email. Check the address and try again shortly.");
		} finally {
			setBusy(false);
			setCaptchaToken("");
			captcha.current?.reset();
		}
	}
	async function signOut() {
		await createClient().auth.signOut();
		router.replace("/login");
		router.refresh();
	}
	return (
		<main id="main-content" className={styles.page}>
			<div className={styles.card}>
				<div className={styles.brand}>TGM</div>
				<h1>Check your email</h1>
				<p>Open the verification link we sent. Check your spam folder if it has not arrived.</p>
				<label>
					Email address
					<input
						type="email"
						autoComplete="email"
						value={email}
						onChange={(event) => setEmail(event.target.value)}
					/>
				</label>
				{siteKey ? (
					<Turnstile
						ref={captcha}
						siteKey={siteKey}
						onSuccess={setCaptchaToken}
						onExpire={() => setCaptchaToken("")}
						onError={() => setCaptchaToken("")}
					/>
				) : (
					<p role="alert">Verification is unavailable. Contact support.</p>
				)}
				<button
					disabled={busy || cooldown > 0 || !captchaToken || !siteKey || !email.trim()}
					onClick={() => void resend()}
				>
					{busy ? "Requesting…" : cooldown > 0 ? `Resend in ${cooldown}s` : "Resend verification email"}
				</button>
				{message && <p role={isError ? "alert" : "status"}>{message}</p>}
				<button className={styles.secondary} onClick={() => router.replace("/start")}>
					I have verified my email
				</button>
				<button className={styles.secondary} onClick={() => void signOut()}>
					Sign out or use another account
				</button>
			</div>
		</main>
	);
}
