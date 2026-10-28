import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useVisits } from "./useVisits";

const { setAuth, removeChannel, subscribe, reportFailure, scheduleRefresh, clearRefresh } = vi.hoisted(() => ({
	setAuth: vi.fn(),
	removeChannel: vi.fn(),
	subscribe: vi.fn(),
	reportFailure: vi.fn(),
	scheduleRefresh: vi.fn(),
	clearRefresh: vi.fn(),
}));

const queryClient = {};
vi.mock("@tanstack/react-query", () => ({
	useQueryClient: () => queryClient,
	useInfiniteQuery: () => ({}),
	useQuery: () => ({}),
}));
vi.mock("@/lib/observability/client", () => ({ reportClientFailure: reportFailure }));
vi.mock("./refresh-queue", () => ({
	scheduleVisitRefresh: scheduleRefresh,
	clearScheduledVisitRefresh: clearRefresh,
	refreshVisitQueries: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/supabase/browser", () => ({
	createClient: () => ({
		realtime: { setAuth },
		channel: () => {
			const channel = {
				on: () => channel,
				subscribe: (callback: (status: string) => void) => {
					subscribe(callback);
					return channel;
				},
			};
			return channel;
		},
		removeChannel,
	}),
}));

afterEach(() => {
	vi.clearAllMocks();
});

it("moves from connecting to connected, falls back once on failure, and removes the channel", async () => {
	setAuth.mockResolvedValue(undefined);
	let status: ((value: string) => void) | undefined;
	subscribe.mockImplementation((callback) => {
		status = callback;
	});
	const { result, unmount } = renderHook(() => useVisits("branch-a", ""));
	await waitFor(() => expect(subscribe).toHaveBeenCalledOnce());
	status?.("SUBSCRIBED");
	await waitFor(() => expect(result.current.connection).toBe("connected"));
	expect(scheduleRefresh).toHaveBeenCalledWith(queryClient, "branch-a");
	status?.("CHANNEL_ERROR");
	status?.("TIMED_OUT");
	await waitFor(() => expect(result.current.connection).toBe("fallback"));
	expect(reportFailure).toHaveBeenCalledTimes(1);
	unmount();
	expect(clearRefresh).toHaveBeenCalledWith(queryClient, "branch-a");
	expect(removeChannel).toHaveBeenCalledOnce();
});

it("uses polling fallback and reports one failure when Realtime authentication fails", async () => {
	setAuth.mockRejectedValue(new Error("offline"));
	const { result } = renderHook(() => useVisits("branch-a", ""));
	await waitFor(() => expect(result.current.connection).toBe("fallback"));
	expect(reportFailure).toHaveBeenCalledTimes(1);
	expect(subscribe).not.toHaveBeenCalled();
});
