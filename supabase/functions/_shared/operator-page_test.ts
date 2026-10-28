import { parseOperatorRows } from "./operator-page.ts";

function assertEquals(actual: unknown, expected: unknown) {
	if (actual !== expected) throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
}
function assertThrows(action: () => unknown) {
	let threw = false;
	try { action(); } catch { threw = true; }
	if (!threw) throw new Error("Expected malformed rows to be rejected");
}

const admin = {
	user_id: "ad000000-0000-4000-8000-000000000001",
	email: "admin@example.test",
	role: "admin",
	is_active: true,
	location_id: null,
};

Deno.test("operator page permits a branchless admin and assigned receptionist", () => {
	const rows = parseOperatorRows([admin, {
		...admin,
		user_id: "ad000000-0000-4000-8000-000000000002",
		role: "receptionist",
		location_id: "ad000000-0000-4000-8000-000000000003",
	}]);
	assertEquals(rows[0].location_id, null);
	assertEquals(rows[1].location_id, "ad000000-0000-4000-8000-000000000003");
});

Deno.test("operator page rejects malformed rows before returning them", () => {
	assertThrows(() => parseOperatorRows({ email: "wrong shape" }));
	assertThrows(() => parseOperatorRows([{ ...admin, location_id: 42 }]));
	assertThrows(() => parseOperatorRows([{ ...admin, role: "owner" }]));
});
