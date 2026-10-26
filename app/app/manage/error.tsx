"use client";

import { AreaError } from "@/features/shared/AreaError";

export default function ManageError(props: { error: Error & { digest?: string }; reset: () => void }) {
	return <AreaError {...props} title="Management unavailable" returnHref="/app" returnLabel="Back to visits" />;
}
