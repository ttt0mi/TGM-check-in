import { HostDecision } from "@/features/host-decision/HostDecision";
import { Unavailable } from "@/features/shared/Unavailable";
import { frontendEnabled } from "@/lib/feature-flags";

export const metadata = { title: "Host decision", description: "Review and respond to a visitor request." };

export default function HostDecisionPage() {
	if (!frontendEnabled("host"))
		return (
			<Unavailable title="Host decisions are unavailable" detail="Please contact reception about this visit." />
		);
	return <HostDecision />;
}
