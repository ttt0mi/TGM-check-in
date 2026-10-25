import { notFound, redirect } from "next/navigation";
import { OperatorDashboard } from "@/features/operator/OperatorDashboard";
import { frontendEnabled } from "@/lib/feature-flags";
import { createClient } from "@/lib/supabase/server";

export default async function OperatorPage() {
	if (!frontendEnabled("operator")) notFound();
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
		.select("id,name,timezone,public_slug,is_active,auto_close_enabled,auto_close_local_time,address")
		.eq("organization_id", profile.organization_id)
		.eq("is_active", true)
		.order("name");
	if (branchError) throw branchError;
	const branch = branches?.[0];
	const [visitsResult, departmentsResult, staffResult] = await Promise.all([
		branch
			? supabase
					.from("visits")
					.select("*")
					.eq("location_id", branch.id)
					.order("arrived_at", { ascending: false })
					.limit(100)
			: Promise.resolve({ data: [], error: null }),
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
	if (visitsResult.error) throw visitsResult.error;
	if (departmentsResult.error) throw departmentsResult.error;
	if (staffResult.error) throw staffResult.error;
	return (
		<OperatorDashboard
			organization={{ id: profile.organization_id, name: organization.name }}
			role={profile.role}
			branches={branches ?? []}
			initialVisits={visitsResult.data ?? []}
			departments={departmentsResult.data ?? []}
			staff={staffResult.data ?? []}
		/>
	);
}
