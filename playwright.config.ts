import { defineConfig, devices } from "@playwright/test";

const port = 3100;
const mockPort = 54331;

export default defineConfig({
	testDir: "./tests/e2e",
	timeout: 30_000,
	retries: process.env.CI ? 1 : 0,
	use: {
		...devices["Desktop Chrome"],
		baseURL: `http://127.0.0.1:${port}`,
	},
	webServer: [
		{
			command: "node tests/mock-supabase.mjs",
			url: `http://127.0.0.1:${mockPort}/health`,
			reuseExistingServer: !process.env.CI,
			timeout: 30_000,
		},
		{
			command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
			url: `http://127.0.0.1:${port}/login`,
			reuseExistingServer: !process.env.CI,
			timeout: 90_000,
			env: {
				NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${mockPort}`,
				NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
				NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
				TGM_FRONTEND_PUBLIC_ENABLED: "true",
				TGM_FRONTEND_HOST_ENABLED: "true",
				TGM_FRONTEND_AUTH_ENABLED: "true",
			},
		},
	],
});
