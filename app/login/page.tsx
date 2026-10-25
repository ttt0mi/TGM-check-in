import { AuthForm } from "@/features/auth/AuthForm";
import { Unavailable } from "@/features/shared/Unavailable";
import { frontendEnabled } from "@/lib/feature-flags";
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
	if (!frontendEnabled("auth"))
		return <Unavailable title="Sign-in is unavailable" detail="Please contact your organization administrator." />;
	const { error } = await searchParams;
	const notice =
		error === "verification"
			? "This sign-in link could not be verified. Request a new link or sign in again."
			: undefined;
	return <AuthForm mode="login" notice={notice} />;
}
