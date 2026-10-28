"use client";

import { AreaError } from "@/features/shared/AreaError";

export default function AnalyticsError(props: { error: Error & { digest?: string }; reset: () => void }) {
	return <AreaError {...props} title="Reports unavailable" returnHref="/app" returnLabel="Back to visits" />;
}
