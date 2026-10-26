"use client";

import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { authFormSchema, passwordRules, type AuthMode, type AuthValues } from "./schema";
import styles from "./auth.module.css";

function authMessage(cause: unknown): string {
	const code = cause && typeof cause === "object" && "code" in cause ? cause.code : null;
	switch (code) {
		case "weak_password":
			return "Choose a password that meets every requirement.";
		case "captcha_failed":
			return "Verification failed. Complete a new challenge and try again.";
		case "invalid_credentials":
			return "The email or password is incorrect.";
		case "email_not_confirmed":
			return "Verify your email before signing in.";
		case "over_email_send_rate_limit":
			return "Please wait before requesting another email.";
		case "recovery_expired":
			return "Recovery link expired. Request a new one.";
		default:
			return "Unable to continue. Please try again.";
	}
}

export function AuthForm({ mode, notice }: { mode: AuthMode; notice?: string }) {
	const router = useRouter();
	const [message, setMessage] = useState("");
	const [isError, setIsError] = useState(false);
	const [captchaToken, setCaptchaToken] = useState("");
	const [captchaMessage, setCaptchaMessage] = useState("Complete verification to continue.");
	const [showPassword, setShowPassword] = useState(false);
	const [capsLock, setCapsLock] = useState(false);
	const captcha = useRef<TurnstileInstance | null>(null);
	const requiresCaptcha = mode !== "reset";
	const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
	const form = useForm<AuthValues>({
		resolver: zodResolver(authFormSchema(mode)),
		defaultValues: { email: "", password: "", confirmPassword: "" },
	});
	const password = useWatch({ control: form.control, name: "password" });
	useEffect(() => {
		if (notice && window.location.search.includes("error="))
			window.history.replaceState(null, "", window.location.pathname);
	}, [notice]);

	async function submit(values: AuthValues) {
		setMessage("");
		setIsError(false);
		if (requiresCaptcha && !captchaToken) {
			setCaptchaMessage("Complete verification to continue.");
			return;
		}
		const supabase = createClient();
		try {
			if (mode === "signup") {
				const { error } = await supabase.auth.signUp({
					email: values.email.trim(),
					password: values.password,
					options: { captchaToken, emailRedirectTo: `${window.location.origin}/auth/callback` },
				});
				if (error) throw error;
				router.replace("/verify-email");
			} else if (mode === "login") {
				const { error } = await supabase.auth.signInWithPassword({
					email: values.email.trim(),
					password: values.password,
					options: { captchaToken },
				});
				if (error) throw error;
				router.replace("/start");
				router.refresh();
			} else if (mode === "recovery") {
				const { error } = await supabase.auth.resetPasswordForEmail(values.email.trim(), {
					captchaToken,
					redirectTo: `${window.location.origin}/auth/recover`,
				});
				if (error) throw error;
				setMessage("If this account exists, follow the instructions sent to its email address.");
			} else {
				const response = await fetch("/api/auth/reset-password", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ password: values.password }),
				});
				if (!response.ok) {
					const body = (await response.json()) as { error?: string };
					throw { code: body.error };
				}
				router.replace("/start");
				router.refresh();
			}
		} catch (cause) {
			setIsError(true);
			setMessage(authMessage(cause));
		} finally {
			if (requiresCaptcha) {
				captcha.current?.reset();
				setCaptchaToken("");
				setCaptchaMessage("Complete verification to continue.");
			}
		}
	}

	const title = {
		login: "Sign in",
		signup: "Create your account",
		recovery: "Reset your password",
		reset: "Choose a new password",
	}[mode];
	return (
		<main id="main-content" className={styles.page}>
			<form className={styles.card} onSubmit={form.handleSubmit(submit, (errors) => {
				const first = Object.keys(errors)[0] as keyof AuthValues | undefined;
				if (first) form.setFocus(first);
				setMessage("Correct the marked fields and try again.");
				setIsError(true);
			})} noValidate>
				<div className={styles.brand}>TGM</div>
				<h1>{title}</h1>
				{notice && <p role="alert">{notice}</p>}
				{mode !== "reset" && (
					<label>
						Email
						<input
							type="email"
							autoComplete="email"
							aria-invalid={!!form.formState.errors.email}
							aria-describedby={form.formState.errors.email ? "auth-email-error" : undefined}
							{...form.register("email")}
						/>
					</label>
				)}
				{form.formState.errors.email && (
					<small id="auth-email-error" role="alert">
						{form.formState.errors.email.message}
					</small>
				)}
				{mode !== "recovery" && (
					<>
						<label>
							Password
							<input
								type={showPassword ? "text" : "password"}
								autoComplete={mode === "login" ? "current-password" : "new-password"}
								aria-invalid={!!form.formState.errors.password}
								aria-describedby={form.formState.errors.password ? "auth-password-error" : undefined}
								onKeyUp={(event) => setCapsLock(event.getModifierState("CapsLock"))}
								{...form.register("password")}
							/>
						</label>
						<button
							className={styles.secondary}
							type="button"
							aria-label={showPassword ? "Hide password" : "Show password"}
							onClick={() => setShowPassword((value) => !value)}
						>
							{showPassword ? "Hide password" : "Show password"}
						</button>
						{capsLock && <small role="status">Caps Lock is on.</small>}
						{form.formState.errors.password && (
							<small id="auth-password-error" role="alert">
								{form.formState.errors.password.message}
							</small>
						)}
					</>
				)}
				{(mode === "signup" || mode === "reset") && (
					<>
						<ul className={styles.requirements} aria-label="Password requirements">
							{passwordRules.map((rule) => (
								<li key={rule.label} data-met={rule.test(password ?? "")}>
									{rule.label}
								</li>
							))}
						</ul>
						<label>
							Confirm password
							<input
								type={showPassword ? "text" : "password"}
								autoComplete="new-password"
								aria-invalid={!!form.formState.errors.confirmPassword}
								aria-describedby={
									form.formState.errors.confirmPassword ? "auth-confirm-error" : undefined
								}
								{...form.register("confirmPassword")}
							/>
						</label>
						{form.formState.errors.confirmPassword && (
							<small id="auth-confirm-error" role="alert">
								{form.formState.errors.confirmPassword.message}
							</small>
						)}
					</>
				)}
				{requiresCaptcha &&
					(siteKey ? (
						<div>
							<Turnstile
								ref={captcha}
								siteKey={siteKey}
								options={{ refreshExpired: "manual" }}
								onSuccess={(token) => {
									setCaptchaToken(token);
									setCaptchaMessage("Verification complete.");
								}}
								onExpire={() => {
									setCaptchaToken("");
									setCaptchaMessage("Verification expired. Complete a new challenge.");
									captcha.current?.reset();
								}}
								onError={() => {
									setCaptchaToken("");
									setCaptchaMessage("Verification could not load. Retry the challenge.");
								}}
							/>
							<p role="status">{captchaMessage}</p>
							{!captchaToken && (
								<button
									className={styles.secondary}
									type="button"
									onClick={() => captcha.current?.reset()}
								>
									Retry verification
								</button>
							)}
						</div>
					) : (
						<p role="alert">Verification is unavailable. Contact support.</p>
					))}
				{message && <p role={isError ? "alert" : "status"}>{message}</p>}
				<button disabled={form.formState.isSubmitting || (requiresCaptcha && (!captchaToken || !siteKey))}>
					{form.formState.isSubmitting ? "Please wait…" : title}
				</button>
				<nav>
					{mode !== "login" && <a href="/login">Sign in</a>}
					{mode !== "signup" && <a href="/signup">Create an account</a>}
					{mode === "login" && <a href="/forgot-password">Forgot password?</a>}
				</nav>
			</form>
		</main>
	);
}
