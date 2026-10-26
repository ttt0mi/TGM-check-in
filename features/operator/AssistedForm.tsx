"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { createClient } from "@/lib/supabase/browser";
import { publicVisitSchema, visitTypes, type PublicVisitValues } from "@/features/public-check-in/schema";
import type { Department, Staff } from "./types";
import { useOnlineStatus } from "@/lib/hooks/use-online-status";
import { functionError } from "@/lib/http/request-error";
import styles from "./operator.module.css";

export function AssistedForm({
	branchId,
	branchName,
	departments,
	staff,
	onCreated,
	onCancel,
}: {
	branchId: string;
	branchName: string;
	departments: Department[];
	staff: Staff[];
	onCreated: () => void;
	onCancel: () => void;
}) {
	const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
	const online = useOnlineStatus();
	const [error, setError] = useState("");
	const heading = useRef<HTMLHeadingElement | null>(null);
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
	const departmentId = useWatch({
		control: form.control,
		name: "department_id",
	});

	async function submit(values: PublicVisitValues) {
		if (!window.confirm(`Create this visit at ${branchName}?`)) return;
		const key = idempotencyKey ?? crypto.randomUUID();
		setIdempotencyKey(key);
		setError("");
		const { error: failure, response } = await createClient().functions.invoke("create-assisted-visit", {
			body: {
				location_id: branchId,
				idempotency_key: key,
				visitor_full_name: values.visitor_full_name,
				visitor_preferred_name: values.visitor_preferred_name || null,
				visitor_email: values.visitor_email || null,
				phone_number: values.phone_number,
				organization: values.organization || null,
				visit_type: values.visit_type,
				purpose: values.purpose,
				department_id: values.department_id || null,
				staff_id: values.staff_id || null,
			},
		});
		if (failure) {
			setError((await functionError(failure, response)).message);
			return;
		}
		setIdempotencyKey(null);
		form.reset();
		onCreated();
	}

	return (
		<form
			className={styles.form}
			onSubmit={form.handleSubmit(submit, (errors) => {
				const first = Object.keys(errors)[0] as keyof PublicVisitValues | undefined;
				if (first) form.setFocus(first);
			})}
			noValidate
		>
			<h2 ref={heading} tabIndex={-1}>
				Assisted check-in
			</h2>
			<p>
				Branch: <strong>{branchName}</strong>
			</p>
			<label>
				Full name <input {...form.register("visitor_full_name")} />
			</label>
			{form.formState.errors.visitor_full_name && (
				<small role="alert">{form.formState.errors.visitor_full_name.message}</small>
			)}
			<label>
				Preferred name <input {...form.register("visitor_preferred_name")} />
			</label>
			<label>
				Email (optional) <input type="email" {...form.register("visitor_email")} />
			</label>
			<label>
				Phone number <input type="tel" placeholder="+234…" {...form.register("phone_number")} />
			</label>
			{form.formState.errors.phone_number && (
				<small role="alert">{form.formState.errors.phone_number.message}</small>
			)}
			<label>
				Organization (optional) <input {...form.register("organization")} />
			</label>
			<label>
				Visit type{" "}
				<select {...form.register("visit_type")}>
					{visitTypes.map((type) => (
						<option key={type} value={type}>
							{type}
						</option>
					))}
				</select>
			</label>
			<label>
				Purpose <textarea rows={2} {...form.register("purpose")} />
			</label>
			<label>
				Department (optional){" "}
				<select
					{...form.register("department_id", {
						onChange: () => form.setValue("staff_id", ""),
					})}
				>
					<option value="">No department</option>
					{departments.map((item) => (
						<option key={item.id} value={item.id}>
							{item.name}
						</option>
					))}
				</select>
			</label>
			<label>
				Host (optional){" "}
				<select disabled={!departmentId} {...form.register("staff_id")}>
					<option value="">No host</option>
					{staff
						.filter((item) => item.department_id === departmentId)
						.map((item) => (
							<option key={item.id} value={item.id}>
								{item.preferred_name || item.full_name}
							</option>
						))}
				</select>
			</label>
			{error && (
				<p role="alert" className={styles.error}>
					{error}
				</p>
			)}
			<button disabled={form.formState.isSubmitting || !online}>Create visit</button>
			<button
				type="button"
				disabled={form.formState.isSubmitting}
				onClick={() => {
					if (
						form.formState.isDirty &&
						!window.confirm(`Clear the assisted check-in form for ${branchName}?`)
					)
						return;
					form.reset();
					setIdempotencyKey(null);
					setError("");
					heading.current?.focus();
				}}
			>
				Reset form
			</button>
			<button
				type="button"
				disabled={form.formState.isSubmitting}
				onClick={() => {
					if (!form.formState.isDirty || window.confirm(`Discard this assisted check-in for ${branchName}?`))
						onCancel();
				}}
			>
				Cancel
			</button>
		</form>
	);
}
