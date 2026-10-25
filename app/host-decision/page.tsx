import { notFound } from "next/navigation";
import { HostDecision } from "@/features/host-decision/HostDecision";
import { frontendEnabled } from "@/lib/feature-flags";

export default function HostDecisionPage() {
	if (!frontendEnabled("host")) notFound();
	return <HostDecision />;
}
