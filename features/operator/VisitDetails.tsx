"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { createClient } from "@/lib/supabase/browser";
import { publicVisitSchema, visitTypes, type PublicVisitValues } from "@/features/public-check-in/schema";
import type { Department, Staff, Visit } from "./types";
import styles from "./operator.module.css";
import { visitEventLabel, visitTypeLabel } from "@/features/shared/visit-labels";
import { postgrestError, RequestError } from "@/lib/http/request-error";
import { invokeFunction } from "@/lib/http/invoke-function";
import { READ_TIMEOUT_MS, withRequestTimeout } from "@/lib/http/timeout";

export function VisitDetails({
	visit,
	departments,
	staff,
	timezone,
}: {
	visit: Visit;
	departments: Department[];
	staff: Staff[];
	timezone: string;
}) {
	const [editing, setEditing] = useState(false);
	const events = useQuery({
		queryKey: ["visit-events", visit.id],
		queryFn: async ({ signal }) => {
			const { data, error } = await withRequestTimeout(
				async (requestSignal) =>
					await createClient()
						.from("visit_events")
						.select("id,event_type,event_source,actor_role,occurred_at")
						.eq("visit_id", visit.id)
						.order("occurred_at", { ascending: true })
						.abortSignal(requestSignal),
				READ_TIMEOUT_MS,
				signal,
			);
			if (error) throw postgrestError(error);
			return data;
		},
	});
	const editable = [
		"pending_reception_review",
		"pending_host_acknowledgement",
		"host_approved_awaiting_reception",
	].includes(visit.status);
	return (
		<section className={styles.details}>
			<h3>Visit details</h3>
			<dl>
				<dt>Full name</dt>
				<dd>{visit.visitor_full_name}</dd>
				<dt>Phone</dt>
				<dd>{visit.phone_number}</dd>
				<dt>Email</dt>
				<dd>{visit.visitor_email || "—"}</dd>
				<dt>Organization</dt>
				<dd>{visit.organization || "—"}</dd>
				<dt>Host</dt>
				<dd>
					{staff.find((item) => item.id === visit.staff_id)?.preferred_name ||
						staff.find((item) => item.id === visit.staff_id)?.full_name ||
						visit.host_display_name_at_assignment ||
						"None"}
				</dd>
			</dl>
			{editable && (
				<button onClick={() => setEditing((current) => !current)}>
					{editing ? "Close editor" : "Edit visit"}
				</button>
			)}
			{editing && (
				<VisitEditor visit={visit} departments={departments} staff={staff} onSaved={() => setEditing(false)} />
			)}
			<h3>History</h3>
			{events.error && events.data && (
				<p role="alert">
					History may be out of date. <button onClick={() => void events.refetch()}>Retry history</button>
				</p>
			)}
			{events.isPending ? (
				<p>Loading history…</p>
			) : events.error && !events.data ? (
				<p role="alert">
					Unable to load history. <button onClick={() => void events.refetch()}>Retry history</button>
				</p>
			) : (
				<ol>
					{events.data?.map((event) => (
						<li key={event.id}>
							<strong>{visitEventLabel(event.event_type)}</strong> ·{" "}
							{new Intl.DateTimeFormat(undefined, {
								timeZone: timezone,
								dateStyle: "medium",
								timeStyle: "short",
							}).format(new Date(event.occurred_at))}
							<small> · {event.actor_role || event.event_source}</small>
						</li>
					))}
				</ol>
			)}
		</section>
	);
}

