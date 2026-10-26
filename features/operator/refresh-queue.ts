import type { QueryClient } from "@tanstack/react-query";

const pending = new WeakMap<QueryClient, Map<string, ReturnType<typeof setTimeout>>>();

export function clearScheduledVisitRefresh(client: QueryClient, branchId: string) {
	const timer = pending.get(client)?.get(branchId);
	if (timer) clearTimeout(timer);
	pending.get(client)?.delete(branchId);
}

export function refreshVisitQueries(client: QueryClient, branchId: string) {
	clearScheduledVisitRefresh(client, branchId);
	return Promise.all([
		client.invalidateQueries({ queryKey: ["visit-queue", branchId] }),
		client.invalidateQueries({ queryKey: ["visit-queue-counts", branchId] }),
	]);
}

export function scheduleVisitRefresh(client: QueryClient, branchId: string) {
	clearScheduledVisitRefresh(client, branchId);
	const timers = pending.get(client) ?? new Map<string, ReturnType<typeof setTimeout>>();
	pending.set(client, timers);
	timers.set(
		branchId,
		setTimeout(() => void refreshVisitQueries(client, branchId), 500),
	);
}
