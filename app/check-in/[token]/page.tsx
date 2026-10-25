import { notFound } from "next/navigation";
import { PublicCheckIn } from "@/features/public-check-in/PublicCheckIn";
import { getPublicDirectory } from "@/features/public-check-in/api";
import { frontendEnabled } from "@/lib/feature-flags";
import LegacyCheckIn from "./legacy-check-in";

export default async function CheckInPage({ params }: { params: Promise<{ token: string }> }) {
	if (!frontendEnabled("public")) return <LegacyCheckIn params={params} />;
	const { token } = await params;
	if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(token)) notFound();
	const directory = await getPublicDirectory(token).catch(() => null);
	if (!directory) notFound();
	return <PublicCheckIn slug={token} directory={directory} initialClockIso={new Date().toISOString()} />;
}
