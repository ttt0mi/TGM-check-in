import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useAccessWatch } from "./useAccessWatch";

const { replace, refresh, getUser, removeAllChannels } = vi.hoisted(() => ({
	replace: vi.fn(),
	refresh: vi.fn(),
	getUser: vi.fn(),
	removeAllChannels: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));
vi.mock("@/lib/supabase/browser", () => ({
	createClient: () => ({ auth: { getUser }, removeAllChannels }),
}));

afterEach(() => {
	vi.useRealTimers();
	vi.clearAllMocks();
});

it("removes Realtime channels and redirects when the current session is revoked", async () => {
	vi.useFakeTimers();
	getUser.mockResolvedValue({ data: { user: null }, error: null });
	renderHook(() =>
		useAccessWatch({
			role: "admin",
			organizationId: "org-a",
			branchId: "branch-a",
		}),
	);
	await act(async () => {
		await vi.advanceTimersByTimeAsync(30_000);
	});
	expect(removeAllChannels).toHaveBeenCalledOnce();
	expect(replace).toHaveBeenCalledWith("/login");
	expect(refresh).toHaveBeenCalledOnce();
});