function VisitEditor({
	visit,
	departments,
	staff,
	onSaved,
}: {
	visit: Visit;
	departments: Department[];
	staff: Staff[];
	onSaved: () => void;
}) {
	const queryClient = useQueryClient();
	const [error, setError] = useState("");
	const form = useForm<PublicVisitValues>({
		resolver: zodResolver(publicVisitSchema),
		defaultValues: {
			visitor_full_name: visit.visitor_full_name,
			visitor_preferred_name: visit.visitor_preferred_name ?? "",
			visitor_email: visit.visitor_email ?? "",
			phone_number: visit.phone_number,
			organization: visit.organization ?? "",
			visit_type: visit.visit_type,
			purpose: visit.purpose,
			department_id: visit.department_id ?? "",
			staff_id: visit.staff_id ?? "",
		},
	});
	const departmentId = useWatch({
		control: form.control,
		name: "department_id",
	});
	const canChangeHost = visit.status === "pending_reception_review";
	function fieldError(name: keyof PublicVisitValues) {
		const issue = form.formState.errors[name]?.message;
		return issue ? (
			<small id={`visit-${name}-error`} role="alert">
				{issue}
			</small>
		) : null;
	}
	function fieldProps(name: keyof PublicVisitValues) {
		return {
			"aria-invalid": Boolean(form.formState.errors[name]),
			"aria-describedby": form.formState.errors[name] ? `visit-${name}-error` : undefined,
		};
	}
	async function save(values: PublicVisitValues) {
		const patch: Record<string, string | null> = {};
		for (const field of [
			"visitor_full_name",
			"visitor_preferred_name",
			"visitor_email",
			"phone_number",
			"organization",
			"visit_type",
			"purpose",
		] as const) {
			const value = values[field] || null;
			if (value !== (visit[field] || null)) patch[field] = value;
		}
		if (canChangeHost) {
			if ((values.department_id || null) !== visit.department_id)
				patch.department_id = values.department_id || null;
			if ((values.staff_id || null) !== visit.staff_id) patch.staff_id = values.staff_id || null;
		}
		if (Object.keys(patch).length === 0) {
			onSaved();
			return;
		}
		try {
			await invokeFunction("reception-visit-action", { visit_id: visit.id, action: "edit", patch });
		} catch (cause) {
			setError(
				cause instanceof RequestError
					? cause.message
					: "Edit outcome is unclear. Refresh the visit before retrying.",
			);
			return;
		}
		try {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: ["visit-queue", visit.location_id] }),
				queryClient.invalidateQueries({ queryKey: ["visit-queue-counts", visit.location_id] }),
				queryClient.invalidateQueries({ queryKey: ["visit-events", visit.id] }),
			]);
		} catch {
			setError("Visit updated, but records could not be refreshed. Refresh the queue.");
			return;
		}
		onSaved();
	}
	return (
		<form
			className={styles.form}
			onSubmit={form.handleSubmit(save, (errors) => {
				const first = Object.keys(errors)[0] as keyof PublicVisitValues | undefined;
				if (first) form.setFocus(first);
			})}
			noValidate
		>
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
				Email <input type="email" {...fieldProps("visitor_email")} {...form.register("visitor_email")} />
			</label>
			{fieldError("visitor_email")}
			<label>
				Phone <input type="tel" {...fieldProps("phone_number")} {...form.register("phone_number")} />
			</label>
			{fieldError("phone_number")}
			<label>
				Organization <input {...fieldProps("organization")} {...form.register("organization")} />
			</label>
			{fieldError("organization")}
			<label>
				Visit type{" "}
				<select {...fieldProps("visit_type")} {...form.register("visit_type")}>
					{visitTypes.map((type) => (
						<option key={type} value={type}>
							{visitTypeLabel(type)}
						</option>
					))}
				</select>
			</label>
			{fieldError("visit_type")}
			<label>
				Purpose <textarea rows={2} {...fieldProps("purpose")} {...form.register("purpose")} />
			</label>
			{fieldError("purpose")}
			{canChangeHost && (
				<>
					<label>
						Department{" "}
						<select
							{...fieldProps("department_id")}
							{...form.register("department_id", {
								onChange: () => form.setValue("staff_id", ""),
							})}
						>
							<option value="">None</option>
							{departments.map((item) => (
								<option key={item.id} value={item.id}>
									{item.name}
								</option>
							))}
						</select>
					</label>
					{fieldError("department_id")}
					<label>
						Host{" "}
						<select {...fieldProps("staff_id")} {...form.register("staff_id")} disabled={!departmentId}>
							<option value="">None</option>
							{staff
								.filter((item) => item.department_id === departmentId)
								.map((item) => (
									<option key={item.id} value={item.id}>
										{item.preferred_name || item.full_name}
									</option>
								))}
						</select>
					</label>
					{fieldError("staff_id")}
				</>
			)}
			{error && <p role="alert">{error}</p>}
			<button disabled={form.formState.isSubmitting}>Save changes</button>
		</form>
	);
}
