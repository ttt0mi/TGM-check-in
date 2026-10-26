"use client";

import { useEffect, useState } from "react";
import { reportClientFailure } from "@/lib/observability/client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
	const [reference, setReference] = useState("");
	useEffect(() => {
		const id = reportClientFailure("page", "render_failure");
		queueMicrotask(() => setReference(id));
	}, [error]);
	return (
		<html lang="en">
			<body>
				<main id="main-content" className="state-page">
					<h1>Something went wrong</h1>
					<p>The application could not load. Please try again.</p>
					{reference && <p>Reference: {reference}</p>}
					<button onClick={reset}>Try again</button>
					<a href="/start">Go to start</a>
				</main>
			</body>
		</html>
	);
}
