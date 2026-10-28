"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { createClient } from "@/lib/supabase/browser";
import Link from "next/link";
import type { Branch, Department, Staff } from "@/features/operator/types";
import { messageRole } from "@/features/shared/message-role";
import styles from "./admin.module.css";
import { visitStatusLabel } from "@/features/shared/visit-labels";
import { invokeFunction } from "@/lib/http/invoke-function";
import { postgrestError, RequestError } from "@/lib/http/request-error";
import { MUTATION_TIMEOUT_MS, READ_TIMEOUT_MS, withRequestTimeout } from "@/lib/http/timeout";

const staffDetailsSchema = z.object({
	full_name: z.string().trim().min(1).max(120),
	preferred_name: z.string().trim().max(80),
	email: z.string().trim().toLowerCase().email().max(254),
});

export function DirectoryManagement({
	organizationId,
	branches,
	departments,
	staff,
	onChanged,
}: {
	organizationId: string;
	branches: Branch[];
	departments: Department[];
	staff: Staff[];
	onChanged: () => void;
}) {
	const [departmentName, setDepartmentName] = useState("");
	const [fullName, setFullName] = useState("");
	const [preferredName, setPreferredName] = useState("");
	const [email, setEmail] = useState("");
	const [branchId, setBranchId] = useState(branches.find((item) => item.is_active)?.id ?? "");
	const [departmentId, setDepartmentId] = useState(departments.find((item) => item.is_active)?.id ?? "");
	const [message, setMessage] = useState("");
	const [addingDepartment, setAddingDepartment] = useState(false);
	const [addingStaff, setAddingStaff] = useState(false);
	const [busyId, setBusyId] = useState<string | null>(null);
	const [renamingDepartmentId, setRenamingDepartmentId] = useState<string | null>(null);
	const [renamedDepartmentName, setRenamedDepartmentName] = useState("");
	const [staffRows, setStaffRows] = useState(staff);
	const [staffCount, setStaffCount] = useState(staff.length);
	const [staffPage, setStaffPage] = useState(0);
	const [staffSearchInput, setStaffSearchInput] = useState("");
	const [staffSearch, setStaffSearch] = useState("");
	const [staffStatus, setStaffStatus] = useState<"all" | "active" | "inactive">("all");
	const [staffLoading, setStaffLoading] = useState(true);
	const staffRequest = useRef(0);
	const [departmentSearch, setDepartmentSearch] = useState("");
	const [blockingVisits, setBlockingVisits] = useState<{ id: string; visitor_full_name: string; status: string }[]>(
		[],
	);
	const [blockingBranchId, setBlockingBranchId] = useState<string | null>(null);
	const loadStaff = useCallback(async () => {
		const requestId = ++staffRequest.current;
		setStaffLoading(true);
		let query = createClient()
			.from("staff")
			.select("id,full_name,preferred_name,department_id,location_id,email,is_active", { count: "exact" })
			.eq("organization_id", organizationId)
			.order("full_name")
			.order("id")
			.range(staffPage * 25, staffPage * 25 + 24);
		if (staffStatus !== "all") query = query.eq("is_active", staffStatus === "active");
		if (staffSearch)
			query = query.ilike("full_name", `%${staffSearch.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`);
		let result;
		try {
			result = await withRequestTimeout(async (signal) => await query.abortSignal(signal), READ_TIMEOUT_MS);
		} catch (cause) {
			if (requestId === staffRequest.current) {
				setStaffLoading(false);
				setMessage(cause instanceof RequestError ? cause.message : "Unable to refresh staff. Please retry.");
			}
			return;
		}
		const { data, count, error } = result;
		if (requestId !== staffRequest.current) return;
		setStaffLoading(false);
		if (error) {
			setMessage("Unable to refresh staff. Please retry.");
			return;
		}
		setStaffRows(data ?? []);
		setStaffCount(count ?? 0);
	}, [organizationId, staffPage, staffSearch, staffStatus]);
	useEffect(() => {
		queueMicrotask(() => void loadStaff());
	}, [loadStaff]);
	const changed = (scope: "staff" | "all" = "all") => {
		if (scope === "all") onChanged();
		void loadStaff();
	};

	async function addDepartment(event: React.FormEvent) {
		event.preventDefault();
		setMessage("");
		const name = departmentName.trim();
		if (!name || name.length > 120) {
			setMessage("Enter a valid department name.");
			return;
		}
		setAddingDepartment(true);
		try {
			const { error } = await withRequestTimeout(
				async (signal) =>
					await createClient()
						.from("departments")
						.insert({ organization_id: organizationId, name })
						.abortSignal(signal),
				MUTATION_TIMEOUT_MS,
			);
			if (error) throw postgrestError(error);
			setDepartmentName("");
			try {
				changed();
				setMessage("Department added.");
			} catch {
				setMessage("Department added, but records could not be refreshed. Refresh the directory.");
			}
		} catch (cause) {
			setMessage(
				cause instanceof RequestError ? cause.message : "Add outcome is unclear. Refresh before retrying.",
			);
		} finally {
			setAddingDepartment(false);
		}
	}
	async function addStaff(event: React.FormEvent) {
		event.preventDefault();
		setMessage("");
		if (
			!branches.some((item) => item.id === branchId && item.is_active) ||
			!departments.some((item) => item.id === departmentId && item.is_active)
		) {
			setMessage("Choose a branch and department.");
			return;
		}
		const details = staffDetailsSchema.safeParse({ full_name: fullName, preferred_name: preferredName, email });
		if (!details.success) {
			setMessage("Enter a valid staff name and email address.");
			return;
		}
		setAddingStaff(true);
		try {
			const { error } = await withRequestTimeout(
				async (signal) =>
					await createClient()
						.from("staff")
						.insert({
							organization_id: organizationId,
							location_id: branchId,
							department_id: departmentId,
							full_name: details.data.full_name,
							preferred_name: details.data.preferred_name || null,
							email: details.data.email,
						})
						.abortSignal(signal),
				MUTATION_TIMEOUT_MS,
			);
			if (error) throw postgrestError(error);
			setFullName("");
			setPreferredName("");
			setEmail("");
			try {
				changed("staff");
				setMessage("Staff member added.");
			} catch {
				setMessage("Staff member added, but records could not be refreshed. Refresh the directory.");
			}
		} catch (cause) {
			setMessage(
				cause instanceof RequestError ? cause.message : "Add outcome is unclear. Refresh before retrying.",
			);
		} finally {
			setAddingStaff(false);
		}
	}
	async function toggle(table: "departments" | "staff", id: string, isActive: boolean) {
		const supabase = createClient();
		setBlockingVisits([]);
		setBlockingBranchId(null);
		const name =
			table === "departments"
				? departments.find((item) => item.id === id)?.name
				: staffRows.find((item) => item.id === id)?.full_name;
		if (isActive) {
			let result;
			try {
				result = await withRequestTimeout(
					async (signal) =>
						table === "departments"
							? await supabase
									.from("staff")
									.select("id", { count: "exact", head: true })
									.eq("department_id", id)
									.eq("is_active", true)
									.abortSignal(signal)
							: await supabase
									.from("visits")
									.select("id", { count: "exact", head: true })
									.eq("staff_id", id)
									.in("status", [
										"pending_reception_review",
										"pending_host_acknowledgement",
										"host_approved_awaiting_reception",
										"approved_on_site",
									])
									.abortSignal(signal),
					READ_TIMEOUT_MS,
				);
			} catch (cause) {
				setMessage(cause instanceof RequestError ? cause.message : "Unable to check dependencies.");
				return;
			}
			if (result.error) {
				setMessage(postgrestError(result.error).message);
				return;
			}
			if (result.count) {
				if (table === "staff") {
					let visits;
					try {
						visits = await withRequestTimeout(
							async (signal) =>
								await supabase
									.from("visits")
									.select("id,visitor_full_name,status")
									.eq("staff_id", id)
									.in("status", [
										"pending_reception_review",
										"pending_host_acknowledgement",
										"host_approved_awaiting_reception",
										"approved_on_site",
									])
									.order("arrived_at", { ascending: true })
									.limit(10)
									.abortSignal(signal),
							READ_TIMEOUT_MS,
						);
					} catch {
						visits = null;
					}
					if (visits?.data) setBlockingVisits(visits.data);
					setBlockingBranchId(staffRows.find((item) => item.id === id)?.location_id ?? null);
				}
				setMessage(
					table === "departments"
						? `Move or deactivate ${result.count} active staff member(s) before deactivating ${name}.`
						: `Resolve ${result.count} active visit(s) before deactivating ${name}.`,
				);
				return;
			}
		}
		if (
			!window.confirm(
				`${isActive ? "Deactivate" : "Reactivate"} ${name}? ${isActive ? "Existing visit history remains available." : "They will become available for new visits."}`,
			)
		)
			return;
		setBusyId(id);
		setMessage("");
		try {
			const { error } = await withRequestTimeout(
				async (signal) =>
					table === "departments"
						? await supabase
								.from("departments")
								.update({ is_active: !isActive })
								.eq("id", id)
								.eq("organization_id", organizationId)
								.abortSignal(signal)
						: await supabase
								.from("staff")
								.update({ is_active: !isActive })
								.eq("id", id)
								.eq("organization_id", organizationId)
								.abortSignal(signal),
				MUTATION_TIMEOUT_MS,
			);
			if (error) throw postgrestError(error);
			try {
				changed(table === "staff" ? "staff" : "all");
				setMessage("Availability updated.");
			} catch {
				setMessage("Availability changed, but records could not be refreshed. Refresh the directory.");
			}
		} catch (cause) {
			setMessage(
				cause instanceof RequestError
					? cause.message
					: "Availability outcome is unclear. Refresh before retrying.",
			);
		} finally {
			setBusyId(null);
		}
	}
	async function renameDepartment(event: React.FormEvent, item: Department) {
		event.preventDefault();
		const name = renamedDepartmentName.trim();
		if (!name || name.length > 120) {
			setMessage("Enter a department name of at most 120 characters.");
			return;
		}
		if (name === item.name) {
			setRenamingDepartmentId(null);
			return;
		}
		setBusyId(item.id);
		try {
			const { error } = await withRequestTimeout(
				async (signal) =>
					await createClient()
						.from("departments")
						.update({ name })
						.eq("id", item.id)
						.eq("organization_id", organizationId)
						.abortSignal(signal),
				MUTATION_TIMEOUT_MS,
			);
			if (error) throw postgrestError(error);
			setRenamingDepartmentId(null);
			try {
				changed();
				setMessage("Department renamed.");
			} catch {
				setMessage("Department renamed, but records could not be refreshed. Refresh the directory.");
			}
		} catch (cause) {
			setMessage(
				cause instanceof RequestError ? cause.message : "Rename outcome is unclear. Refresh before retrying.",
			);
		} finally {
			setBusyId(null);
		}
	}
	return (
		<section className={styles.section}>
			<h2>Host directory</h2>
			<h3>Departments</h3>
			<label>
				Search departments{" "}
				<input
					type="search"
					value={departmentSearch}
					onChange={(event) => setDepartmentSearch(event.target.value)}
				/>
			</label>
			<form className={styles.form} onSubmit={(event) => void addDepartment(event)}>
				<label>
					Department name{" "}
					<input
						maxLength={120}
						required
						value={departmentName}
						onChange={(event) => setDepartmentName(event.target.value)}
					/>
				</label>
				<button disabled={addingDepartment}>{addingDepartment ? "Adding…" : "Add department"}</button>
			</form>
			<ul className={styles.list}>
				{departments
					.filter((item) => item.name.toLowerCase().includes(departmentSearch.trim().toLowerCase()))
					.map((item) => (
						<li key={item.id}>
							<strong>{item.name}</strong> · {item.is_active ? "Active" : "Inactive"}
							<br />
							{renamingDepartmentId === item.id ? (
								<form className={styles.form} onSubmit={(event) => void renameDepartment(event, item)}>
									<label>
										New department name{" "}
										<input
											autoFocus
											value={renamedDepartmentName}
											maxLength={120}
											onChange={(event) => setRenamedDepartmentName(event.target.value)}
										/>
									</label>
									<button disabled={busyId === item.id}>
										{busyId === item.id ? "Saving…" : "Save name"}
									</button>
									<button type="button" onClick={() => setRenamingDepartmentId(null)}>
										Cancel
									</button>
								</form>
							) : (
								<button
									onClick={() => {
										setRenamedDepartmentName(item.name);
										setRenamingDepartmentId(item.id);
									}}
								>
									Rename
								</button>
							)}
							<button
								disabled={busyId === item.id}
								onClick={() => void toggle("departments", item.id, item.is_active)}
							>
								{item.is_active ? "Deactivate" : "Reactivate"}
							</button>
						</li>
					))}
			</ul>
			{departments.length === 0 && <p>No departments yet. Add one to make hosts available.</p>}
			<h3>Staff</h3>
			<form className={styles.form} onSubmit={(event) => void addStaff(event)}>
				<label>
					Full name{" "}
					<input
						maxLength={120}
						required
						value={fullName}
						onChange={(event) => setFullName(event.target.value)}
					/>
				</label>
				<label>
					Preferred name{" "}
					<input
						maxLength={80}
						value={preferredName}
						onChange={(event) => setPreferredName(event.target.value)}
					/>
				</label>
				<label>
					Email{" "}
					<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
				</label>
				<label>
					Branch{" "}
					<select required value={branchId} onChange={(event) => setBranchId(event.target.value)}>
						<option value="">Choose a branch</option>
						{branches
							.filter((item) => item.is_active)
							.map((item) => (
								<option key={item.id} value={item.id}>
									{item.name}
								</option>
							))}
					</select>
				</label>
				<label>
					Department{" "}
					<select required value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
						<option value="">Choose a department</option>
						{departments
							.filter((item) => item.is_active)
							.map((item) => (
								<option key={item.id} value={item.id}>
									{item.name}
								</option>
							))}
					</select>
				</label>
				<button disabled={addingStaff}>{addingStaff ? "Adding…" : "Add staff member"}</button>
			</form>
			<div className={styles.form}>
				<label>
					Search staff by name{" "}
					<input
						type="search"
						value={staffSearchInput}
						onChange={(event) => setStaffSearchInput(event.target.value)}
					/>
				</label>
				<label>
					Availability{" "}
					<select
						value={staffStatus}
						onChange={(event) => {
							setStaffStatus(event.target.value as typeof staffStatus);
							setStaffPage(0);
						}}
					>
						<option value="all">All</option>
						<option value="active">Active</option>
						<option value="inactive">Inactive</option>
					</select>
				</label>
				<button
					onClick={() => {
						setStaffPage(0);
						setStaffSearch(staffSearchInput.trim().slice(0, 80));
					}}
				>
					Search staff
				</button>
			</div>
			<p role="status">{staffLoading ? "Loading staff…" : `${staffCount} staff assignment(s) found`}</p>
			<ul className={styles.list}>
				{staffRows.map((item) => (
					<li key={item.id}>
						<strong>{item.preferred_name || item.full_name}</strong> ·{" "}
						{item.is_active ? "Active" : "Inactive"}
						<p>
							{item.email} · {branches.find((branch) => branch.id === item.location_id)?.name} ·{" "}
							{departments.find((department) => department.id === item.department_id)?.name}
						</p>
						<StaffEditor
							item={item}
							organizationId={organizationId}
							branches={branches}
							departments={departments}
							onChanged={() => changed("staff")}
							onError={setMessage}
						/>
						<button
							disabled={busyId === item.id}
							onClick={() => void toggle("staff", item.id, item.is_active)}
						>
							{item.is_active ? "Deactivate" : "Reactivate"}
						</button>
					</li>
				))}
			</ul>
			{!staffLoading && staffRows.length === 0 && <p>No staff assignments match these filters.</p>}
			<div className={styles.form}>
				<button disabled={staffPage === 0 || staffLoading} onClick={() => setStaffPage((page) => page - 1)}>
					Previous staff page
				</button>
				<span>Page {staffPage + 1}</span>
				<button
					disabled={(staffPage + 1) * 25 >= staffCount || staffLoading}
					onClick={() => setStaffPage((page) => page + 1)}
				>
					Next staff page
				</button>
			</div>
			{message && (
				<p role={messageRole(message)} className={messageRole(message) === "alert" ? styles.error : undefined}>
					{message}
				</p>
			)}
			{blockingVisits.length > 0 && (
				<div>
					<p>Active visits assigned to this host:</p>
					<ul>
						{blockingVisits.map((visit) => (
							<li key={visit.id}>
								{visit.visitor_full_name} · {visitStatusLabel(visit.status)}
							</li>
						))}
					</ul>
					{blockingBranchId && (
						<Link href={`/app?branch=${blockingBranchId}`}>Open this branch’s reception queue</Link>
					)}
				</div>
			)}
		</section>
	);
}

