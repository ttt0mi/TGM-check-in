"use client";

import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { createClient } from "@/lib/supabase/browser";
import type { Branch } from "@/features/operator/types";
import { messageRole } from "@/features/shared/message-role";
import styles from "./admin.module.css";

const schema = z.object({
	name: z.string().trim().min(1).max(120),
	address: z.string().trim().min(1, "Enter a branch address").max(240),
	timezone: z
		.string()
		.min(1)
		.refine((value) => {
			try {
				new Intl.DateTimeFormat("en", { timeZone: value });
				return true;
			} catch {
				return false;
			}
		}, "Enter a valid IANA time zone"),
});
type Values = z.infer<typeof schema>;
const overdueSchema = schema.extend({
	reception_overdue_minutes: z.number().int().min(1).max(1440),
	host_overdue_minutes: z.number().int().min(1).max(1440),
	admission_overdue_minutes: z.number().int().min(1).max(1440),
});

export function BranchManagement({ branches, onChanged }: { branches: Branch[]; onChanged: () => void }) {
	const form = useForm<Values>({
		resolver: zodResolver(schema),
		defaultValues: { name: "", address: "", timezone: "Africa/Lagos" },
	});
	const [message, setMessage] = useState("");
	async function create(values: Values) {
		setMessage("");
		const { error } = await createClient().functions.invoke("create-branch", {
			body: values,
		});
		if (error) {
			setMessage("Unable to create this branch. Check the details and retry.");
			return;
		}
		form.reset();
		onChanged();
		setMessage("Branch created.");
	}
	return (
		<section className={styles.section}>
			<h2>Branches</h2>
			<form
				className={styles.form}
				onSubmit={form.handleSubmit(create, (errors) => {
					const first = Object.keys(errors)[0] as keyof Values | undefined;
					if (first) form.setFocus(first);
				})}
				noValidate
			>
				<label>
					Name{" "}
					<input
						aria-invalid={!!form.formState.errors.name}
						aria-describedby={form.formState.errors.name ? "branch-name-error" : undefined}
						{...form.register("name")}
					/>
				</label>
				{form.formState.errors.name && (
					<small id="branch-name-error" role="alert">
						{form.formState.errors.name.message}
					</small>
				)}
				<label>
					Address{" "}
					<input
						required
						aria-invalid={!!form.formState.errors.address}
						aria-describedby={form.formState.errors.address ? "branch-address-error" : undefined}
						{...form.register("address")}
					/>
				</label>
				{form.formState.errors.address && (
					<small id="branch-address-error" role="alert">
						{form.formState.errors.address.message}
					</small>
				)}
				<label>
					Time zone{" "}
					<input
						aria-invalid={!!form.formState.errors.timezone}
						aria-describedby={form.formState.errors.timezone ? "branch-timezone-error" : undefined}
						{...form.register("timezone")}
						placeholder="Africa/Lagos"
					/>
				</label>
				{form.formState.errors.timezone && (
					<small id="branch-timezone-error" role="alert">
						{form.formState.errors.timezone.message}
					</small>
				)}
				<button disabled={form.formState.isSubmitting}>
					{form.formState.isSubmitting ? "Creating…" : "Create branch"}
				</button>
			</form>
			{message && <p role={messageRole(message)}>{message}</p>}
			<ul className={styles.list}>
				{branches.length === 0 && <li>No branches yet. Use the form above to create the first branch.</li>}
				{branches.map((branch) => (
					<li key={branch.id}>
						<strong>{branch.name}</strong> · {branch.is_active ? "Active" : "Inactive"}
						<p>
							{branch.address} · {branch.timezone}
						</p>
						<p>Auto close: {branch.auto_close_enabled ? branch.auto_close_local_time : "off"}</p>
						<Link href={`/app/branches/${branch.id}/qr`}>Printable QR</Link>
						<BranchEditor branch={branch} onChanged={onChanged} />
					</li>
				))}
			</ul>
		</section>
	);
}

