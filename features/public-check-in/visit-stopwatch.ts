import { terminalStatuses } from "./session";
import type { VisitorVisit } from "./types";

export function formatElapsedTime(totalSeconds: number) {
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

export function visitStopwatch(
	visit: VisitorVisit | null,
	now: Date,
): { elapsedSeconds: number | null; message: string } {
	if (!visit?.admitted_at) {
		return {
			elapsedSeconds: 0,
			message:
				visit && terminalStatuses.has(visit.status)
					? "This visit was not admitted."
					: "Starts when reception admits you.",
		};
	}

	const admittedAt = Date.parse(visit.admitted_at);
	if (!Number.isFinite(admittedAt)) {
		return { elapsedSeconds: null, message: "Admission time unavailable." };
	}

	if (terminalStatuses.has(visit.status) && !visit.time_out) {
		return { elapsedSeconds: null, message: "Checkout time unavailable." };
	}

	const end = visit.time_out ? Date.parse(visit.time_out) : now.getTime();
	if (!Number.isFinite(end) || end < admittedAt) {
		return { elapsedSeconds: null, message: "Checkout time unavailable." };
	}

	return {
		elapsedSeconds: Math.floor((end - admittedAt) / 1000),
		message: visit.time_out
			? visit.status === "auto_closed"
				? "Stopped when the visit closed automatically."
				: "Stopped at checkout."
			: "Time since reception admitted you.",
	};
}
