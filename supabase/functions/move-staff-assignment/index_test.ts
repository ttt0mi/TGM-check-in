import { handleMoveStaffAssignment } from "./index.ts";
import { HttpError } from "../_shared/tgm.ts";

const organizationId = "ab000000-0000-4000-8000-000000000001";
const otherOrganizationId = "ab000000-0000-4000-8000-000000000002";
const userId = "ab000000-0000-4000-8000-000000000003";
const staffId = "ab000000-0000-4000-8000-000000000004";
const locationId = "ab000000-0000-4000-8000-000000000005";
const departmentId = "ab000000-0000-4000-8000-000000000006";

function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

function request(overrides: Record<string, unknown> = {}, method = "POST") {
  return new Request(
    "https://example.test/functions/v1/move-staff-assignment",
    {
      method,
      body: method === "POST"
        ? JSON.stringify({
          staff_id: staffId,
          location_id: locationId,
          department_id: departmentId,
          ...overrides,
        })
        : undefined,
    },
  );
}

function operator(options: {
  role?: "admin" | "receptionist";
  staffOrganization?: string;
  staffActive?: boolean;
  rpcError?: { code: string } | null;
} = {}) {
  const rpcCalls: unknown[][] = [];
  const rows = {
    staff: {
      organization_id: options.staffOrganization ?? organizationId,
      is_active: options.staffActive ?? true,
    },
    locations: { organization_id: organizationId, is_active: true },
    departments: { organization_id: organizationId, is_active: true },
  };
  const service = {
    from: (table: keyof typeof rows) => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({ data: rows[table], error: null }),
      };
      return builder;
    },
    rpc: async (...args: unknown[]) => {
      rpcCalls.push(args);
      return { data: { id: staffId }, error: options.rpcError ?? null };
    },
  };
  return {
    rpcCalls,
    resolve: async () =>
      ({
        service,
        userId,
        organizationId,
        role: options.role ?? "admin",
        locationId: null,
      }) as never,
  };
}

Deno.test("staff move handler rejects missing, inactive and non-admin identities", async () => {
  for (
    const expected of [
      { status: 401, message: "Sign in required" },
      { status: 403, message: "Operator access is inactive" },
    ]
  ) {
    const response = await handleMoveStaffAssignment(
      request(),
      {} as never,
      async () => {
        throw new HttpError(expected.status, expected.message);
      },
    );
    assertEquals(response.status, expected.status);
    assertEquals((await response.json()).error, expected.message);
  }
  const receptionist = operator({ role: "receptionist" });
  const response = await handleMoveStaffAssignment(
    request(),
    {} as never,
    receptionist.resolve,
  );
  assertEquals(response.status, 403);
  assertEquals((await response.json()).code, "admin_required");
});

Deno.test("staff move handler rejects inactive and cross-tenant resources before mutation", async () => {
  for (
    const admin of [
      operator({ staffActive: false }),
      operator({ staffOrganization: otherOrganizationId }),
    ]
  ) {
    const response = await handleMoveStaffAssignment(
      request(),
      {} as never,
      admin.resolve,
    );
    assertEquals(response.status, 400);
    assertEquals((await response.json()).code, "resource_inactive");
    assertEquals(admin.rpcCalls.length, 0);
  }
});

Deno.test("staff move handler calls the service-only RPC with authenticated actor and validated resources", async () => {
  const admin = operator();
  const response = await handleMoveStaffAssignment(
    request(),
    {} as never,
    admin.resolve,
  );
  assertEquals(response.status, 200);
  assertEquals(await response.json(), { staff_id: staffId });
  assertEquals(admin.rpcCalls, [
    [
      "tgm_move_staff_assignment",
      {
        p_actor_id: userId,
        p_staff_id: staffId,
        p_location_id: locationId,
        p_department_id: departmentId,
      },
    ],
  ]);
});

Deno.test("staff move handler maps active-visit, authorization and destination conflicts", async () => {
  for (
    const [code, status, responseCode] of [
      ["23514", 409, "active_visits"],
      ["42501", 403, "admin_required"],
      ["22023", 400, "resource_inactive"],
    ] as const
  ) {
    const admin = operator({ rpcError: { code } });
    const response = await handleMoveStaffAssignment(
      request(),
      {} as never,
      admin.resolve,
    );
    assertEquals(response.status, status);
    assertEquals((await response.json()).code, responseCode);
  }
});