function BranchEditor({ branch, onChanged }: { branch: Branch; onChanged: () => void }) {
	const [name, setName] = useState(branch.name);
	const [address, setAddress] = useState(branch.address);
	const [timezone, setTimezone] = useState(branch.timezone);
	const [autoClose, setAutoClose] = useState(branch.auto_close_enabled);
	const [autoCloseTime, setAutoCloseTime] = useState(branch.auto_close_local_time ?? "17:00");
	const [receptionOverdue, setReceptionOverdue] = useState(branch.reception_overdue_minutes);
	const [hostOverdue, setHostOverdue] = useState(branch.host_overdue_minutes);
	const [admissionOverdue, setAdmissionOverdue] = useState(branch.admission_overdue_minutes);
	const [error, setError] = useState("");
	const [savedMessage, setSavedMessage] = useState("");
	const [saving, setSaving] = useState(false);
	const [activePending, setActivePending] = useState(false);
	async function save(event: React.FormEvent) {
		event.preventDefault();
		setSavedMessage("");
		if (autoClose && !/^([01]\d|2[0-3]):[0-5]\d$/.test(autoCloseTime.slice(0, 5))) {
			setError("Choose a valid local auto-close time.");
			return;
		}
		const parsed = overdueSchema.safeParse({
			name,
			address,
			timezone,
			reception_overdue_minutes: receptionOverdue,
			host_overdue_minutes: hostOverdue,
			admission_overdue_minutes: admissionOverdue,
		});
		if (!parsed.success) {
			setError(parsed.error.issues[0]?.message ?? "Invalid branch details");
			return;
		}
		setSaving(true);
		const { error: failure } = await createClient()
			.from("locations")
			.update({
				...parsed.data,
				auto_close_enabled: autoClose,
				auto_close_local_time: autoClose ? autoCloseTime : null,
			})
			.eq("id", branch.id);
		setSaving(false);
		if (failure) {
			setError("Unable to save branch details. Check the values and retry.");
			return;
		}
		setError("");
		setSavedMessage("Branch details saved.");
		onChanged();
	}
	async function setActive(active: boolean) {
		const supabase = createClient();
		if (!active) {
			const { count, error: preflightError } = await supabase
				.from("visits")
				.select("id", { count: "exact", head: true })
				.eq("location_id", branch.id)
				.in("status", [
					"pending_reception_review",
					"pending_host_acknowledgement",
					"host_approved_awaiting_reception",
					"approved_on_site",
				]);
			if (preflightError) {
				setError("Unable to check active visits. Please retry.");
				return;
			}
			if (count) {
				setError(`Resolve ${count} active visit(s) before deactivating ${branch.name}.`);
				return;
			}
		}
		if (
			!window.confirm(
				`${active ? "Reactivate" : "Deactivate"} ${branch.name}? ${active ? "Public check-in will become available if privacy content is approved." : "New check-ins at this branch will stop."}`,
			)
		)
			return;
		setActivePending(true);
		const { error: failure } = await createClient()
			.from("locations")
			.update({ is_active: active })
			.eq("id", branch.id);
		if (failure) {
			setError("Unable to change branch availability. Check for active visits and retry.");
			setActivePending(false);
			return;
		}
		setError("");
		setActivePending(false);
		onChanged();
	}
	return (
		<>
			<form className={styles.form} onSubmit={(event) => void save(event)}>
				<label>
					Name <input value={name} onChange={(event) => setName(event.target.value)} />
				</label>
				<label>
					Address <input value={address} onChange={(event) => setAddress(event.target.value)} />
				</label>
				<label>
					Time zone <input value={timezone} onChange={(event) => setTimezone(event.target.value)} />
				</label>
				<label>
					<span>Auto close</span>
					<input
						type="checkbox"
						checked={autoClose}
						onChange={(event) => setAutoClose(event.target.checked)}
					/>
				</label>
				{autoClose && (
					<label>
						Auto-close time in {timezone}{" "}
						<input
							type="time"
							required
							value={autoCloseTime.slice(0, 5)}
							onChange={(event) => setAutoCloseTime(event.target.value)}
						/>
					</label>
				)}
				<p>
					Auto-close runs on the configured schedule in {timezone}; processing may occur after the selected
					minute.
				</p>
				<label>
					Reception review overdue after (minutes)
					<input
						type="number"
						min="1"
						max="1440"
						value={receptionOverdue}
						onChange={(event) => setReceptionOverdue(Number(event.target.value))}
					/>
				</label>
				<label>
					Host response overdue after (minutes)
					<input
						type="number"
						min="1"
						max="1440"
						value={hostOverdue}
						onChange={(event) => setHostOverdue(Number(event.target.value))}
					/>
				</label>
				<label>
					Admission overdue after (minutes)
					<input
						type="number"
						min="1"
						max="1440"
						value={admissionOverdue}
						onChange={(event) => setAdmissionOverdue(Number(event.target.value))}
					/>
				</label>
				<button disabled={saving}>{saving ? "Saving…" : "Save"}</button>
			</form>
			<button disabled={activePending} onClick={() => void setActive(!branch.is_active)}>
				{branch.is_active ? "Deactivate" : "Reactivate"}
			</button>
			{error.includes("active visit") && (
				<p>
					<Link href={`/app?branch=${branch.id}`}>Open this branch’s reception queue</Link>
				</p>
			)}
			{error && (
				<p role="alert" className={styles.error}>
					{error}
				</p>
			)}
			{savedMessage && <p role="status">{savedMessage}</p>}
		</>
	);
}
