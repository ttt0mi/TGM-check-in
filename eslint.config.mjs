import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import eslintConfigPrettier from "eslint-config-prettier/flat";

export default defineConfig([
	...nextVitals,
	...nextTypescript,
	globalIgnores([
		".next/**",
		".history/**",
		"out/**",
		"build/**",
		"coverage/**",
		"playwright-report/**",
		"next-env.d.ts",
		"supabase/functions/**",
	]),
	eslintConfigPrettier,
]);
