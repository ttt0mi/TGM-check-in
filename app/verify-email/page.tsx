import { frontendEnabled } from "@/lib/feature-flags";
import { VerifyEmail } from "@/features/auth/VerifyEmail";
import { Unavailable } from "@/features/shared/Unavailable";
export default function VerifyEmailPage() {
	if (!frontendEnabled("auth"))
		return (
			<Unavailable
				title="Email verification is unavailable"
				detail="Please contact your organization administrator."
			/>
		);
	return <VerifyEmail />;
}
