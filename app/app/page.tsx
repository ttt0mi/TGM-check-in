import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { OperatorDashboard } from "@/features/operator/OperatorDashboard";
import { Unavailable } from "@/features/shared/Unavailable";
import { frontendEnabled } from "@/lib/feature-flags";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Reception queue", description: "Manage visits at your reception desk." };

export default async function OperatorPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
	if (!frontendEnabled("operator"))
		return (
			<Unavailable title="Reception is unavailable" detail="Please contact your organization administrator." />
		);
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) redirect("/login");
	const { data: profile } = await supabase
		.from("operator_profiles")
		.select("role,is_active,organization_id")
		.eq("user_id", user.id)
		.maybeSingle();
	if (!profile?.is_active || !profile.organization_id || !profile.role) redirect("/start");
	const { data: organization } = await supabase
		.from("organizations")
		.select("name,is_active")
		.eq("id", profile.organization_id)
		.maybeSingle();
	if (!organization?.is_active) redirect("/suspended");
	const { data: branches, error: branchError } = await supabase
		.from("locations")
		.select(
			"id,name,timezone,public_slug,is_active,auto_close_enabled,auto_close_local_time,address,reception_overdue_minutes,host_overdue_minutes,admission_overdue_minutes",
		)
		.eq("organization_id", profile.organization_id)
		.eq("is_active", true)
		.order("name");
	if (branchError) throw branchError;
	const requestedBranch = (await searchParams).branch;
	const initialBranchId = branches?.find((item) => item.id === requestedBranch)?.id ?? branches?.[0]?.id ?? "";
	const [departmentsResult, staffResult] = await Promise.all([
		supabase
			.from("departments")
			.select("id,name,is_active")
			.eq("organization_id", profile.organization_id)
			.eq("is_active", true)
			.order("name"),
		supabase
			.from("staff")
			.select("id,full_name,preferred_name,department_id,location_id,email,is_active")
			.eq("organization_id", profile.organization_id)
			.eq("is_active", true)
			.order("full_name"),
	]);
	if (departmentsResult.error) throw departmentsResult.error;
	if (staffResult.error) throw staffResult.error;
	return (
		<OperatorDashboard
			organization={{ id: profile.organization_id, name: organization.name }}
			role={profile.role}
			availableSections={{ admin: frontendEnabled("admin"), analytics: frontendEnabled("analytics") }}
			branches={branches ?? []}
			initialBranchId={initialBranchId}
			departments={departmentsResult.data ?? []}
			staff={staffResult.data ?? []}
		/>
	);
}
