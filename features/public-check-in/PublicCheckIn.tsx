"use client";

import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { BranchClock } from "./BranchClock";
import { getVisitorVisit, submitPublicVisit } from "./api";
import { createVisitorToken, loadVisitorToken, saveVisitorToken } from "./session";
import { publicVisitSchema, visitTypes, type PublicVisitValues } from "./schema";
import type { PublicDirectory, VisitorVisit } from "./types";
import { VisitStatus } from "./VisitStatus";
import styles from "./public-check-in.module.css";

const visitTypeNames: Record<string, string> = {
	school: "School",
	business: "Business",
	counselling: "Counselling",
	travels: "Travel",
	vendors: "Vendor",
	other: "Other",
};

export function PublicCheckIn({
	slug,
	directory,
	initialClockIso,
}: {
	slug: string;
	directory: PublicDirectory;
	initialClockIso: string;
}) {
	const [sessionToken, setSessionToken] = useState<string | null>(null);
	const [clockVisit, setClockVisit] = useState<VisitorVisit | null>(null);
	const [restoring, setRestoring] = useState(true);
	const [captchaToken, setCaptchaToken] = useState("");
	const [error, setError] = useState("");
	const pending = useRef<{ idempotencyKey: string; token: string } | null>(null);
	const turnstile = useRef<TurnstileInstance | null>(null);
	const form = useForm<PublicVisitValues>({
		resolver: zodResolver(publicVisitSchema),
		defaultValues: {
			visitor_full_name: "",
			visitor_preferred_name: "",
			visitor_email: "",
			phone_number: "",
			organization: "",
			visit_type: "business",
			purpose: "",
			department_id: "",
			staff_id: "",
		},
	});
	const selectedDepartment = useWatch({
		control: form.control,
		name: "department_id",
	});
	const hosts = directory.departments.find((item) => item.id === selectedDepartment)?.staff ?? [];

	useEffect(() => {
		let active = true;
		const saved = loadVisitorToken(slug);
		if (!saved) {
			queueMicrotask(() => {
				if (active) setRestoring(false);
			});
			return () => {
				active = false;
			};
		}
		void getVisitorVisit(saved)
			.then(() => {
				if (active) setSessionToken(saved);
			})
			.catch(() => {
				sessionStorage.removeItem(`tgm:visitor-session:${slug}`);
			})
			.finally(() => {
				if (active) setRestoring(false);
			});
		return () => {
			active = false;
		};
	}, [slug]);

	const onUnavailable = useCallback(() => {
		sessionStorage.removeItem(`tgm:visitor-session:${slug}`);
		setSessionToken(null);
		setClockVisit(null);
	}, [slug]);

	async function submit(values: PublicVisitValues) {
		if (!captchaToken) {
			setError("Complete the verification to continue.");
			return;
		}
		setError("");
		pending.current ??= {
			idempotencyKey: crypto.randomUUID(),
			token: createVisitorToken(),
		};
		const credentials = pending.current;
		try {
			await submitPublicVisit({
				location: slug,
				idempotency_key: credentials.idempotencyKey,
				visitor_session_token: credentials.token,
				turnstile_token: captchaToken,
				visitor_full_name: values.visitor_full_name,
				visitor_preferred_name: values.visitor_preferred_name || null,
				visitor_email: values.visitor_email || null,
				phone_number: values.phone_number,
				organization: values.organization || null,
				visit_type: values.visit_type,
				purpose: values.purpose,
				department_id: values.department_id || null,
				staff_id: values.staff_id || null,
			});
			saveVisitorToken(slug, credentials.token);
			setSessionToken(credentials.token);
			pending.current = null;
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Unable to submit. Please try again.");
			// A new challenge may be needed after Siteverify consumes a token.
			turnstile.current?.reset();
			setCaptchaToken("");
		}
	}

	return (
		<main className={styles.page}>
			<div className={styles.card}>
				<div className={styles.brand}>
					TGM <span>Visitor check-in</span>
				</div>
				<p className={styles.eyebrow}>{directory.organization.name}</p>
				<h1>Welcome to {directory.location.name}</h1>
				{directory.location.address && <p>{directory.location.address}</p>}
				<BranchClock timezone={directory.location.timezone} initialIso={initialClockIso} visit={clockVisit} />
				{restoring ? (
					<p>Checking for your visit…</p>
				) : sessionToken ? (
					<VisitStatus token={sessionToken} onUnavailable={onUnavailable} onVisitChange={setClockVisit} />
				) : (
					<form
						className={styles.form}
						onSubmit={(event) => {
							void form.handleSubmit(submit)(event);
						}}
						noValidate
					>
						<h2>Tell us about your visit</h2>
						<label>
							Full name <input autoComplete="name" {...form.register("visitor_full_name")} />
						</label>
						{form.formState.errors.visitor_full_name && (
							<small role="alert">{form.formState.errors.visitor_full_name.message}</small>
						)}
						<label>
							Preferred name <input {...form.register("visitor_preferred_name")} />
						</label>
						<label>
							Email (optional){" "}
							<input type="email" autoComplete="email" {...form.register("visitor_email")} />
						</label>
						{form.formState.errors.visitor_email && (
							<small role="alert">{form.formState.errors.visitor_email.message}</small>
						)}
						<label>
							Phone number{" "}
							<input
								type="tel"
								autoComplete="tel"
								placeholder="+234…"
								{...form.register("phone_number")}
							/>
						</label>
						{form.formState.errors.phone_number && (
							<small role="alert">{form.formState.errors.phone_number.message}</small>
						)}
						<label>
							Your organization (optional) <input {...form.register("organization")} />
						</label>
						<label>
							Visit type{" "}
							<select {...form.register("visit_type")}>
								{visitTypes.map((type) => (
									<option key={type} value={type}>
										{visitTypeNames[type]}
									</option>
								))}
							</select>
						</label>
						<label>
							Purpose <textarea rows={3} {...form.register("purpose")} />
						</label>
						{form.formState.errors.purpose && (
							<small role="alert">{form.formState.errors.purpose.message}</small>
						)}
						<label>
							Department (optional){" "}
							<select
								{...form.register("department_id", {
									onChange: () => form.setValue("staff_id", ""),
								})}
							>
								<option value="">No department selected</option>
								{directory.departments.map((department) => (
									<option key={department.id} value={department.id}>
										{department.name}
									</option>
								))}
							</select>
						</label>
						<label>
							Host (optional){" "}
							<select disabled={!selectedDepartment} {...form.register("staff_id")}>
								<option value="">No host selected</option>
								{hosts.map((host) => (
									<option key={host.id} value={host.id}>
										{host.name}
									</option>
								))}
							</select>
						</label>
						{process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ? (
							<Turnstile
								ref={turnstile}
								siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
								onSuccess={setCaptchaToken}
								onExpire={() => setCaptchaToken("")}
								onError={() => setCaptchaToken("")}
							/>
						) : (
							<p role="alert">Verification is not configured.</p>
						)}
						{error && (
							<p role="alert" className={styles.error}>
								{error}
							</p>
						)}
						<button type="submit" disabled={form.formState.isSubmitting || !captchaToken}>
							{form.formState.isSubmitting ? "Submitting…" : "Check in"}
						</button>
					</form>
				)}
			</div>
		</main>
	);
}
