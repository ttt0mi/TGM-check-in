import { AuthForm } from "@/features/auth/AuthForm";
import { Unavailable } from "@/features/shared/Unavailable";
import { frontendEnabled } from "@/lib/feature-flags";
export default function SignupPage() {
	if (!frontendEnabled("auth"))
		return <Unavailable title="Sign-up is unavailable" detail="Please contact your organization administrator." />;
	return <AuthForm mode="signup" />;
}
