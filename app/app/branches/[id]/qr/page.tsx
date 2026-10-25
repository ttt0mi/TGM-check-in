import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PrintableQr } from "@/features/admin/PrintableQr";
import { Unavailable } from "@/features/shared/Unavailable";
import { frontendEnabled } from "@/lib/feature-flags";
import { parseAppOrigin } from "@/supabase/functions/_shared/origin";

export default async function QrPage({ params }: { params: Promise<{ id: string }> }) {
	if (!frontendEnabled("admin"))
		return (
			<Unavailable
				title="QR management is unavailable"
				detail="Please contact your organization administrator."
			/>
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
	if (profile?.role !== "admin" || !profile.is_active || !profile.organization_id) notFound();
	const { id } = await params;
	const { data: branch } = await supabase
		.from("locations")
		.select("id,name,public_slug,organization_id,is_active")
		.eq("id", id)
		.eq("organization_id", profile.organization_id)
		.maybeSingle();
	if (!branch) notFound();
	const { data: org } = await supabase
		.from("organizations")
		.select("name,is_active")
		.eq("id", profile.organization_id)
		.single();
	if (!org?.is_active) redirect("/suspended");
	const { data: notice, error: noticeError } = await supabase
		.from("organization_privacy_notices")
		.select("approved_at")
		.eq("organization_id", profile.organization_id)
		.maybeSingle();
	if (noticeError) throw noticeError;
	const origin = parseAppOrigin(
		process.env.APP_ORIGIN || (process.env.NODE_ENV !== "production" ? "http://localhost:3000" : undefined),
		process.env.NODE_ENV !== "production",
	);
	return (
		<PrintableQr
			branch={branch}
			privacyApproved={Boolean(notice?.approved_at)}
			organizationName={org.name}
			url={`${origin}/check-in/${branch.public_slug}`}
		/>
	);
}
