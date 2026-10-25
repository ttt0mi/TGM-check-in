import { redirect } from "next/navigation";
import { CreateOrganization } from "@/features/auth/CreateOrganization";
import { Unavailable } from "@/features/shared/Unavailable";
import { frontendEnabled } from "@/lib/feature-flags";
import { createClient } from "@/lib/supabase/server";
export default async function CreateOrganizationPage() {
	if (!frontendEnabled("auth"))
		return (
			<Unavailable
				title="Organization setup is unavailable"
				detail="Please contact your organization administrator."
			/>
		);
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) redirect("/login");
	if (!user.email_confirmed_at) redirect("/verify-email");
	const { data: profile } = await supabase
		.from("operator_profiles")
		.select("organization_id")
		.eq("user_id", user.id)
		.maybeSingle();
	if (profile?.organization_id) redirect("/start");
	const { data: availability, error: availabilityError } = await supabase.functions.invoke(
		"organization-signup-availability",
		{ method: "GET" },
	);
	return (
		<CreateOrganization
			availability={availabilityError ? "error" : availability?.available === true ? "open" : "disabled"}
		/>
	);
}
