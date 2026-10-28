import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import SuspendedPage from "@/app/suspended/page";
import { VerifyEmail } from "./VerifyEmail";
import { OperatorDashboard } from "@/features/operator/OperatorDashboard";

const { replace, refresh, signOut, getUser, resend } = vi.hoisted(() => ({
	replace: vi.fn(),
	refresh: vi.fn(),
	signOut: vi.fn(),
	getUser: vi.fn(),
	resend: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));
vi.mock("@/lib/supabase/browser", () => ({ createClient: () => ({ auth: { signOut, getUser, resend } }) }));
vi.mock("@marsidev/react-turnstile", () => ({
	Turnstile: ({ onSuccess }: { onSuccess: (token: string) => void }) => (
		<button type="button" onClick={() => onSuccess("captcha-token")}>
			Solve challenge
		</button>
	),
}));
vi.mock("@tanstack/react-query", () => ({
	QueryClient: class {},
	QueryClientProvider: ({ children }: { children: React.ReactNode }) => children,
	useQuery: ({ initialData }: { initialData: unknown }) => ({ data: initialData }),
}));
vi.mock("@/features/operator/useVisits", () => ({ useVisits: () => ({ groups: [], loading: false }) }));
vi.mock("@/features/operator/useAccessWatch", () => ({ useAccessWatch: () => ({ degraded: false }) }));
vi.mock("@/features/operator/VisitQueue", () => ({ VisitQueue: () => null }));
afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
});

it("reports uncertain global revocation after the suspended flow clears the device session", async () => {
	signOut.mockResolvedValue({ error: new Error("network failure") });
	render(<SuspendedPage />);
	await userEvent.setup().click(screen.getByRole("button", { name: "Sign out or switch account" }));
	expect(signOut).toHaveBeenCalledWith();
	expect(replace).toHaveBeenCalledWith("/login?error=signout-unknown");
});

it("restores verification controls after global sign-out uncertainty", async () => {
	getUser.mockResolvedValue({ data: { user: null }, error: null });
	signOut.mockResolvedValue({ error: new Error("network failure") });
	render(<VerifyEmail />);
	await userEvent.setup().click(screen.getByRole("button", { name: "Sign out or use another account" }));
	expect(replace).toHaveBeenCalledWith("/login?error=signout-unknown");
	expect(screen.getByRole("button", { name: "Sign out or use another account" })).toBeEnabled();
});

it("explains that a timed-out verification email may still arrive", async () => {
	process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "test-key";
	getUser.mockResolvedValue({ data: { user: { email: "visitor@example.test" } }, error: null });
	resend.mockResolvedValue({ error: new Error("tgm_auth_transport_timeout") });
	render(<VerifyEmail />);
	const user = userEvent.setup();
	await user.click(screen.getByRole("button", { name: "Solve challenge" }));
	await user.click(screen.getByRole("button", { name: "Resend verification email" }));
	expect(await screen.findByText(/may already be on its way/)).toHaveAttribute("role", "alert");
});

it("uses local scope for the operator shared-device sign-out", async () => {
	signOut.mockResolvedValue({ error: new Error("network failure") });
	render(
		<OperatorDashboard
			organization={{ id: "org-id", name: "School" }}
			role="admin"
			availableSections={{ admin: false, analytics: false }}
			branches={[]}
			initialBranchId=""
			departments={[]}
			staff={[]}
		/>,
	);
	await userEvent.setup().click(screen.getByRole("button", { name: "Sign out" }));
	expect(signOut).toHaveBeenCalledWith({ scope: "local" });
	expect(replace).toHaveBeenCalledWith("/login?error=local-signout");
});
