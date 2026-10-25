import { notFound } from "next/navigation";
import { AuthForm } from "@/features/auth/AuthForm";
import { frontendEnabled } from "@/lib/feature-flags";
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
	if (!frontendEnabled("auth")) notFound();
	const { error } = await searchParams;
	const notice =
		error === "verification"
			? "This sign-in link could not be verified. Request a new link or sign in again."
			: undefined;
	return <AuthForm mode="login" notice={notice} />;
}
