import { parsePrivacyNoticeInput } from "./validation.ts";

const valid = {
	organization_id: "ee000000-0000-4000-8000-000000000001",
	notice_copy: "This notice describes how the organization handles visitor details at check-in.",
	policy_url: "https://example.test/privacy",
};

Deno.test("privacy approval accepts bounded organization-owned content", () => {
	const result = parsePrivacyNoticeInput(valid);
	if (result.organizationId !== valid.organization_id || result.copy !== valid.notice_copy)
		throw new Error("Valid notice was changed");
});

Deno.test("privacy approval rejects unsafe policy URLs and missing copy", () => {
	for (const input of [
		{ ...valid, policy_url: "http://example.test/privacy" },
		{ ...valid, policy_url: "https://user:pass@example.test/privacy" },
		{ ...valid, policy_url: "https://example.test/privacy bad" },
		{ ...valid, notice_copy: "short" },
	]) {
		let denied = false;
		try { parsePrivacyNoticeInput(input); } catch { denied = true; }
		if (!denied) throw new Error("Invalid notice was accepted");
	}
});
