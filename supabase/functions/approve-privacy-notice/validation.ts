import { HttpError, uuid } from "../_shared/tgm.ts";

export function parsePrivacyNoticeInput(body: Record<string, unknown>) {
	const organizationId = uuid(body.organization_id, "organization");
	if (typeof body.notice_copy !== "string" || typeof body.policy_url !== "string")
		throw new HttpError(400, "Enter notice copy and a policy URL", "notice_invalid");
	const copy = body.notice_copy.trim();
	const policyUrl = body.policy_url.trim();
	let parsed: URL;
	try { parsed = new URL(policyUrl); }
	catch { throw new HttpError(400, "Enter a valid HTTPS policy URL", "notice_invalid"); }
	if (copy.length < 40 || copy.length > 2000 || policyUrl.length > 2048
		|| /\s/.test(policyUrl) || parsed.protocol !== "https:" || !parsed.hostname
		|| parsed.username || parsed.password)
		throw new HttpError(400, "Check the notice copy and HTTPS policy URL", "notice_invalid");
	return { organizationId, copy, policyUrl };
}
