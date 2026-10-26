"use client";

import { useEffect, useRef, useState } from "react";
import { reportClientFailure } from "@/lib/observability/client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
	const [correlationId, setCorrelationId] = useState("");
	const heading = useRef<HTMLHeadingElement | null>(null);
	useEffect(() => {
		let active = true;
		const id = reportClientFailure("page", "render_failure");
		queueMicrotask(() => {
			if (active) setCorrelationId(id);
		});
		heading.current?.focus();
		return () => {
			active = false;
		};
	}, [error]);
	return (
		<main id="main-content" className="state-page">
			<h1 ref={heading} tabIndex={-1}>
				Something went wrong
			</h1>
			<p>We could not load this page. Please try again.</p>
			{correlationId && <p>Reference: {correlationId}</p>}
			<button onClick={reset}>Try again</button>
		</main>
	);
}
