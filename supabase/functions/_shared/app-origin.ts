import { parseAppOrigin } from "./origin.ts";

export function appOrigin() {
	const source = Deno.env.get("APP_ORIGIN");
	return parseAppOrigin(source, Deno.env.get("TGM_ENVIRONMENT") === "development");
}
