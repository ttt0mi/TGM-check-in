import { redirect } from "next/navigation";
import { frontendEnabled } from "@/lib/feature-flags";
import { createClient } from "@/lib/supabase/server";
import { Management } from "@/features/admin/Management";
import { Unavailable } from "@/features/shared/Unavailable";

export const metadata = { title: "Administration", description: "Manage branches, staff and access." };

export default async function ManagePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
	const requestedTab = (await searchParams).tab;
	const tab =
		requestedTab === "branches" || requestedTab === "directory" || requestedTab === "access"
			? requestedTab
			: "organization";
	if (!frontendEnabled("admin"))
		return (
			<Unavailable title="Management is unavailable" detail="Please contact your organization administrator." />
		);
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) redirect("/login");
	const { data: profile, error: profileError } = await supabase
		.from("operator_profiles")
		.select("role,is_active,organization_id")
		.eq("user_id", user.id)
		.maybeSingle();
	if (profileError) throw profileError;
	if (!profile?.is_active) redirect("/suspended");
	if (!profile.organization_id || profile.role !== "admin")
		return <Unavailable title="Administrator access required" detail="Ask an organization administrator to grant access." />;
	const org = await supabase.from("organizations").select("id,name,is_active").eq("id", profile.organization_id).maybeSingle();
	if (org.error) throw org.error;
	if (!org.data?.is_active) redirect("/suspended");
	const [branches, departments, staff, privacy] = await Promise.all([
		tab !== "organization" ? supabase
			.from("locations")
			.select(
				"id,name,timezone,public_slug,is_active,auto_close_enabled,auto_close_local_time,address,reception_overdue_minutes,host_overdue_minutes,admission_overdue_minutes",
			)
			.eq("organization_id", profile.organization_id)
			.order("name") : null,
		tab === "directory" ? supabase
			.from("departments")
			.select("id,name,is_active")
			.eq("organization_id", profile.organization_id)
			.order("name") : null,
		tab === "directory" ? supabase
			.from("staff")
			.select("id,full_name,preferred_name,department_id,location_id,email,is_active")
			.eq("organization_id", profile.organization_id)
			.order("full_name")
			.order("id")
			.range(0, 24) : null,
		tab === "organization" ? supabase
			.from("organization_privacy_notices")
			.select("notice_copy,policy_url,approved_at,approved_by")
			.eq("organization_id", profile.organization_id)
			.maybeSingle() : null,
	]);
	if (branches?.error || departments?.error || staff?.error || privacy?.error) {
		throw branches?.error || departments?.error || staff?.error || privacy?.error;
	}
	return (
		<Management
			tab={tab}
			organization={org.data}
			privacyNotice={privacy?.data ?? null}
			branches={branches?.data ?? []}
			departments={departments?.data ?? []}
			staff={staff?.data ?? []}
		/>
	);
}
