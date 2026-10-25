"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import type { Branch, Department, Staff } from "@/features/operator/types";
import styles from "./admin.module.css";

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
	const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
	const [departmentId, setDepartmentId] = useState(departments[0]?.id ?? "");
	const [message, setMessage] = useState("");

	async function addDepartment(event: React.FormEvent) {
		event.preventDefault();
		setMessage("");
		const name = departmentName.trim();
		if (!name || name.length > 120) {
			setMessage("Enter a valid department name.");
			return;
		}
		const { error } = await createClient().from("departments").insert({ organization_id: organizationId, name });
		if (error) {
			setMessage(error.message);
			return;
		}
		setDepartmentName("");
		onChanged();
	}
	async function addStaff(event: React.FormEvent) {
		event.preventDefault();
		setMessage("");
		if (!branchId || !departmentId) {
			setMessage("Choose a branch and department.");
			return;
		}
		const { error } = await createClient()
			.from("staff")
			.insert({
				organization_id: organizationId,
				location_id: branchId,
				department_id: departmentId,
				full_name: fullName.trim(),
				preferred_name: preferredName.trim() || null,
				email: email.trim().toLowerCase(),
			});
		if (error) {
			setMessage(error.message);
			return;
		}
		setFullName("");
		setPreferredName("");
		setEmail("");
		onChanged();
	}
	async function toggle(table: "departments" | "staff", id: string, isActive: boolean) {
		const { error } =
			table === "departments"
				? await createClient()
						.from("departments")
						.update({ is_active: !isActive })
						.eq("id", id)
						.eq("organization_id", organizationId)
				: await createClient()
						.from("staff")
						.update({ is_active: !isActive })
						.eq("id", id)
						.eq("organization_id", organizationId);
		if (error) {
			setMessage(error.message);
			return;
		}
		onChanged();
	}
	async function renameDepartment(item: Department) {
		const name = window.prompt("Department name", item.name)?.trim();
		if (!name || name === item.name) return;
		const { error } = await createClient()
			.from("departments")
			.update({ name })
			.eq("id", item.id)
			.eq("organization_id", organizationId);
		if (error) {
			setMessage(error.message);
			return;
		}
		onChanged();
	}
	return (
		<section className={styles.section}>
			<h2>Host directory</h2>
			<h3>Departments</h3>
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
				<button>Add department</button>
			</form>
			<ul className={styles.list}>
				{departments.map((item) => (
					<li key={item.id}>
						<strong>{item.name}</strong> · {item.is_active ? "Active" : "Inactive"}
						<br />
						<button onClick={() => void renameDepartment(item)}>Rename</button>
						<button onClick={() => void toggle("departments", item.id, item.is_active)}>
							{item.is_active ? "Deactivate" : "Reactivate"}
						</button>
					</li>
				))}
			</ul>
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
				<button>Add staff member</button>
			</form>
			<ul className={styles.list}>
				{staff.map((item) => (
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
							onChanged={onChanged}
							onError={setMessage}
						/>
						<button onClick={() => void toggle("staff", item.id, item.is_active)}>
							{item.is_active ? "Deactivate" : "Reactivate"}
						</button>
					</li>
				))}
			</ul>
			{message && (
				<p role="alert" className={styles.error}>
					{message}
				</p>
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
	async function save(event: React.FormEvent) {
		event.preventDefault();
		const { error } = await createClient()
			.from("staff")
			.update({
				full_name: fullName.trim(),
				preferred_name: preferredName.trim() || null,
				email: email.trim().toLowerCase(),
				location_id: branchId,
				department_id: departmentId,
			})
			.eq("id", item.id)
			.eq("organization_id", organizationId);
		if (error) {
			onError(error.message);
			return;
		}
		setOpen(false);
		onChanged();
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
						<select value={branchId} onChange={(event) => setBranchId(event.target.value)}>
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
						<select value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
							{departments
								.filter((department) => department.is_active || department.id === item.department_id)
								.map((department) => (
									<option key={department.id} value={department.id}>
										{department.name}
									</option>
								))}
						</select>
					</label>
					<button>Save staff member</button>
				</form>
			)}
		</>
	);
}
