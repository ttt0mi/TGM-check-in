import { notFound } from "next/navigation";
import { AuthForm } from "@/features/auth/AuthForm";
import { frontendEnabled } from "@/lib/feature-flags";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { recoveryCookie, validRecoveryIntent } from "@/lib/auth/recovery-intent";
export default async function ResetPasswordPage() {
	if (!frontendEnabled("auth")) notFound();
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user || !validRecoveryIntent((await cookies()).get(recoveryCookie)?.value, user.id))
		redirect("/forgot-password");
	return <AuthForm mode="reset" />;
}
