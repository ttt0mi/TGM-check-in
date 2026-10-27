import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Unavailable } from "@/features/shared/Unavailable";
import { frontendEnabled } from "@/lib/feature-flags";

export const metadata = { title: "Host email recovery", description: "Review an uncertain host email outcome." };

export default async function HostEmailRecoveryPage() {
	if (!frontendEnabled("admin"))
		return (
			<Unavailable title="Management is unavailable" detail="Please contact your organization administrator." />
		);
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) redirect("/login");
	const { data: profile, error } = await supabase
		.from("operator_profiles")
		.select("role,is_active,organization_id")
		.eq("user_id", user.id)
		.maybeSingle();
	if (error) throw error;
	if (!profile?.is_active) redirect("/suspended");
	if (profile.role !== "admin" || !profile.organization_id)
		return (
			<Unavailable
				title="Administrator access required"
				detail="Ask an organization administrator to review host email delivery."
			/>
		);
	const { data: organization, error: organizationError } = await supabase
		.from("organizations")
		.select("is_active")
		.eq("id", profile.organization_id)
		.maybeSingle();
	if (organizationError) throw organizationError;
	if (!organization?.is_active) redirect("/suspended");
	return (
		<main id="main-content" className="state-page">
			<h1>Host email recovery</h1>
			<p>
				An unknown outcome means the provider may have accepted the email. Sending a new link can invalidate a
				link the host already received.
			</p>
			<ol>
				<li>Find the visit’s latest attempt time in the reception queue.</li>
				<li>Compare it with the matching Resend request and delivery logs.</li>
				<li>If Resend confirms delivery, keep the original link and ask the host to check their inbox.</li>
				<li>
					If Resend confirms it did not accept the message, ask a database owner to resolve that specific
					attempt before retrying.
				</li>
			</ol>
			<p>
				Use the administrator procedure in <code>docs/host-email-recovery.md</code> for the exact database
				resolution steps. Do not change a delivery status based only on a timeout.
			</p>
			<Link href="/app">Back to visits</Link>
		</main>
	);
}
