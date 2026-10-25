import { notFound } from "next/navigation";
import { frontendEnabled } from "@/lib/feature-flags";
export default function VerifyEmailPage() {
	if (!frontendEnabled("auth")) notFound();
	return (
		<main>
			<h1>Check your email</h1>
			<p>Open the verification link, then continue to your account.</p>
			<a href="/login">Sign in</a>
		</main>
	);
}
