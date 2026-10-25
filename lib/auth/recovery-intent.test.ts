import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRecoveryIntent, validRecoveryIntent } from "./recovery-intent";

describe("recovery intent", () => {
	beforeEach(() => {
		vi.stubEnv("TGM_RECOVERY_INTENT_SECRET", "test-signing-key-with-at-least-thirty-two-bytes");
	});
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.useRealTimers();
	});

	it("binds a short-lived intent to the verified account", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-10-25T10:00:00Z"));
		const intent = createRecoveryIntent("account-a");
		expect(validRecoveryIntent(intent, "account-a")).toBe(true);
		expect(validRecoveryIntent(intent, "account-b")).toBe(false);
		expect(validRecoveryIntent(`${intent}tampered`, "account-a")).toBe(false);
		vi.advanceTimersByTime(601_000);
		expect(validRecoveryIntent(intent, "account-a")).toBe(false);
	});
});
