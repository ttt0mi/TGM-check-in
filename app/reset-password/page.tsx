import { notFound } from "next/navigation";
import { AuthForm } from "@/features/auth/AuthForm";
import { frontendEnabled } from "@/lib/feature-flags";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
export default async function ResetPasswordPage() {
	if (!frontendEnabled("auth")) notFound();
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) redirect("/login");
	return <AuthForm mode="reset" />;
}
