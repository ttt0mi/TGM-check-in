import { AuthForm } from "@/features/auth/AuthForm";
import { Unavailable } from "@/features/shared/Unavailable";
import { frontendEnabled } from "@/lib/feature-flags";
export const metadata = { title: "Request password reset", description: "Request a secure password recovery link." };
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
