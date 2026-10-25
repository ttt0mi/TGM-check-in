import { redirect } from "next/navigation";
import { AnalyticsDashboard } from "@/features/analytics/AnalyticsDashboard";
import { Unavailable } from "@/features/shared/Unavailable";
import { frontendEnabled } from "@/lib/feature-flags";
import { createClient } from "@/lib/supabase/server";

export default async function AnalyticsPage() {
	if (!frontendEnabled("analytics"))
		return (
			<Unavailable title="Analytics is unavailable" detail="Please return to reception and try again later." />
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
	const { data: organization, error: organizationError } = await supabase
		.from("organizations")
		.select("is_active")
		.eq("id", profile.organization_id)
		.maybeSingle();
	if (organizationError || !organization?.is_active) redirect("/suspended");
	let assignedBranchId: string | null = null;
	if (profile.role === "receptionist") {
		const { data: assignment, error: assignmentError } = await supabase
			.from("receptionist_location_assignments")
			.select("location_id")
			.eq("user_id", user.id)
			.eq("organization_id", profile.organization_id)
			.maybeSingle();
		if (assignmentError || !assignment?.location_id)
			return (
				<Unavailable
					title="Reports are unavailable"
					detail="Your branch assignment is unavailable. Contact an administrator."
				/>
			);
		assignedBranchId = assignment.location_id;
	}
	let branchQuery = supabase
		.from("locations")
		.select("id,name,timezone")
		.eq("organization_id", profile.organization_id)
		.order("name");
	if (assignedBranchId) branchQuery = branchQuery.eq("id", assignedBranchId).eq("is_active", true);
	const { data: branches, error } = await branchQuery;
	if (error) throw error;
	if (profile.role === "receptionist" && !branches?.length)
		return (
			<Unavailable title="Reports are unavailable" detail="Your branch is inactive. Contact an administrator." />
		);
	return <AnalyticsDashboard role={profile.role} branches={branches ?? []} />;
}
