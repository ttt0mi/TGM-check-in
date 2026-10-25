"use client";

import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { createClient } from "@/lib/supabase/browser";
import type { Branch } from "@/features/operator/types";
import styles from "./admin.module.css";

const schema = z.object({
	name: z.string().trim().min(1).max(120),
	address: z.string().trim().max(240),
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
			setMessage(error.message);
			return;
		}
		form.reset();
		onChanged();
		setMessage("Branch created.");
	}
	return (
		<section className={styles.section}>
			<h2>Branches</h2>
			<form className={styles.form} onSubmit={form.handleSubmit(create)}>
				<label>
					Name <input {...form.register("name")} />
				</label>
				<label>
					Address <input {...form.register("address")} />
				</label>
				<label>
					Time zone <input {...form.register("timezone")} placeholder="Africa/Lagos" />
				</label>
				<button disabled={form.formState.isSubmitting}>Create branch</button>
			</form>
			{Object.values(form.formState.errors).map((error, index) => (
				<p className={styles.error} key={index}>
					{error.message}
				</p>
			))}
			{message && <p role="status">{message}</p>}
			<ul className={styles.list}>
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
	async function save(event: React.FormEvent) {
		event.preventDefault();
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
		const { error: failure } = await createClient()
			.from("locations")
			.update({
				...parsed.data,
				auto_close_enabled: autoClose,
				auto_close_local_time: autoClose ? autoCloseTime : null,
			})
			.eq("id", branch.id);
		if (failure) {
			setError(failure.message);
			return;
		}
		setError("");
		onChanged();
	}
	async function setActive(active: boolean) {
		const { error: failure } = await createClient()
			.from("locations")
			.update({ is_active: active })
			.eq("id", branch.id);
		if (failure) {
			setError(failure.message);
			return;
		}
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
						Local time{" "}
						<input
							type="time"
							value={autoCloseTime.slice(0, 5)}
							onChange={(event) => setAutoCloseTime(event.target.value)}
						/>
					</label>
				)}
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
				<button>Save</button>
			</form>
			<button onClick={() => void setActive(!branch.is_active)}>
				{branch.is_active ? "Deactivate" : "Reactivate"}
			</button>
			{error && (
				<p role="alert" className={styles.error}>
					{error}
				</p>
			)}
		</>
	);
}
