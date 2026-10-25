"use client";

import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
	useEffect(() => {
		console.error("Page failed", { digest: error.digest ?? null });
	}, [error]);
	return (
		<main id="main-content" className="state-page">
			<h1>Something went wrong</h1>
			<p>We could not load this page. Please try again.</p>
			{error.digest && <p>Reference: {error.digest}</p>}
			<button onClick={reset}>Try again</button>
		</main>
	);
}
