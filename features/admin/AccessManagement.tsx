"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { invokeFunction } from "@/lib/http/invoke-function";
import { RequestError } from "@/lib/http/request-error";
import { READ_TIMEOUT_MS } from "@/lib/http/timeout";
import type { Branch } from "@/features/operator/types";
import { messageRole } from "@/features/shared/message-role";
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
	created_at: string;
	inviter_email: string | null;
	last_attempt_at: string | null;
};
type InvitationCursor = { created_at: string; id: string };
type OperatorCursor = { email: string; id: string };
type DirectoryResponse = {
	operators: Operator[] | null;
	operator_next_cursor: OperatorCursor | null;
	invitations: Invitation[] | null;
	next_cursor: InvitationCursor | null;
};
const errorMessage = (cause: unknown) =>
	cause instanceof RequestError ? cause.message : "The outcome is unclear. Refresh before retrying.";

function invitationState(item: Invitation, asOf: number) {
	if (item.accepted_at) return "Accepted";
	if (item.revoked_at) return "Revoked";
	if (new Date(item.expires_at).getTime() <= asOf) return "Expired";
	return "Pending";
}

export function AccessManagement({ branches }: { branches: Branch[] }) {
	const [operators, setOperators] = useState<Operator[]>([]);
	const [invitations, setInvitations] = useState<Invitation[]>([]);
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<"admin" | "receptionist">("receptionist");
	const [branchId, setBranchId] = useState(branches.find((item) => item.is_active)?.id ?? "");
	const [message, setMessage] = useState("");
	const [busyKeys, setBusyKeys] = useState<Set<string>>(() => new Set());
	const setBusy = (key: string, busy: boolean) =>
		setBusyKeys((current) => {
			const next = new Set(current);
			if (busy) next.add(key);
			else next.delete(key);
			return next;
		});
	const [loading, setLoading] = useState(true);
	const [searchInput, setSearchInput] = useState("");
	const [search, setSearch] = useState("");
	const [nextCursor, setNextCursor] = useState<InvitationCursor | null>(null);
	const [asOf, setAsOf] = useState(0);
	const [operatorSearchInput, setOperatorSearchInput] = useState("");
	const [operatorSearch, setOperatorSearch] = useState("");
	const [operatorNextCursor, setOperatorNextCursor] = useState<OperatorCursor | null>(null);
	const requestId = useRef(0);

	const refresh = useCallback(async () => {
		const currentRequest = ++requestId.current;
		const data = await invokeFunction<DirectoryResponse>(
			"operator-directory",
			{ search, operator_search: operatorSearch },
			READ_TIMEOUT_MS,
		);
		if (currentRequest !== requestId.current) return;
		setOperators(data.operators ?? []);
		setOperatorNextCursor(data.operator_next_cursor);
		setInvitations(data.invitations ?? []);
		setNextCursor(data.next_cursor);
		setAsOf(Date.now());
		setLoading(false);
	}, [search, operatorSearch]);
	async function loadMoreOperators() {
		if (!operatorNextCursor) return;
		const currentRequest = requestId.current;
		setBusy("more-operators", true);
		try {
			const data = await invokeFunction<DirectoryResponse>(
				"operator-directory",
				{
					operator_search: operatorSearch,
					operator_after_email: operatorNextCursor.email,
					operator_after_id: operatorNextCursor.id,
				},
				READ_TIMEOUT_MS,
			);
			if (currentRequest !== requestId.current) return;
			setOperators((current) => [...current, ...(data.operators ?? [])]);
			setOperatorNextCursor(data.operator_next_cursor);
		} catch (cause) {
			setMessage(errorMessage(cause));
		} finally {
			setBusy("more-operators", false);
		}
	}
	async function loadMore() {
		if (!nextCursor) return;
		const currentRequest = requestId.current;
		setBusy("more", true);
		try {
			const data = await invokeFunction<DirectoryResponse>(
				"operator-directory",
				{ search, after_created_at: nextCursor.created_at, after_id: nextCursor.id },
				READ_TIMEOUT_MS,
			);
			if (currentRequest !== requestId.current) return;
			setInvitations((current) => [...current, ...(data.invitations ?? [])]);
			setNextCursor(data.next_cursor);
			setAsOf(Date.now());
		} catch (cause) {
			setMessage(errorMessage(cause));
		} finally {
			setBusy("more", false);
		}
	}

	useEffect(() => {
		queueMicrotask(() => {
			void refresh().catch(() => {
				setLoading(false);
				setMessage("Unable to load access records. Please retry.");
			});
		});
	}, [refresh]);

	async function invite(event: React.FormEvent) {
		event.preventDefault();
		setBusy("invite", true);
		setMessage("");
		let failure: string | null = null;
		try {
			await invokeFunction("invite-operator", {
				email: email.trim(),
				role,
				location_id: role === "receptionist" ? branchId : null,
			});
			setEmail("");
			setMessage("Invitation request recorded.");
		} catch (cause) {
			failure = errorMessage(cause);
			setMessage(failure);
		} finally {
			setBusy("invite", false);
		}
		await refresh().catch(() =>
			setMessage(
				failure
					? "Invitation result is unclear and records could not be refreshed. Please retry refresh."
					: "Invitation recorded, but records could not be refreshed. Please retry refresh.",
			),
		);
	}
	async function invitationAction(item: Invitation, action: "resend" | "revoke") {
		if (
			action === "revoke" &&
			!window.confirm(`Revoke the invitation for ${item.email}? The link will stop working.`)
		)
			return;
		if (
			action === "resend" &&
			item.delivery_status === "unknown" &&
			!window.confirm(
				`Delivery for ${item.email} is unknown; the previous email may have arrived. Review it before sending another link. Continue?`,
			)
		)
			return;
		setBusy(item.id, true);
		setMessage("");
		let failure: string | null = null;
		try {
			await invokeFunction("manage-operator-invitation", { invitation_id: item.id, action });
			setMessage(action === "revoke" ? "Invitation revoked." : "Invitation resend requested.");
		} catch (cause) {
			failure = errorMessage(cause);
			setMessage(failure);
		} finally {
			setBusy(item.id, false);
		}
		await refresh().catch(() =>
			setMessage(
				failure
					? "Invitation result is unclear and records could not be refreshed."
					: "Invitation updated, but records could not be refreshed. Please retry refresh.",
			),
		);
	}
	async function operatorAction(
		operator: Operator,
		action: "assign" | "deactivate",
		newRole?: "admin" | "receptionist",
		newBranchId?: string,
	) {
		if (action === "deactivate" && !window.confirm(`Deactivate ${operator.email}? Their access will end.`)) return;
		setBusy(operator.user_id, true);
		setMessage("");
		let failure: string | null = null;
		try {
			await invokeFunction("manage-operator", {
				user_id: operator.user_id,
				action,
				...(action === "assign"
					? {
							role: newRole,
							location_id: newRole === "receptionist" ? newBranchId : null,
						}
					: {}),
			});
			setMessage("Operator updated.");
		} catch (cause) {
			failure = errorMessage(cause);
			setMessage(failure);
		} finally {
			setBusy(operator.user_id, false);
		}
		await refresh().catch(() =>
			setMessage(
				failure
					? "Operator result is unclear and records could not be refreshed."
					: "Operator updated, but records could not be refreshed. Please retry refresh.",
			),
		);
	}

	return (
		<section className={styles.section}>
			<h2>Operator access</h2>
			{loading && <p role="status">Loading operator and invitation records…</p>}
			{!loading &&
				(message.includes("could not be refreshed") || message.includes("Unable to load access records")) && (
					<button
						onClick={() =>
							void refresh().catch(() => setMessage("Unable to refresh access records. Please retry."))
						}
					>
						Retry refresh
					</button>
				)}
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
				<button disabled={busyKeys.has("invite")}>
					{busyKeys.has("invite") ? "Sending…" : "Send invitation"}
				</button>
			</form>
			<h3>Invitation history</h3>
			<div className={styles.form}>
				<label>
					Search invited email{" "}
					<input
						type="search"
						maxLength={120}
						value={searchInput}
						onChange={(event) => setSearchInput(event.target.value)}
					/>
				</label>
				<button
					onClick={() => {
						setLoading(true);
						if (search === searchInput.trim())
							void refresh().catch(() => {
								setLoading(false);
								setMessage("Unable to refresh invitation history.");
							});
						else setSearch(searchInput.trim());
					}}
				>
					Search invitations
				</button>
			</div>
			<ul className={styles.list}>
				{invitations.map((item) => (
					<li key={item.id}>
						<strong>{item.email}</strong> · {invitationState(item, asOf)} · {item.role}
						<p>
							{item.location_id
								? (branches.find((branch) => branch.id === item.location_id)?.name ?? "Previous branch")
								: "All branches"}
						</p>
						<p>
							Created {new Date(item.created_at).toLocaleString()} · Expires{" "}
							{new Date(item.expires_at).toLocaleString()} · Resends: {item.resend_count}
						</p>
						<p>
							Invited by {item.inviter_email ?? "an administrator"} · Delivery: {item.delivery_status} ·
							Last attempt:{" "}
							{item.last_attempt_at ? new Date(item.last_attempt_at).toLocaleString() : "Not recorded"}
						</p>
						{item.delivery_status === "unknown" && (
							<p>Delivery may have succeeded. Review before resending.</p>
						)}
						{!item.accepted_at && !item.revoked_at && (
							<>
								<button
									disabled={busyKeys.has(item.id)}
									onClick={() => void invitationAction(item, "resend")}
								>
									Resend
								</button>
								<button
									disabled={busyKeys.has(item.id)}
									onClick={() => void invitationAction(item, "revoke")}
								>
									Revoke
								</button>
							</>
						)}
					</li>
				))}
			</ul>
			{!loading && invitations.length === 0 && <p>No invitations match this search.</p>}
			{nextCursor && (
				<button disabled={busyKeys.has("more")} onClick={() => void loadMore()}>
					{busyKeys.has("more") ? "Loading…" : "Load more invitations"}
				</button>
			)}
			<h3>Operators</h3>
			<label>
				Search operators{" "}
				<input
					type="search"
					value={operatorSearchInput}
					maxLength={120}
					onChange={(event) => setOperatorSearchInput(event.target.value)}
				/>
			</label>
			<button
				onClick={() =>
					operatorSearchInput.trim() === operatorSearch
						? void refresh()
						: setOperatorSearch(operatorSearchInput.trim())
				}
			>
				Search operators
			</button>
			<p>
				{operators.length} operator(s) loaded{operatorNextCursor ? "; more available" : ""}
			</p>
			<ul className={styles.list}>
				{operators.map((item) => (
					<OperatorRow
						key={`${item.user_id}-${item.role}-${item.location_id}-${item.is_active}`}
						operator={item}
						branches={branches}
						busy={busyKeys.has(item.user_id)}
						onAction={operatorAction}
					/>
				))}
			</ul>
			{!loading && operators.length === 0 && <p>No operators match this search.</p>}
			{operatorNextCursor && (
				<button disabled={busyKeys.has("more-operators")} onClick={() => void loadMoreOperators()}>
					{busyKeys.has("more-operators") ? "Loading…" : "Load more operators"}
				</button>
			)}
			{message && <p role={messageRole(message)}>{message}</p>}
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
	const dirty =
		!operator.is_active ||
		role !== operator.role ||
		(role === "receptionist" ? branchId !== operator.location_id : operator.location_id !== null);
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
					disabled={busy || !dirty || (role === "receptionist" && !branchId)}
					onClick={() => void onAction(operator, "assign", role, branchId)}
				>
					Save access
				</button>
				{operator.is_active && dirty && (
					<button
						type="button"
						disabled={busy}
						onClick={() => {
							if (!window.confirm(`Discard access changes for ${operator.email}?`)) return;
							setRole(operator.role);
							setBranchId(operator.location_id ?? branches.find((item) => item.is_active)?.id ?? "");
						}}
					>
						Reset changes
					</button>
				)}
				{operator.is_active && (
					<button disabled={busy} onClick={() => void onAction(operator, "deactivate")}>
						Deactivate
					</button>
				)}
			</div>
		</li>
	);
}
