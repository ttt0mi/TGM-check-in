import { redirect } from "next/navigation";
import { AcceptInvite } from "@/features/auth/AcceptInvite";
import { Unavailable } from "@/features/shared/Unavailable";
import { frontendEnabled } from "@/lib/feature-flags";
import { createClient } from "@/lib/supabase/server";
import { verifiedUser } from "@/lib/supabase/auth-error";
export const metadata = { title: "Accept invitation", description: "Review and accept your operator invitation." };
export default async function AcceptInvitePage() {
	if (!frontendEnabled("auth"))
		return (
			<Unavailable title="Invitations are unavailable" detail="Please contact your organization administrator." />
		);
	const supabase = await createClient();
	const user = await verifiedUser(supabase);
	if (!user) redirect("/login");
	if (!user.email_confirmed_at) redirect("/verify-email");
	return <AcceptInvite accountEmail={user.email ?? ""} />;
}
