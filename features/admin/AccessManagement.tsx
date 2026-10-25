"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import type { Branch } from "@/features/operator/types";
import styles from "./admin.module.css";

type Operator = {
	user_id: string;
	email: string;
	role: "admin" | "receptionist";
	is_active: boolean;
	location_id: string | null;
};
type Invitation = {
	id: string;
	email: string;
	role: "admin" | "receptionist";
	location_id: string | null;
	expires_at: string;
	accepted_at: string | null;
	revoked_at: string | null;
	delivery_status: "pending" | "sent" | "failed" | "unknown";
	resend_count: number;
};

export function AccessManagement({ branches }: { branches: Branch[] }) {
	const [operators, setOperators] = useState<Operator[]>([]);
	const [invitations, setInvitations] = useState<Invitation[]>([]);
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<"admin" | "receptionist">("receptionist");
	const [branchId, setBranchId] = useState(branches.find((item) => item.is_active)?.id ?? "");
	const [message, setMessage] = useState("");
	const [busy, setBusy] = useState(false);

	const refresh = useCallback(async () => {
		const { data, error } = await createClient().functions.invoke("operator-directory", { method: "GET" });
		if (error) throw error;
		setOperators(data.operators as Operator[]);
		setInvitations(data.invitations as Invitation[]);
	}, []);

	useEffect(() => {
		queueMicrotask(() => {
			void refresh().catch((cause: unknown) =>
				setMessage(cause instanceof Error ? cause.message : "Unable to load operators"),
			);
		});
	}, [refresh]);

	async function invite(event: React.FormEvent) {
		event.preventDefault();
		setBusy(true);
		setMessage("");
		const { error } = await createClient().functions.invoke("invite-operator", {
			body: {
				email: email.trim(),
				role,
				location_id: role === "receptionist" ? branchId : null,
			},
		});
		setBusy(false);
		setMessage(error ? error.message : "Invitation email sent.");
		if (!error) setEmail("");
		await refresh().catch(() => {});
	}
	async function invitationAction(id: string, action: "resend" | "revoke") {
		setBusy(true);
		setMessage("");
		const { error } = await createClient().functions.invoke("manage-operator-invitation", {
			body: { invitation_id: id, action },
		});
		setBusy(false);
		setMessage(error ? error.message : action === "revoke" ? "Invitation revoked." : "Invitation resent.");
		await refresh().catch(() => {});
	}
	async function operatorAction(
		operator: Operator,
		action: "assign" | "deactivate",
		newRole?: "admin" | "receptionist",
		newBranchId?: string,
	) {
		setBusy(true);
		setMessage("");
		const { error } = await createClient().functions.invoke("manage-operator", {
			body: {
				user_id: operator.user_id,
				action,
				...(action === "assign"
					? {
							role: newRole,
							location_id: newRole === "receptionist" ? newBranchId : null,
						}
					: {}),
			},
		});
		setBusy(false);
		setMessage(error ? error.message : "Operator updated.");
		await refresh().catch(() => {});
	}

	return (
		<section className={styles.section}>
			<h2>Operator access</h2>
			<h3>Invite an operator</h3>
			<form className={styles.form} onSubmit={(event) => void invite(event)}>
				<label>
					Email{" "}
					<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
				</label>
				<label>
					Role{" "}
					<select value={role} onChange={(event) => setRole(event.target.value as typeof role)}>
						<option value="receptionist">Receptionist</option>
						<option value="admin">Admin</option>
					</select>
				</label>
				{role === "receptionist" && (
					<label>
						Branch{" "}
						<select required value={branchId} onChange={(event) => setBranchId(event.target.value)}>
							{branches
								.filter((item) => item.is_active)
								.map((item) => (
									<option key={item.id} value={item.id}>
										{item.name}
									</option>
								))}
						</select>
					</label>
				)}
				<button disabled={busy}>Send invitation</button>
			</form>
			<h3>Pending invitations</h3>
			<ul className={styles.list}>
				{invitations
					.filter((item) => !item.accepted_at && !item.revoked_at)
					.map((item) => (
						<li key={item.id}>
							<strong>{item.email}</strong> · {item.role}
							<p>
								Delivery: {item.delivery_status} · Expires {new Date(item.expires_at).toLocaleString()}{" "}
								· Resends: {item.resend_count}
							</p>
							<button disabled={busy} onClick={() => void invitationAction(item.id, "resend")}>
								Resend
							</button>
							<button disabled={busy} onClick={() => void invitationAction(item.id, "revoke")}>
								Revoke
							</button>
						</li>
					))}
			</ul>
			<h3>Operators</h3>
			<ul className={styles.list}>
				{operators.map((item) => (
					<OperatorRow
						key={item.user_id}
						operator={item}
						branches={branches}
						busy={busy}
						onAction={operatorAction}
					/>
				))}
			</ul>
			{message && <p role="status">{message}</p>}
		</section>
	);
}

function OperatorRow({
	operator,
	branches,
	busy,
	onAction,
}: {
	operator: Operator;
	branches: Branch[];
	busy: boolean;
	onAction: (
		operator: Operator,
		action: "assign" | "deactivate",
		role?: "admin" | "receptionist",
		branchId?: string,
	) => Promise<void>;
}) {
	const [role, setRole] = useState(operator.role);
	const [branchId, setBranchId] = useState(operator.location_id ?? branches.find((item) => item.is_active)?.id ?? "");
	return (
		<li>
			<strong>{operator.email}</strong> · {operator.is_active ? "Active" : "Inactive"}
			<div className={styles.form}>
				<label>
					Role{" "}
					<select value={role} onChange={(event) => setRole(event.target.value as typeof role)}>
						<option value="admin">Admin</option>
						<option value="receptionist">Receptionist</option>
					</select>
				</label>
				{role === "receptionist" && (
					<label>
						Branch{" "}
						<select value={branchId} onChange={(event) => setBranchId(event.target.value)}>
							{branches
								.filter((item) => item.is_active)
								.map((item) => (
									<option key={item.id} value={item.id}>
										{item.name}
									</option>
								))}
						</select>
					</label>
				)}
				<button
					disabled={busy || (role === "receptionist" && !branchId)}
					onClick={() => void onAction(operator, "assign", role, branchId)}
				>
					Save access
				</button>
				{operator.is_active && (
					<button disabled={busy} onClick={() => void onAction(operator, "deactivate")}>
						Deactivate
					</button>
				)}
			</div>
		</li>
	);
}
