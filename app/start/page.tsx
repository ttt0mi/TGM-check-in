import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { verifiedUser } from "@/lib/supabase/auth-error";

export const metadata = { title: "Getting started", description: "Continue to your TGM workspace." };

export default async function StartPage() {
	const supabase = await createClient();
	const user = await verifiedUser(supabase);
	if (!user) redirect("/login");
	if (!user.email_confirmed_at) redirect("/verify-email");

	const { data: profile, error: profileError } = await supabase
		.from("operator_profiles")
		.select("role,is_active,organization_id")
		.eq("user_id", user.id)
		.maybeSingle();
	if (profileError) throw profileError;
	if (!profile || !profile.organization_id) {
		const pendingInvite = (await cookies()).has("tgm_invitation");
		redirect(pendingInvite ? "/invite/accept" : "/organizations/new");
	}
	if (!profile.is_active) redirect("/suspended");
	const { data: organization } = await supabase
		.from("organizations")
		.select("is_active")
		.eq("id", profile.organization_id)
		.maybeSingle();
	if (!organization?.is_active) redirect("/suspended");
	redirect("/app");
}
