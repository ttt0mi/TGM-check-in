import Link from "next/link";

export default function NotFound() {
	return (
		<main id="main-content" className="state-page">
			<h1>Page not found</h1>
			<p>This link may be incorrect or no longer available.</p>
			<Link href="/start">Go to start</Link>
		</main>
	);
}
