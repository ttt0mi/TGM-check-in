import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	outputFileTracingRoot: process.cwd(),
	agentRules: false,
	typescript: {
		tsconfigPath: process.env.NODE_ENV === "production" ? "tsconfig.build.json" : "tsconfig.json",
	},
};

export default nextConfig;
