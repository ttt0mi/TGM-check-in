"use client";

import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { RequestError } from "@/lib/http/request-error";
import { useOnlineStatus } from "@/lib/hooks/use-online-status";
import { BranchClock } from "./BranchClock";
import { getPublicDirectory, submitPublicVisit } from "./api";
import { clearVisitorToken, createVisitorToken, loadVisitorToken, saveVisitorToken } from "./session";
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

function FieldError({ name, message }: { name: string; message?: string }) {
	return message ? (
		<small id={`error-${name}`} role="alert">
			{message}
		</small>
	) : null;
}

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
	const [captchaMessage, setCaptchaMessage] = useState("Complete verification before submitting.");
	const [error, setError] = useState("");
	const [storageLimited, setStorageLimited] = useState(false);
	const [currentDirectory, setCurrentDirectory] = useState(directory);
	const [directoryError, setDirectoryError] = useState("");
	const [statusNotice, setStatusNotice] = useState("");
	const online = useOnlineStatus();
	const formHeading = useRef<HTMLHeadingElement | null>(null);
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
	const hosts = currentDirectory.departments.find((item) => item.id === selectedDepartment)?.staff ?? [];
	function errorFor(name: keyof PublicVisitValues) {
		const message = form.formState.errors[name]?.message;
		return typeof message === "string" ? message : undefined;
	}
	function fieldProps(name: keyof PublicVisitValues) {
		return {
			"aria-invalid": Boolean(errorFor(name)),
			"aria-describedby": errorFor(name) ? `error-${name}` : undefined,
		};
	}

	useEffect(() => {
		let active = true;
		const refreshDirectory = async () => {
			try {
				const updated = await getPublicDirectory(slug, selectedDepartment || undefined);
				if (!active) return;
				setCurrentDirectory(updated);
				setDirectoryError("");
				if (selectedDepartment && !updated.departments.some((item) => item.id === selectedDepartment)) {
					form.setValue("department_id", "");
					form.setValue("staff_id", "");
					setDirectoryError("Your selected department is no longer available. Please choose again.");
				} else if (
					form.getValues("staff_id") &&
					!updated.departments.some((item) =>
						item.staff.some((host) => host.id === form.getValues("staff_id")),
					)
				) {
					form.setValue("staff_id", "");
					setDirectoryError("Your selected host is no longer available. Please choose again.");
				}
			} catch (cause) {
				if (!active) return;
				if (cause instanceof RequestError && cause.status === 404 && selectedDepartment) {
					form.setValue("department_id", "");
					form.setValue("staff_id", "");
					setDirectoryError("Your selected department is no longer available. Please choose again.");
					return;
				}
				setDirectoryError(
					"The branch directory could not refresh. Retry before submitting or ask reception for help.",
				);
			}
		}
		void refreshDirectory();
		const interval = window.setInterval(() => void refreshDirectory(), 120_000);
		window.addEventListener("focus", refreshDirectory);
		return () => {
			active = false;
			window.clearInterval(interval);
			window.removeEventListener("focus", refreshDirectory);
		};
	}, [slug, selectedDepartment, form]);

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
		queueMicrotask(() => {
			if (!active) return;
			setSessionToken(saved);
			setRestoring(false);
		});
		return () => {
			active = false;
		};
	}, [slug]);

	const onUnavailable = useCallback(() => {
		clearVisitorToken(slug);
		setSessionToken(null);
		setClockVisit(null);
		setStatusNotice(
			"Your visitor status link has expired or is unavailable. Ask reception for help if your visit is still active.",
		);
	}, [slug]);

	async function submit(values: PublicVisitValues) {
		if (!captchaToken) {
			setError(captchaMessage);
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
			setStorageLimited(!saveVisitorToken(slug, credentials.token));
			setSessionToken(credentials.token);
			pending.current = null;
		} catch (cause) {
			setError(
				cause instanceof RequestError && cause.kind === "timeout"
					? "We could not confirm this check-in. Retry with the same details; the visit will not be duplicated."
					: cause instanceof Error
						? cause.message
						: "Unable to submit. Please try again.",
			);
			setCaptchaMessage("Verification needs to be completed again before retrying.");
			// A new challenge may be needed after Siteverify consumes a token.
			turnstile.current?.reset();
			setCaptchaToken("");
		}
	}

	return (
		<main id="main-content" className={styles.page}>
			<div className={styles.card}>
				<div className={styles.brand}>
					TGM <span>Visitor check-in</span>
				</div>
				<p className={styles.eyebrow}>{currentDirectory.organization.name}</p>
				<h1>Welcome to {currentDirectory.location.name}</h1>
				{currentDirectory.location.address && <p>{currentDirectory.location.address}</p>}
				<BranchClock
					timezone={currentDirectory.location.timezone}
					initialIso={initialClockIso}
					visit={clockVisit}
				/>
				<p>
					{currentDirectory.privacy_notice.notice_copy}{" "}
					<a href={currentDirectory.privacy_notice.policy_url} target="_blank" rel="noopener noreferrer">
						Read the full privacy policy
					</a>
					.
				</p>
				{directoryError && (
					<p role="alert">
						{directoryError}{" "}
						<button type="button" onClick={() => window.location.reload()}>
							Retry directory
						</button>
					</p>
				)}
				{!online && (
					<p role="status">
						You appear to be offline. Your entries remain here; reconnect and retry when ready.
					</p>
				)}
				{statusNotice && <p role="status">{statusNotice}</p>}
				{restoring ? (
					<p>Checking for your visit…</p>
				) : sessionToken ? (
					<>
						<VisitStatus token={sessionToken} onUnavailable={onUnavailable} onVisitChange={setClockVisit} />
						{storageLimited && (
							<p role="status">
								This browser cannot save your visit status. Keep this tab open or ask reception for
								updates.
							</p>
						)}
						<button
							type="button"
							onClick={() => {
								clearVisitorToken(slug);
								setSessionToken(null);
								setClockVisit(null);
								setStorageLimited(false);
								form.reset();
								requestAnimationFrame(() => formHeading.current?.focus());
							}}
						>
							Check in another visitor
						</button>
					</>
				) : (
					<form
						className={styles.form}
						onSubmit={(event) => {
							void form.handleSubmit(submit, (errors) => {
								const first = Object.keys(errors)[0] as keyof PublicVisitValues | undefined;
								if (first) form.setFocus(first);
							})(event);
						}}
						noValidate
					>
						<h2 ref={formHeading} tabIndex={-1}>
							Tell us about your visit
						</h2>
						{form.formState.isSubmitted && Object.keys(form.formState.errors).length > 0 && (
							<p role="alert">Please correct the marked fields before checking in.</p>
						)}
						<label>
							Full name{" "}
							<input
								autoComplete="name"
								{...fieldProps("visitor_full_name")}
								{...form.register("visitor_full_name")}
							/>
						</label>
						<FieldError name="visitor_full_name" message={errorFor("visitor_full_name")} />
						<label>
							Preferred name{" "}
							<input
								{...fieldProps("visitor_preferred_name")}
								{...form.register("visitor_preferred_name")}
							/>
						</label>
						<FieldError name="visitor_preferred_name" message={errorFor("visitor_preferred_name")} />
						<label>
							Email (optional){" "}
							<input
								type="email"
								autoComplete="email"
								{...fieldProps("visitor_email")}
								{...form.register("visitor_email")}
							/>
						</label>
						<FieldError name="visitor_email" message={errorFor("visitor_email")} />
						<label>
							Phone number{" "}
							<input
								type="tel"
								autoComplete="tel"
								placeholder="+234…"
								inputMode="tel"
								{...fieldProps("phone_number")}
								{...form.register("phone_number")}
							/>
						</label>
						<p>For Nigeria, enter 0801 234 5678 or +234 801 234 5678. We save it as +2348012345678.</p>
						<FieldError name="phone_number" message={errorFor("phone_number")} />
						<label>
							Your organization (optional){" "}
							<input {...fieldProps("organization")} {...form.register("organization")} />
						</label>
						<FieldError name="organization" message={errorFor("organization")} />
						<label>
							Visit type{" "}
							<select {...fieldProps("visit_type")} {...form.register("visit_type")}>
								{visitTypes.map((type) => (
									<option key={type} value={type}>
										{visitTypeNames[type]}
									</option>
								))}
							</select>
						</label>
						<FieldError name="visit_type" message={errorFor("visit_type")} />
						<label>
							Purpose <textarea rows={3} {...fieldProps("purpose")} {...form.register("purpose")} />
						</label>
						<FieldError name="purpose" message={errorFor("purpose")} />
						<label>
							Department (optional){" "}
							<select
								{...fieldProps("department_id")}
								{...form.register("department_id", {
									onChange: () => form.setValue("staff_id", ""),
								})}
							>
								<option value="">No department selected</option>
								{currentDirectory.departments.map((department) => (
									<option key={department.id} value={department.id}>
										{department.name}
									</option>
								))}
							</select>
						</label>
						<FieldError name="department_id" message={errorFor("department_id")} />
						<label>
							Host (optional){" "}
							<select
								disabled={!selectedDepartment}
								{...fieldProps("staff_id")}
								{...form.register("staff_id")}
							>
								<option value="">No host selected</option>
								{hosts.map((host) => (
									<option key={host.id} value={host.id}>
										{host.name}
									</option>
								))}
							</select>
						</label>
						<FieldError name="staff_id" message={errorFor("staff_id")} />
						{process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ? (
							<Turnstile
								ref={turnstile}
								siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
								onSuccess={(token) => {
									setCaptchaToken(token);
									setCaptchaMessage("");
								}}
								onExpire={() => {
									setCaptchaToken("");
									setCaptchaMessage("Verification expired. Complete it again.");
								}}
								onError={() => {
									setCaptchaToken("");
									setCaptchaMessage("Verification could not load. Check your connection and retry.");
								}}
							/>
						) : (
							<p role="alert">Verification is not configured.</p>
						)}
						{captchaMessage && <p role="status">{captchaMessage}</p>}
						{!captchaToken && (
							<button type="button" onClick={() => turnstile.current?.reset()}>
								Retry verification
							</button>
						)}
						{error && (
							<p role="alert" className={styles.error}>
								{error}
							</p>
						)}
						<button type="submit" disabled={form.formState.isSubmitting || !captchaToken || !online}>
							{form.formState.isSubmitting ? "Submitting…" : "Check in"}
						</button>
					</form>
				)}
			</div>
		</main>
	);
}
