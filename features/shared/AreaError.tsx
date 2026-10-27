"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { reportClientFailure } from "@/lib/observability/client";

export function AreaError({
	error,
	reset,
	title,
	returnHref,
	returnLabel,
}: {
	error: Error & { digest?: string };
	reset: () => void;
	title: string;
	returnHref: string;
	returnLabel: string;
}) {
	const [reference, setReference] = useState("");
	const heading = useRef<HTMLHeadingElement>(null);
	useEffect(() => {
		const id = reportClientFailure("page", "render_failure");
		queueMicrotask(() => setReference(id));
		heading.current?.focus();
	}, [error]);
	return (
		<main id="main-content" className="state-page">
			<h1 ref={heading} tabIndex={-1}>
				{title}
			</h1>
			<p>This section could not load. Please try again.</p>
			{reference && <p>Reference: {reference}</p>}
			<button onClick={reset}>Try again</button>
			<Link href={returnHref}>{returnLabel}</Link>
		</main>
	);
}
