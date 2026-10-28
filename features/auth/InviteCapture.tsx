"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithTimeout } from "@/lib/http/fetch-with-timeout";
import { RequestError } from "@/lib/http/request-error";

export function InviteCapture() {
	const router = useRouter();
	const [message, setMessage] = useState("Saving your invitation…");
	const started = useRef(false);
	useEffect(() => {
		if (started.current) return;
		started.current = true;
		const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
		window.history.replaceState(null, "", window.location.pathname);
		if (!token) {
			queueMicrotask(() => setMessage("This invitation link is missing its token."));
			return;
		}
		void fetchWithTimeout("/api/invitation/preserve", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ token }),
		})
			.then(async (response) => {
				if (!response.ok) throw new Error("This invitation link is invalid.");
				router.replace("/start");
				router.refresh();
			})
			.catch((cause: unknown) =>
				setMessage(cause instanceof RequestError ? cause.message : "Unable to save invitation."),
			);
	}, [router]);
	return (
		<main id="main-content">
			<h1>Operator invitation</h1>
			<p role="status">{message}</p>
			<a href="/login">Sign in</a>
		</main>
	);
}
