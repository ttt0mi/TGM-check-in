"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { AssistedForm } from "./AssistedForm";
import { VisitActions } from "./VisitActions";
import { VisitDetails } from "./VisitDetails";
import { useVisits } from "./useVisits";
import { useAccessWatch } from "./useAccessWatch";
import type { Branch, Department, Staff, Visit } from "./types";
import styles from "./operator.module.css";

type Props = {
	organization: { id: string; name: string };
	role: "admin" | "receptionist";
	availableSections: { admin: boolean; analytics: boolean };
	branches: Branch[];
	initialVisits: Visit[];
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

function DashboardContent({
	organization,
	role,
	availableSections,
	branches,
	initialVisits,
	departments,
	staff,
}: Props) {
	const router = useRouter();
	const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
	const [showAssisted, setShowAssisted] = useState(false);
	const [expandedVisitId, setExpandedVisitId] = useState<string | null>(null);
	const branch = branches.find((item) => item.id === branchId);
	useAccessWatch({ role, organizationId: organization.id, branchId });
	const visits = useVisits(branchId || null, branches[0]?.id ?? null, initialVisits);

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
									void visits.refetch();
								}}
							/>
						)}
						{visits.isPending ? (
							<p>Loading visits…</p>
						) : visits.error ? (
							<p role="alert">
								Unable to load visits. <button onClick={() => void visits.refetch()}>Retry</button>
							</p>
						) : (
							<div className={styles.visitList}>
								{visits.data?.length ? (
									visits.data.map((visit) => (
										<article key={visit.id} className={styles.visit}>
											<div>
												<strong>
													{visit.visitor_preferred_name || visit.visitor_full_name}
												</strong>
												<span>{visit.status.replaceAll("_", " ")}</span>
											</div>
											<p>
												{visit.visit_type} ·{" "}
												{new Intl.DateTimeFormat(undefined, {
													timeZone: branch?.timezone,
													dateStyle: "medium",
													timeStyle: "short",
												}).format(new Date(visit.arrived_at))}
											</p>
											<p>{visit.purpose}</p>
											<VisitActions visit={visit} role={role} />
											<button
												className={styles.detailsButton}
												onClick={() =>
													setExpandedVisitId(expandedVisitId === visit.id ? null : visit.id)
												}
											>
												{expandedVisitId === visit.id ? "Hide details" : "Details and history"}
											</button>
											{expandedVisitId === visit.id && (
												<VisitDetails
													visit={visit}
													departments={departments}
													staff={staff.filter(
														(item) => item.location_id === visit.location_id,
													)}
													timezone={branch?.timezone ?? "UTC"}
												/>
											)}
										</article>
									))
								) : (
									<p>No visits for this branch yet.</p>
								)}
							</div>
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
