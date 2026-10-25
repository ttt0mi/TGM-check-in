import "server-only";

export function frontendEnabled(feature: "public" | "host" | "auth" | "operator" | "admin" | "analytics") {
	const value = process.env[`TGM_FRONTEND_${feature.toUpperCase()}_ENABLED`];
	return value === "true" || (process.env.NODE_ENV !== "production" && value !== "false");
}
