import Link from "next/link";

export function Unavailable({ title, detail }: { title: string; detail: string }) {
	return (
		<main id="main-content" className="state-page">
			<h1>{title}</h1>
			<p>{detail}</p>
			<Link href="/start">Go to start</Link>
		</main>
	);
}
