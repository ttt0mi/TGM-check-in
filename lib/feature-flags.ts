import "server-only";

export type FrontendFeature = "public" | "host" | "auth" | "operator" | "admin" | "analytics";

export const routeFeatures = {
	"/check-in/[token]": "public",
	"/host-decision": "host",
	"/login": "auth",
	"/signup": "auth",
	"/forgot-password": "auth",
	"/reset-password": "auth",
	"/verify-email": "auth",
	"/auth/recover": "auth",
	"/invite": "auth",
	"/invite/accept": "auth",
	"/organizations/new": "auth",
	"/app": "operator",
	"/app/manage": "admin",
	"/app/branches/[id]/qr": "admin",
	"/app/analytics": "analytics",
} as const satisfies Record<string, FrontendFeature>;

export function frontendEnabled(feature: FrontendFeature) {
	const value = process.env[`TGM_FRONTEND_${feature.toUpperCase()}_ENABLED`];
	return value === "true" || (process.env.NODE_ENV !== "production" && value !== "false");
}
