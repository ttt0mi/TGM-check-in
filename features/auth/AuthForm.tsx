"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import styles from "./auth.module.css";

const credentials = z.object({ email: z.string(), password: z.string() });
type Credentials = z.infer<typeof credentials>;

export function AuthForm({ mode }: { mode: "login" | "signup" | "recovery" | "reset" }) {
	const router = useRouter();
	const [message, setMessage] = useState("");
	const credentialsSchema = credentials.superRefine((values, context) => {
		if (mode !== "reset" && !z.string().email().safeParse(values.email).success) {
			context.addIssue({
				code: "custom",
				path: ["email"],
				message: "Enter a valid email",
			});
		}
		if (mode !== "recovery" && values.password.length < 8) {
			context.addIssue({
				code: "custom",
				path: ["password"],
				message: "Use at least 8 characters",
			});
		}
	});
	const form = useForm<Credentials>({
		resolver: zodResolver(credentialsSchema),
		defaultValues: { email: "", password: "" },
	});

	async function submit(values: Credentials) {
		setMessage("");
		const supabase = createClient();
		try {
			if (mode === "signup") {
				const { error } = await supabase.auth.signUp({
					email: values.email,
					password: values.password,
					options: {
						emailRedirectTo: `${window.location.origin}/auth/callback`,
					},
				});
				if (error) throw error;
				router.replace("/verify-email");
			} else if (mode === "login") {
				const { error } = await supabase.auth.signInWithPassword(values);
				if (error) throw error;
				router.replace("/start");
				router.refresh();
			} else if (mode === "recovery") {
				const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
					redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
				});
				if (error) throw error;
				setMessage(
					`We have sent a recovery email to ${values.email}. If this account exists, follow the instructions in the email.`,
				);
			} else {
				const { error } = await supabase.auth.updateUser({
					password: values.password,
				});
				if (error) throw error;
				router.replace("/start");
				router.refresh();
			}
		} catch (cause) {
			setMessage(cause instanceof Error ? cause.message : "Unable to continue. Please try again.");
		}
	}

	const title = {
		login: "Sign in",
		signup: "Create your account",
		recovery: "Reset your password",
		reset: "Choose a new password",
	}[mode];
	return (
		<main className={styles.page}>
			<form className={styles.card} onSubmit={form.handleSubmit(submit)} noValidate>
				<div className={styles.brand}>TGM</div>
				<h1>{title}</h1>
				{mode !== "reset" && (
					<label>
						Email{" "}
						<input
							placeholder="you@company.com"
							type="email"
							autoComplete="email"
							{...form.register("email")}
						/>
					</label>
				)}
				{form.formState.errors.email && mode !== "reset" && (
					<small role="alert">{form.formState.errors.email.message}</small>
				)}
				{mode !== "recovery" && (
					<label>
						Password{" "}
						<input
							placeholder="••••••••"
							type="password"
							autoComplete={mode === "login" ? "current-password" : "new-password"}
							{...form.register("password")}
						/>
					</label>
				)}
				{form.formState.errors.password && mode !== "recovery" && (
					<small role="alert">{form.formState.errors.password.message}</small>
				)}
				{message && <p role="status">{message}</p>}
				<button disabled={form.formState.isSubmitting}>
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
