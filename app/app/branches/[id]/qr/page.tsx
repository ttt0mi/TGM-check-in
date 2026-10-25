import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PrintableQr } from "@/features/admin/PrintableQr";
import { Unavailable } from "@/features/shared/Unavailable";
import { frontendEnabled } from "@/lib/feature-flags";

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
		.select("id,name,public_slug,organization_id")
		.eq("id", id)
		.eq("organization_id", profile.organization_id)
		.maybeSingle();
	if (!branch) notFound();
	const { data: org } = await supabase
		.from("organizations")
		.select("name")
		.eq("id", profile.organization_id)
		.single();
	const origin = process.env.APP_ORIGIN || (process.env.NODE_ENV !== "production" ? "http://localhost:3000" : "");
	if (!origin) throw new Error("APP_ORIGIN is required for printable QR codes");
	return (
		<PrintableQr
			branch={branch}
			organizationName={org?.name ?? "TGM"}
			url={`${origin}/check-in/${branch.public_slug}`}
		/>
	);
}
