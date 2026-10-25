import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export const recoveryCookie = "tgm_recovery_intent";
const lifetimeSeconds = 600;

function signingKey(): Buffer {
	const value = process.env.TGM_RECOVERY_INTENT_SECRET;
	if (!value || value.length < 32) throw new Error("Recovery intent signing secret is unavailable");
	return Buffer.from(value, "utf8");
}

function sign(payload: string): string {
	return createHmac("sha256", signingKey()).update(payload).digest("base64url");
}

export function createRecoveryIntent(userId: string): string {
	const payload = Buffer.from(
		JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + lifetimeSeconds }),
	).toString("base64url");
	return `${payload}.${sign(payload)}`;
}

export function validRecoveryIntent(value: string | undefined, userId: string): boolean {
	if (!value) return false;
	const [payload, signature, extra] = value.split(".");
	if (!payload || !signature || extra) return false;
	const expected = Buffer.from(sign(payload));
	const actual = Buffer.from(signature);
	if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;
	try {
		const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { sub?: string; exp?: number };
		return data.sub === userId && typeof data.exp === "number" && data.exp > Math.floor(Date.now() / 1000);
	} catch {
		return false;
	}
}

export const recoveryCookieOptions = {
	httpOnly: true,
	secure: process.env.NODE_ENV === "production",
	sameSite: "strict" as const,
	path: "/",
	maxAge: lifetimeSeconds,
};
