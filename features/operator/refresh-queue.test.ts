import { afterEach, expect, it, vi } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
import { refreshVisitQueries, scheduleVisitRefresh } from "./refresh-queue";

afterEach(() => vi.useRealTimers());

it("coalesces a local action and ten Realtime messages into one queue refresh", async () => {
	vi.useFakeTimers();
	const invalidateQueries = vi.fn().mockResolvedValue(undefined);
	const client = { invalidateQueries } as unknown as QueryClient;
	for (let index = 0; index < 11; index += 1) scheduleVisitRefresh(client, "branch-a");
	await vi.advanceTimersByTimeAsync(500);
	expect(invalidateQueries).toHaveBeenCalledTimes(2);
	await refreshVisitQueries(client, "branch-b");
	expect(invalidateQueries).toHaveBeenCalledTimes(4);
});
