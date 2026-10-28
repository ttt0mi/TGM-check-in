import { createClient } from "@supabase/supabase-js";
import { expect, it } from "vitest";
import { AUTH_TIMEOUT_MARKER } from "./transport";

it.each(["local", "global"] as const)("%s sign-out clears this device after remote timeout", async (scope) => {
	const values = new Map<string, string>();
	const storageKey = `signout-${scope}`;
	values.set(
		storageKey,
		JSON.stringify({
			access_token: "test-access-token",
			refresh_token: "test-refresh-token",
			token_type: "bearer",
			expires_in: 3600,
			expires_at: Math.floor(Date.now() / 1000) + 3600,
			user: { id: "test-user", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {} },
		}),
	);
	const client = createClient("https://example.test", "public-key", {
		auth: {
			storageKey,
			storage: {
				getItem: (key) => values.get(key) ?? null,
				setItem: (key, value) => {
					values.set(key, value);
				},
				removeItem: (key) => {
					values.delete(key);
				},
			},
			persistSession: true,
			autoRefreshToken: false,
			detectSessionInUrl: false,
		},
		global: {
			fetch: async () => {
				throw new Error(AUTH_TIMEOUT_MARKER);
			},
		},
	});
	const { error } = await client.auth.signOut({ scope });
	expect(error).toBeTruthy();
	expect(values.has(storageKey)).toBe(false);
});
