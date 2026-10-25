import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
	resolve: { alias: { "@": path.resolve(import.meta.dirname, ".") } },
	test: {
		environment: "jsdom",
		include: ["features/**/*.test.{ts,tsx}", "lib/**/*.test.{ts,tsx}"],
		globals: true,
	},
});
