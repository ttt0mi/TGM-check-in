import { AuthForm } from "@/features/auth/AuthForm";
import { Unavailable } from "@/features/shared/Unavailable";
import { frontendEnabled } from "@/lib/feature-flags";
export default function ForgotPasswordPage() {
	if (!frontendEnabled("auth"))
		return (
			<Unavailable
				title="Password recovery is unavailable"
				detail="Please contact your organization administrator."
			/>
		);
	return <AuthForm mode="recovery" />;
}
