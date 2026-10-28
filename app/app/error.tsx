"use client";

import { AreaError } from "@/features/shared/AreaError";

export default function OperatorError(props: { error: Error & { digest?: string }; reset: () => void }) {
	return <AreaError {...props} title="Visits unavailable" returnHref="/start" returnLabel="Go to start" />;
}
