import { notFound, redirect } from "next/navigation";
import { AcceptInvite } from "@/features/auth/AcceptInvite";
import { frontendEnabled } from "@/lib/feature-flags";
import { createClient } from "@/lib/supabase/server";
export default async function AcceptInvitePage() {
	if (!frontendEnabled("auth")) notFound();
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) redirect("/login");
	if (!user.email_confirmed_at) redirect("/verify-email");
	return <AcceptInvite />;
}
