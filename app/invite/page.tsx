import { InviteCapture } from "@/features/auth/InviteCapture";
import { Unavailable } from "@/features/shared/Unavailable";
import { frontendEnabled } from "@/lib/feature-flags";
export const metadata = {
	title: "Operator invitation",
	description: "Continue with your invitation to TGM reception.",
};
export default function InvitePage() {
	if (!frontendEnabled("auth"))
		return (
			<Unavailable title="Invitations are unavailable" detail="Please contact your organization administrator." />
		);
	return <InviteCapture />;
}
