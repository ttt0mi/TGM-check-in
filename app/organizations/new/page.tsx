import { redirect } from "next/navigation";
import { CreateOrganization } from "@/features/auth/CreateOrganization";
import { Unavailable } from "@/features/shared/Unavailable";
import { frontendEnabled } from "@/lib/feature-flags";
import { createClient } from "@/lib/supabase/server";
import { verifiedUser } from "@/lib/supabase/auth-error";
import { READ_TIMEOUT_MS, withRequestTimeout } from "@/lib/http/timeout";
export const metadata = { title: "Create organization", description: "Set up your organization in TGM reception." };
export default async function CreateOrganizationPage() {
	if (!frontendEnabled("auth"))
		return (
			<Unavailable
				title="Organization setup is unavailable"
				detail="Please contact your organization administrator."
			/>
		);
	const supabase = await createClient();
	const user = await verifiedUser(supabase);
	if (!user) redirect("/login");
	if (!user.email_confirmed_at) redirect("/verify-email");
	const { data: profile } = await supabase
		.from("operator_profiles")
		.select("organization_id")
		.eq("user_id", user.id)
		.maybeSingle();
	if (profile?.organization_id) redirect("/start");
	let availability: { available?: boolean } | null = null;
	let availabilityError = true;
	try {
		const result = await withRequestTimeout(
			(signal) =>
				supabase.functions.invoke<{ available: boolean }>("organization-signup-availability", {
					method: "GET",
					signal,
				}),
			READ_TIMEOUT_MS,
		);
		availability = result.data;
		availabilityError = Boolean(result.error);
	} catch {
		/* The page renders an explicit availability error. */
	}
	return (
		<CreateOrganization
			availability={availabilityError ? "error" : availability?.available === true ? "open" : "disabled"}
		/>
	);
}
