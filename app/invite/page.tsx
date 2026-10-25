import { notFound } from "next/navigation";
import { InviteCapture } from "@/features/auth/InviteCapture";
import { frontendEnabled } from "@/lib/feature-flags";
export default function InvitePage() {
	if (!frontendEnabled("auth")) notFound();
	return <InviteCapture />;
}
