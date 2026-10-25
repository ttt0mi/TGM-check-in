import { PublicCheckIn } from "@/features/public-check-in/PublicCheckIn";
import { getPublicDirectory } from "@/features/public-check-in/api";
import { Unavailable } from "@/features/shared/Unavailable";
import { frontendEnabled } from "@/lib/feature-flags";
import { RequestError } from "@/lib/http/request-error";

export default async function CheckInPage({ params }: { params: Promise<{ token: string }> }) {
	if (!frontendEnabled("public"))
		return <Unavailable title="Check-in is unavailable" detail="Please ask reception to check you in." />;
	const { token } = await params;
	if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(token))
		return (
			<Unavailable
				title="Invalid check-in code"
				detail="Scan the branch QR code again or ask reception for help."
			/>
		);
	let directory;
	try {
		directory = await getPublicDirectory(token);
	} catch (error) {
		if (error instanceof RequestError && error.status === 404)
			return (
				<Unavailable
					title="Check-in code unavailable"
					detail="This branch code is inactive or invalid. Ask reception for a current code."
				/>
			);
		return (
			<Unavailable
				title="Check-in temporarily unavailable"
				detail="We could not load this branch. Please try again or ask reception to check you in."
			/>
		);
	}
	return <PublicCheckIn slug={token} directory={directory} initialClockIso={new Date().toISOString()} />;
}
