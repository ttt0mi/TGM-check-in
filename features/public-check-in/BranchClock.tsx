"use client";

import { useEffect, useRef, useState } from "react";
import type { VisitorVisit } from "./types";
import { formatElapsedTime, visitStopwatch } from "./visit-stopwatch";

const modes = ["12", "24", "stopwatch"] as const;
type ClockMode = (typeof modes)[number];

export function BranchClock({
	timezone,
	initialIso,
	visit,
}: {
	timezone: string;
	initialIso: string;
	visit: VisitorVisit | null;
}) {
	const [now, setNow] = useState(() => new Date(initialIso));
	const [mode, setMode] = useState<ClockMode>("12");
	const touchX = useRef<number | null>(null);

	useEffect(() => {
		const saved = sessionStorage.getItem("tgm:clock-format");
		if (saved === "24" || saved === "stopwatch") {
			queueMicrotask(() => setMode(saved));
		}
		const interval = window.setInterval(() => setNow(new Date()), 1000);
		return () => window.clearInterval(interval);
	}, []);

	function chooseMode(next: ClockMode) {
		setMode(next);
		sessionStorage.setItem("tgm:clock-format", next);
	}

	function swipe(direction: -1 | 1) {
		const index = modes.indexOf(mode);
		chooseMode(modes[(index + direction + modes.length) % modes.length]);
	}

	const clock = new Intl.DateTimeFormat("en-NG", {
		timeZone: timezone,
		hour: "numeric",
		minute: "2-digit",
		second: "2-digit",
		hour12: mode === "12",
	}).format(now);
	const date = new Intl.DateTimeFormat("en-NG", {
		timeZone: timezone,
		weekday: "long",
		day: "numeric",
		month: "long",
	}).format(now);
	const stopwatch = visitStopwatch(visit, now);

	return (
		<section
			aria-label="Branch clock and visit stopwatch"
			onTouchStart={(event) => {
				touchX.current = event.touches[0]?.clientX ?? null;
			}}
			onTouchEnd={(event) => {
				if (touchX.current !== null) {
					const difference = (event.changedTouches[0]?.clientX ?? touchX.current) - touchX.current;
					if (difference < -40) swipe(1);
					if (difference > 40) swipe(-1);
				}
				touchX.current = null;
			}}
		>
			{mode === "stopwatch" ? (
				<>
					<p>Visit stopwatch</p>
					<output aria-label="Elapsed visit time">
						{stopwatch.elapsedSeconds === null ? "—" : formatElapsedTime(stopwatch.elapsedSeconds)}
					</output>
					<p>{stopwatch.message}</p>
				</>
			) : (
				<>
					<p>Local time · {date}</p>
					<time dateTime={now.toISOString()}>{clock}</time>
				</>
			)}
			<div aria-label="Clock view">
				<button type="button" aria-pressed={mode === "12"} onClick={() => chooseMode("12")}>
					12-hour
				</button>
				<button type="button" aria-pressed={mode === "24"} onClick={() => chooseMode("24")}>
					24-hour
				</button>
				<button type="button" aria-pressed={mode === "stopwatch"} onClick={() => chooseMode("stopwatch")}>
					Stopwatch
				</button>
			</div>
		</section>
	);
}
