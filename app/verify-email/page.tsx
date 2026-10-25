import { notFound } from "next/navigation";
import { frontendEnabled } from "@/lib/feature-flags";
import { VerifyEmail } from "@/features/auth/VerifyEmail";
export default function VerifyEmailPage() {
	if (!frontendEnabled("auth")) notFound();
	return <VerifyEmail />;
}
