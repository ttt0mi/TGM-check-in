import { redirect } from "next/navigation";
import { frontendEnabled } from "@/lib/feature-flags";
import LegacyHome from "./legacy-home";

export default function HomePage() {
	if (frontendEnabled("auth") && frontendEnabled("operator")) redirect("/start");
	return <LegacyHome />;
}
