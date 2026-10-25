import { csvCell, localParts } from "./reporting-utils.ts";

function assertEquals(actual: unknown, expected: unknown) {
  if (actual !== expected) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

Deno.test("branch local date crosses a UTC boundary correctly", () => {
  assertEquals(localParts("2026-10-23T00:30:00Z", "America/Los_Angeles").date, "2026-10-22");
  assertEquals(localParts("2026-10-23T23:30:00Z", "Africa/Lagos").date, "2026-10-24");
});

Deno.test("CSV values cannot create formulas or break rows", () => {
  assertEquals(csvCell("=1+1"), '"\'=1+1"');
  assertEquals(csvCell("  +SUM(1,2)"), '"\'  +SUM(1,2)"');
  assertEquals(csvCell('Jane "J"\nDoe'), '"Jane ""J""\nDoe"');
});
