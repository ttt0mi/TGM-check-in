import { handleApprovePrivacyNotice } from "./index.ts";
import { HttpError } from "../_shared/tgm.ts";

const organizationId = "aa000000-0000-4000-8000-000000000001";
const otherOrganizationId = "aa000000-0000-4000-8000-000000000002";
const userId = "aa000000-0000-4000-8000-000000000003";

function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

function request(overrides: Record<string, unknown> = {}, method = "POST") {
  return new Request(
    "https://example.test/functions/v1/approve-privacy-notice",
    {
      method,
      body: method === "POST"
        ? JSON.stringify({
          organization_id: organizationId,
          notice_copy:
            "We use visitor details to manage access to this location.",
          policy_url: "https://example.test/privacy",
          ...overrides,
        })
        : undefined,
    },
  );
}

function operator(
  role: "admin" | "receptionist" = "admin",
  rpcError: { code: string } | null = null,
) {
  const calls: unknown[][] = [];
  const service = {
    rpc: async (...args: unknown[]) => {
      calls.push(args);
      return { data: null, error: rpcError };
    },
  };
  return {
    calls,
    resolve: async () =>
      ({ service, userId, organizationId, role, locationId: null }) as never,
  };
}

Deno.test("privacy handler rejects unauthenticated, inactive and non-admin operators", async () => {
  for (
    const expected of [
      { status: 401, message: "Sign in required" },
      { status: 403, message: "Operator access is inactive" },
    ]
  ) {
    const response = await handleApprovePrivacyNotice(
      request(),
      {} as never,
      async () => {
        throw new HttpError(expected.status, expected.message);
      },
    );
    assertEquals(response.status, expected.status);
    assertEquals((await response.json()).error, expected.message);
  }
  const receptionist = operator("receptionist");
  const response = await handleApprovePrivacyNotice(
    request(),
    {} as never,
    receptionist.resolve,
  );
  assertEquals(response.status, 403);
  assertEquals(await response.json(), {
    error: "Admin access required",
    code: "admin_required",
  });
});

Deno.test("privacy handler rejects cross-tenant approval before the RPC", async () => {
  const admin = operator();
  const response = await handleApprovePrivacyNotice(
    request({ organization_id: otherOrganizationId }),
    {} as never,
    admin.resolve,
  );
  assertEquals(response.status, 403);
  assertEquals(await response.json(), {
    error: "Organization access denied",
    code: "organization_forbidden",
  });
  assertEquals(admin.calls.length, 0);
});

Deno.test("privacy handler sends the authenticated actor to the service-only RPC", async () => {
  const admin = operator();
  const response = await handleApprovePrivacyNotice(
    request(),
    {} as never,
    admin.resolve,
  );
  assertEquals(response.status, 200);
  assertEquals(await response.json(), { approved: true });
  assertEquals(admin.calls, [
    [
      "tgm_approve_privacy_notice_as_admin",
      {
        p_actor_id: userId,
        p_organization_id: organizationId,
        p_notice_copy:
          "We use visitor details to manage access to this location.",
        p_policy_url: "https://example.test/privacy",
      },
    ],
  ]);
});

Deno.test("privacy handler maps database authorization and validation failures", async () => {
  for (
    const [code, status, responseCode] of [
      ["42501", 403, "admin_required"],
      ["23514", 400, "notice_invalid"],
      ["22023", 400, "notice_invalid"],
    ] as const
  ) {
    const admin = operator("admin", { code });
    const response = await handleApprovePrivacyNotice(
      request(),
      {} as never,
      admin.resolve,
    );
    assertEquals(response.status, status);
    assertEquals((await response.json()).code, responseCode);
  }
});
