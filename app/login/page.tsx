import { AuthForm } from "@/features/auth/AuthForm";
import { Unavailable } from "@/features/shared/Unavailable";
import { frontendEnabled } from "@/lib/feature-flags";
export const metadata = { title: "Sign in", description: "Sign in to TGM reception." };
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
	if (!frontendEnabled("auth"))
		return <Unavailable title="Sign-in is unavailable" detail="Please contact your organization administrator." />;
	const { error } = await searchParams;
	const notice =
		error === "verification"
			? "This sign-in link could not be verified. Request a new link or sign in again."
			: error === "auth-unavailable"
				? "Authentication is temporarily unavailable. Reopen your link or try again shortly."
				: error === "signout-unknown"
					? "This device was signed out, but remote session revocation could not be confirmed."
					: error === "local-signout"
						? "This device was signed out. Other sessions remain active."
						: undefined;
	return <AuthForm mode="login" notice={notice} />;
}
