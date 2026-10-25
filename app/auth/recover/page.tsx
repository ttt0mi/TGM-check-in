import { RecoveryLink } from "@/features/auth/RecoveryLink";
import { frontendEnabled } from "@/lib/feature-flags";
import { notFound } from "next/navigation";

export default function RecoverPage() {
	if (!frontendEnabled("auth")) notFound();
	return <RecoveryLink />;
}
