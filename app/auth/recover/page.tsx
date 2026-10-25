import { RecoveryLink } from "@/features/auth/RecoveryLink";
import { frontendEnabled } from "@/lib/feature-flags";
import { Unavailable } from "@/features/shared/Unavailable";

export default function RecoverPage() {
	if (!frontendEnabled("auth"))
		return (
			<Unavailable
				title="Password recovery is unavailable"
				detail="Please contact your organization administrator."
			/>
		);
	return <RecoveryLink />;
}
