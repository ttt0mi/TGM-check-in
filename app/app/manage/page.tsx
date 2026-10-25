import { notFound, redirect } from "next/navigation";
import { frontendEnabled } from "@/lib/feature-flags";
import { createClient } from "@/lib/supabase/server";
import { Management } from "@/features/admin/Management";
import { Unavailable } from "@/features/shared/Unavailable";

export default async function ManagePage() {
	if (!frontendEnabled("admin"))
		return (
			<Unavailable title="Management is unavailable" detail="Please contact your organization administrator." />
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
	if (!profile?.is_active || profile.role !== "admin" || !profile.organization_id) notFound();
	const [org, branches, departments, staff, privacy] = await Promise.all([
		supabase.from("organizations").select("id,name,is_active").eq("id", profile.organization_id).single(),
		supabase
			.from("locations")
			.select("id,name,timezone,public_slug,is_active,auto_close_enabled,auto_close_local_time,address")
			.eq("organization_id", profile.organization_id)
			.order("name"),
		supabase
			.from("departments")
			.select("id,name,is_active")
			.eq("organization_id", profile.organization_id)
			.order("name"),
		supabase
			.from("staff")
			.select("id,full_name,preferred_name,department_id,location_id,email,is_active")
			.eq("organization_id", profile.organization_id)
			.order("full_name"),
		supabase
			.from("organization_privacy_notices")
			.select("notice_copy,policy_url,approved_at,approved_by")
			.eq("organization_id", profile.organization_id)
			.maybeSingle(),
	]);
	if (org.error || branches.error || departments.error || staff.error || privacy.error) {
		throw org.error || branches.error || departments.error || staff.error || privacy.error;
	}
	if (!org.data?.is_active) redirect("/suspended");
	return (
		<Management
			organization={org.data}
			privacyNotice={privacy.data}
			branches={branches.data ?? []}
			departments={departments.data ?? []}
			staff={staff.data ?? []}
		/>
	);
}
