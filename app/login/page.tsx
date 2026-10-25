import { notFound } from "next/navigation";
import { AuthForm } from "@/features/auth/AuthForm";
import { frontendEnabled } from "@/lib/feature-flags";
export default function LoginPage() {
	if (!frontendEnabled("auth")) notFound();
	return <AuthForm mode="login" />;
}
