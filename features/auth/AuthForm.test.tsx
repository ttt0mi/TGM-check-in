import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AuthForm } from "./AuthForm";
import { AUTH_TIMEOUT_MARKER } from "@/lib/supabase/transport";

const { replace, refresh, signIn, signUp, recover, resetCaptcha } = vi.hoisted(() => ({
	replace: vi.fn(),
	refresh: vi.fn(),
	signIn: vi.fn(),
	signUp: vi.fn(),
	recover: vi.fn(),
	resetCaptcha: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));
vi.mock("@/lib/supabase/browser", () => ({
	createClient: () => ({
		auth: {
			signInWithPassword: signIn,
			signUp,
			resetPasswordForEmail: recover,
		},
	}),
}));
vi.mock("@marsidev/react-turnstile", async () => {
	const React = await import("react");
	return {
		Turnstile: React.forwardRef(function MockTurnstile(props: { onSuccess: (token: string) => void }, ref) {
			React.useImperativeHandle(ref, () => ({ reset: resetCaptcha }));
			return (
				<button type="button" onClick={() => props.onSuccess("captcha-token")}>
					Solve challenge
				</button>
			);
		}),
	};
});

beforeEach(() => {
	process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "test-key";
});
afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
});

async function fill(mode: "login" | "signup" | "recovery") {
	const user = userEvent.setup();
	await user.type(screen.getByLabelText("Email"), "visitor@example.test");
	if (mode !== "recovery") await user.type(screen.getByLabelText("Password"), "StrongPassword1!");
	if (mode === "signup") await user.type(screen.getByLabelText("Confirm password"), "StrongPassword1!");
	await user.click(screen.getByRole("button", { name: "Solve challenge" }));
	return user;
}

it.each([
	["login", signIn, "Sign-in took too long"],
	["signup", signUp, "Your account may have been created"],
	["recovery", recover, "If an email arrives"],
] as const)("%s timeout keeps values, restores controls and does not redirect", async (mode, operation, message) => {
	operation.mockResolvedValueOnce({ error: new Error(AUTH_TIMEOUT_MARKER) });
	render(<AuthForm mode={mode} />);
	const user = await fill(mode);
	await user.click(
		screen.getByRole("button", {
			name: mode === "login" ? "Sign in" : mode === "signup" ? "Create your account" : "Reset your password",
		}),
	);
	expect(await screen.findByText(new RegExp(message))).toHaveAttribute("role", "alert");
	expect(screen.getByLabelText("Email")).toHaveValue("visitor@example.test");
	if (mode !== "recovery") expect(screen.getByLabelText("Password")).toHaveValue("StrongPassword1!");
	expect(replace).not.toHaveBeenCalled();
	expect(refresh).not.toHaveBeenCalled();
	expect(resetCaptcha).toHaveBeenCalledOnce();
	if (mode === "recovery")
		expect(operation).toHaveBeenCalledWith(
			"visitor@example.test",
			expect.objectContaining({ captchaToken: "captcha-token" }),
		);
	else
		expect(operation).toHaveBeenCalledWith(
			expect.objectContaining({
				email: "visitor@example.test",
				password: "StrongPassword1!",
				options: expect.objectContaining({ captchaToken: "captcha-token" }),
			}),
		);
	await user.click(screen.getByRole("button", { name: "Solve challenge" }));
	expect(
		screen.getByRole("button", {
			name: mode === "login" ? "Sign in" : mode === "signup" ? "Create your account" : "Reset your password",
		}),
	).toBeEnabled();
	await waitFor(() => expect(operation).toHaveBeenCalledTimes(1));
});

it("blocks duplicate login submission and allows a deliberate successful retry", async () => {
	let finish: (value: { error: Error | null }) => void = () => {};
	signIn.mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				finish = resolve;
			}),
	);
	signIn.mockResolvedValueOnce({ error: null });
	render(<AuthForm mode="login" />);
	const user = await fill("login");
	await user.click(screen.getByRole("button", { name: "Sign in" }));
	expect(screen.getByRole("button", { name: "Please wait…" })).toBeDisabled();
	expect(signIn).toHaveBeenCalledTimes(1);
	finish({ error: new Error(AUTH_TIMEOUT_MARKER) });
	await screen.findByText(/Sign-in took too long/);
	await user.click(screen.getByRole("button", { name: "Solve challenge" }));
	await user.click(screen.getByRole("button", { name: "Sign in" }));
	await waitFor(() => expect(replace).toHaveBeenCalledWith("/start"));
	expect(signIn).toHaveBeenCalledTimes(2);
});
