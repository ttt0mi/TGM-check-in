import { parseAppOrigin } from "./origin.ts";

export function appOrigin() {
  // Retain the fallback until APP_ORIGIN is verified in the shared live project.
  const source = Deno.env.get("APP_ORIGIN") || Deno.env.get("HOST_DECISION_ORIGIN");
	return parseAppOrigin(source, Deno.env.get("TGM_ENVIRONMENT") === "development");
}
