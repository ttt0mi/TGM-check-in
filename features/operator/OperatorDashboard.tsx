"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { AssistedForm } from "./AssistedForm";
import { VisitQueue } from "./VisitQueue";
import { useVisits } from "./useVisits";
import { useAccessWatch } from "./useAccessWatch";
import type { Branch, Department, Staff } from "./types";
import styles from "./operator.module.css";

type Props = {
	organization: { id: string; name: string };
	role: "admin" | "receptionist";
	availableSections: { admin: boolean; analytics: boolean };
	branches: Branch[];
	departments: Department[];
	staff: Staff[];
};

export function OperatorDashboard(props: Props) {
	const [queryClient] = useState(
		() =>
			new QueryClient({
				defaultOptions: {
					queries: { staleTime: 15000, refetchOnWindowFocus: true },
				},
			}),
	);
	return (
		<QueryClientProvider client={queryClient}>
			<DashboardContent {...props} />
		</QueryClientProvider>
	);
}

function DashboardContent({ organization, role, availableSections, branches, departments, staff }: Props) {
	const router = useRouter();
	const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
	const [showAssisted, setShowAssisted] = useState(false);
	const [search, setSearch] = useState("");
	const branch = branches.find((item) => item.id === branchId);
	const access = useAccessWatch({ role, organizationId: organization.id, branchId });
	const visits = useVisits(branchId || null, search);

	async function signOut() {
		await createClient().auth.signOut({ scope: "local" });
		router.replace("/login");
		router.refresh();
	}

	return (
		<main id="main-content" className={styles.page}>
			<header className={styles.header}>
				<div>
					<strong className={styles.brand}>TGM</strong>
					<span>{organization.name}</span>
				</div>
				<nav>
					{role === "admin" && availableSections.admin && <Link href="/app/manage">Manage</Link>}
					{availableSections.analytics && <Link href="/app/analytics">Analytics</Link>}
					<button onClick={() => void signOut()}>Sign out</button>
				</nav>
			</header>
			<div className={styles.content}>
				{access.degraded && (
					<p role="status" className={styles.connection}>
						Access check temporarily unavailable. Existing data may be stale; actions still require server
						approval.
					</p>
				)}
				<div className={styles.heading}>
					<div>
						<p>Reception</p>
						<h1>Visits</h1>
					</div>
					<button onClick={() => setShowAssisted((value) => !value)} disabled={!branch}>
						New assisted check-in
					</button>
				</div>
				{branches.length > 0 ? (
					<>
						<label className={styles.branchPicker}>
							Branch
							{role === "admin" ? (
								<select value={branchId} onChange={(event) => setBranchId(event.target.value)}>
									{branches.map((item) => (
										<option key={item.id} value={item.id}>
											{item.name}
										</option>
									))}
								</select>
							) : (
								<strong>{branch?.name}</strong>
							)}
						</label>
						{showAssisted && branch && (
							<AssistedForm
								branchId={branch.id}
								departments={departments}
								staff={staff.filter((item) => item.location_id === branch.id)}
								onCreated={() => {
									setShowAssisted(false);
									void visits.refresh();
								}}
							/>
						)}
						{branch && (
							<VisitQueue
								key={branch.id}
								queue={visits}
								branch={branch}
								role={role}
								departments={departments}
								staff={staff}
								onSearchChange={setSearch}
							/>
						)}
					</>
				) : (
					<p>
						No active branch is available.{" "}
						{role === "admin" ? "Create one in Manage." : "Ask an administrator for an assignment."}
					</p>
				)}
			</div>
		</main>
	);
}
