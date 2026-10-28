"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { invokeFunction } from "@/lib/http/invoke-function";
import { publicVisitSchema, visitTypes, type PublicVisitValues } from "@/features/public-check-in/schema";
import type { Department, Staff } from "./types";
import { useOnlineStatus } from "@/lib/hooks/use-online-status";
import { RequestError } from "@/lib/http/request-error";
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
	function fieldProps(name: keyof PublicVisitValues, helpId?: string) {
		const invalid = Boolean(form.formState.errors[name]);
		return {
			id: `assisted-${name}`,
			"aria-invalid": invalid ? (true as const) : undefined,
			"aria-describedby":
				[helpId, invalid ? `assisted-${name}-error` : undefined].filter(Boolean).join(" ") || undefined,
		};
	}
	function fieldError(name: keyof PublicVisitValues) {
		const issue = form.formState.errors[name]?.message;
		return issue ? (
			<small id={`assisted-${name}-error`} role="alert">
				{issue}
			</small>
		) : null;
	}

	async function submit(values: PublicVisitValues) {
		if (values.department_id && !departments.some((item) => item.id === values.department_id && item.is_active)) {
			form.setError("department_id", { message: "Choose an available department." });
			form.setFocus("department_id");
			return;
		}
		if (
			values.staff_id &&
			!staff.some(
				(item) => item.id === values.staff_id && item.department_id === values.department_id && item.is_active,
			)
		) {
			form.setError("staff_id", { message: "Choose an available host in the selected department." });
			form.setFocus("staff_id");
			return;
		}
		if (!window.confirm(`Create this visit at ${branchName}?`)) return;
		const key = idempotencyKey ?? crypto.randomUUID();
		setIdempotencyKey(key);
		setError("");
		try {
			await invokeFunction("create-assisted-visit", {
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
			});
		} catch (cause) {
			if (cause instanceof RequestError && cause.status !== null && cause.status < 500 && cause.status !== 409)
				setIdempotencyKey(null);
			setError(
				cause instanceof RequestError
					? cause.message
					: "The visit outcome is unclear. Check the queue before retrying.",
			);
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
				Full name <input {...fieldProps("visitor_full_name")} {...form.register("visitor_full_name")} />
			</label>
			{fieldError("visitor_full_name")}
			<label>
				Preferred name{" "}
				<input {...fieldProps("visitor_preferred_name")} {...form.register("visitor_preferred_name")} />
			</label>
			{fieldError("visitor_preferred_name")}
			<label>
				Email (optional){" "}
				<input type="email" {...fieldProps("visitor_email")} {...form.register("visitor_email")} />
			</label>
			{fieldError("visitor_email")}
			<label>
				Phone number{" "}
				<input
					type="tel"
					placeholder="+234…"
					{...fieldProps("phone_number")}
					{...form.register("phone_number")}
				/>
			</label>
			{fieldError("phone_number")}
			<label>
				Organization (optional) <input {...fieldProps("organization")} {...form.register("organization")} />
			</label>
			{fieldError("organization")}
			<label>
				Visit type{" "}
				<select {...fieldProps("visit_type")} {...form.register("visit_type")}>
					{visitTypes.map((type) => (
						<option key={type} value={type}>
							{type}
						</option>
					))}
				</select>
			</label>
			{fieldError("visit_type")}
			<label>
				Purpose <textarea rows={2} {...fieldProps("purpose")} {...form.register("purpose")} />
			</label>
			{fieldError("purpose")}
			<label>
				Department (optional){" "}
				<select
					{...fieldProps("department_id")}
					{...form.register("department_id", {
						onChange: () => {
							form.setValue("staff_id", "");
							form.clearErrors(["department_id", "staff_id"]);
						},
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
			{fieldError("department_id")}
			<label>
				Host (optional){" "}
				<select
					disabled={!departmentId}
					{...fieldProps("staff_id", "assisted-host-help")}
					{...form.register("staff_id")}
				>
					<option value="">No host</option>
					{staff
						.filter((item) => item.department_id === departmentId && item.is_active)
						.map((item) => (
							<option key={item.id} value={item.id}>
								{item.preferred_name || item.full_name}
							</option>
						))}
				</select>
			</label>
			<small id="assisted-host-help">Choose a department before selecting a host.</small>
			{fieldError("staff_id")}
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