function StaffEditor({
	item,
	organizationId,
	branches,
	departments,
	onChanged,
	onError,
}: {
	item: Staff;
	organizationId: string;
	branches: Branch[];
	departments: Department[];
	onChanged: () => void;
	onError: (message: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const [fullName, setFullName] = useState(item.full_name);
	const [preferredName, setPreferredName] = useState(item.preferred_name ?? "");
	const [email, setEmail] = useState(item.email);
	const [branchId, setBranchId] = useState(item.location_id);
	const [departmentId, setDepartmentId] = useState(item.department_id);
	const [busy, setBusy] = useState(false);
	async function save(event: React.FormEvent) {
		event.preventDefault();
		const details = staffDetailsSchema.safeParse({ full_name: fullName, preferred_name: preferredName, email });
		if (!details.success) {
			onError("Enter a valid staff name and email address.");
			return;
		}
		const supabase = createClient();
		const moving = branchId !== item.location_id || departmentId !== item.department_id;
		if (moving) {
			if (
				details.data.full_name !== item.full_name ||
				details.data.preferred_name !== (item.preferred_name ?? "") ||
				details.data.email !== item.email
			) {
				onError("Save name and email changes first, then move this host.");
				return;
			}
			let preflight;
			try {
				preflight = await withRequestTimeout(
					async (signal) =>
						await supabase
							.from("visits")
							.select("id", { count: "exact", head: true })
							.eq("staff_id", item.id)
							.in("status", [
								"pending_reception_review",
								"pending_host_acknowledgement",
								"host_approved_awaiting_reception",
								"approved_on_site",
							])
							.abortSignal(signal),
					READ_TIMEOUT_MS,
				);
			} catch (cause) {
				onError(cause instanceof RequestError ? cause.message : "Unable to check active visits.");
				return;
			}
			if (preflight.error) {
				onError(postgrestError(preflight.error).message);
				return;
			}
			if (preflight.count) {
				onError(`Resolve ${preflight.count} active visit(s) before moving this host.`);
				return;
			}
			if (
				!window.confirm(
					`Move ${item.full_name} to the selected branch and department? The old assignment will stay in visit history.`,
				)
			)
				return;
			setBusy(true);
			try {
				await invokeFunction("move-staff-assignment", {
					staff_id: item.id,
					location_id: branchId,
					department_id: departmentId,
				});
			} catch (cause) {
				onError(
					cause instanceof RequestError
						? cause.message
						: "Move outcome is unclear. Refresh the directory before retrying.",
				);
				return;
			} finally {
				setBusy(false);
			}
			setOpen(false);
			try {
				onChanged();
			} catch {
				onError("Host moved, but records could not be refreshed. Refresh the directory.");
			}
			return;
		}
		setBusy(true);
		try {
			const { error } = await withRequestTimeout(
				async (signal) =>
					await supabase
						.from("staff")
						.update({
							full_name: details.data.full_name,
							preferred_name: details.data.preferred_name || null,
							email: details.data.email,
						})
						.eq("id", item.id)
						.eq("organization_id", organizationId)
						.abortSignal(signal),
				MUTATION_TIMEOUT_MS,
			);
			if (error) throw postgrestError(error);
			setOpen(false);
			try {
				onChanged();
			} catch {
				onError("Host saved, but records could not be refreshed. Refresh the directory.");
			}
		} catch (cause) {
			onError(
				cause instanceof RequestError ? cause.message : "Save outcome is unclear. Refresh before retrying.",
			);
		} finally {
			setBusy(false);
		}
	}
	return (
		<>
			<button onClick={() => setOpen((value) => !value)}>{open ? "Close editor" : "Edit"}</button>
			{open && (
				<form className={styles.form} onSubmit={(event) => void save(event)}>
					<label>
						Full name{" "}
						<input
							required
							maxLength={120}
							value={fullName}
							onChange={(event) => setFullName(event.target.value)}
						/>
					</label>
					<label>
						Preferred name{" "}
						<input
							maxLength={80}
							value={preferredName}
							onChange={(event) => setPreferredName(event.target.value)}
						/>
					</label>
					<label>
						Email{" "}
						<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
					</label>
					<label>
						Branch{" "}
						<select
							disabled={!item.is_active}
							value={branchId}
							onChange={(event) => setBranchId(event.target.value)}
						>
							{branches
								.filter((branch) => branch.is_active || branch.id === item.location_id)
								.map((branch) => (
									<option key={branch.id} value={branch.id}>
										{branch.name}
									</option>
								))}
						</select>
					</label>
					<label>
						Department{" "}
						<select
							disabled={!item.is_active}
							value={departmentId}
							onChange={(event) => setDepartmentId(event.target.value)}
						>
							{departments
								.filter((department) => department.is_active || department.id === item.department_id)
								.map((department) => (
									<option key={department.id} value={department.id}>
										{department.name}
									</option>
								))}
						</select>
					</label>
					<button disabled={busy}>
						{busy
							? "Saving…"
							: branchId !== item.location_id || departmentId !== item.department_id
								? "Move host"
								: "Save staff member"}
					</button>
				</form>
			)}
		</>
	);
}
