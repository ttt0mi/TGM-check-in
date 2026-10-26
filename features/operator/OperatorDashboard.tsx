"use client";

import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { useOnlineStatus } from "@/lib/hooks/use-online-status";
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
	initialBranchId: string;
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
	branches: initialBranches,
	initialBranchId,
	departments: initialDepartments,
	staff: initialStaff,
}: Props) {
	const router = useRouter();
	const directory = useQuery({
		queryKey: ["operator-directory", organization.id],
		initialData: { branches: initialBranches, departments: initialDepartments, staff: initialStaff },
		staleTime: 0,
		refetchOnMount: "always",
		queryFn: async () => {
			const supabase = createClient();
			const [branchResult, departmentResult, staffResult] = await Promise.all([
				supabase
					.from("locations")
					.select(
						"id,name,timezone,public_slug,is_active,auto_close_enabled,auto_close_local_time,address,reception_overdue_minutes,host_overdue_minutes,admission_overdue_minutes",
					)
					.eq("organization_id", organization.id)
					.eq("is_active", true)
					.order("name"),
				supabase
					.from("departments")
					.select("id,name,is_active")
					.eq("organization_id", organization.id)
					.eq("is_active", true)
					.order("name"),
				supabase
					.from("staff")
					.select("id,full_name,preferred_name,department_id,location_id,email,is_active")
					.eq("organization_id", organization.id)
					.eq("is_active", true)
					.order("full_name"),
			]);
			if (branchResult.error) throw branchResult.error;
			if (departmentResult.error) throw departmentResult.error;
			if (staffResult.error) throw staffResult.error;
			return {
				branches: branchResult.data ?? [],
				departments: departmentResult.data ?? [],
				staff: staffResult.data ?? [],
			};
		},
	});
	const { branches, departments, staff } = directory.data;
	const [selectedBranchId, setBranchId] = useState(initialBranchId);
	const branchId = branches.some((item) => item.id === selectedBranchId) ? selectedBranchId : (branches[0]?.id ?? "");
	const [assistedBranch, setAssistedBranch] = useState<Branch | null>(null);
	const showAssisted = assistedBranch !== null;
	const [search, setSearch] = useState("");
	const online = useOnlineStatus();
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
				{!online && (
					<p role="status" className={styles.connection}>
						You appear to be offline. Existing visits remain visible; retry actions after reconnecting.
					</p>
				)}
				{directory.error && (
					<p role="status" className={styles.connection}>
						Branch and host choices may be out of date.{" "}
						<button onClick={() => void directory.refetch()}>Retry refresh</button>
					</p>
				)}
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
					<button onClick={() => setAssistedBranch(branch ?? null)} disabled={!branch || showAssisted}>
						{showAssisted ? "Assisted form open" : "New assisted check-in"}
					</button>
				</div>
				{branches.length > 0 ? (
					<>
						<label className={styles.branchPicker}>
							Branch
							{role === "admin" ? (
								<>
									<select
										value={branchId}
										onChange={(event) => setBranchId(event.target.value)}
										disabled={showAssisted}
									>
										{branches.map((item) => (
											<option key={item.id} value={item.id}>
												{item.name}
											</option>
										))}
									</select>
									{showAssisted && <small>Close the assisted form before switching branches.</small>}
								</>
							) : (
								<strong>{branch?.name}</strong>
							)}
						</label>
						{assistedBranch && (
							<AssistedForm
								key={assistedBranch.id}
								branchId={assistedBranch.id}
								branchName={assistedBranch.name}
								departments={departments}
								staff={staff.filter((item) => item.location_id === assistedBranch.id)}
								onCreated={() => {
									setAssistedBranch(null);
									visits.refreshSoon();
								}}
								onCancel={() => setAssistedBranch(null)}
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
						{role === "admin" ? (
							<Link href="/app/manage?tab=branches">Create a branch in Manage.</Link>
						) : (
							"Ask an administrator for an assignment."
						)}
					</p>
				)}
			</div>
		</main>
	);
}
