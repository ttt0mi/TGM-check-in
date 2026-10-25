import { notFound, redirect } from "next/navigation";
import { AnalyticsDashboard } from "@/features/analytics/AnalyticsDashboard";
import { frontendEnabled } from "@/lib/feature-flags";
import { createClient } from "@/lib/supabase/server";

export default async function AnalyticsPage() {
	if (!frontendEnabled("analytics")) notFound();
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
	const { data: branches, error } = await supabase
		.from("locations")
		.select("id,name,timezone")
		.eq("organization_id", profile.organization_id)
		.order("name");
	if (error) throw error;
	return <AnalyticsDashboard role={profile.role} branches={branches ?? []} />;
}
