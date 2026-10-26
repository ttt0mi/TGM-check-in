import { expect, it } from "vitest";
import { publicConfigurationIssue } from "./configuration";

it("accepts a configured hosted or local Supabase origin", () => {
	expect(publicConfigurationIssue("https://example.supabase.co", "public-key-123")).toBe(false);
	expect(publicConfigurationIssue("http://127.0.0.1:54321", "public-key-123")).toBe(false);
});

it("blocks missing, malformed and insecure deployment configuration", () => {
	expect(publicConfigurationIssue(undefined, "public-key-123")).toBe(true);
	expect(publicConfigurationIssue("http://example.supabase.co", "public-key-123")).toBe(true);
	expect(publicConfigurationIssue("https://example.supabase.co/secret", "public-key-123")).toBe(true);
	expect(publicConfigurationIssue("https://example.supabase.co", undefined)).toBe(true);
});
