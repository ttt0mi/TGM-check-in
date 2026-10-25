import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import eslintConfigPrettier from "eslint-config-prettier/flat";

export default defineConfig([
	...nextVitals,
	...nextTypescript,
	{
		files: ["app/legacy-home.tsx", "app/check-in/[token]/legacy-check-in.tsx"],
		rules: { "react-hooks/set-state-in-effect": "off" },
	},
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
