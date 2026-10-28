import { withSupabase } from "@supabase/server";
import {
  authenticatedOperator,
  failure,
  HttpError,
  json,
  readJson,
} from "../_shared/tgm.ts";
import type { Database } from "../_shared/database.ts";
import { parsePrivacyNoticeInput } from "./validation.ts";

type Context = Parameters<typeof authenticatedOperator>[0];
type OperatorResolver = typeof authenticatedOperator;

export async function handleApprovePrivacyNotice(
  req: Request,
  ctx: Context,
  resolveOperator: OperatorResolver = authenticatedOperator,
): Promise<Response> {
  try {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }
    const operator = await resolveOperator(ctx);
    if (operator.role !== "admin") {
      throw new HttpError(403, "Admin access required", "admin_required");
    }
    const body = await readJson(req);
    const { organizationId, copy, policyUrl } = parsePrivacyNoticeInput(body);
    if (organizationId !== operator.organizationId) {
      throw new HttpError(
        403,
        "Organization access denied",
        "organization_forbidden",
      );
    }
    const { error } = await operator.service.rpc(
      "tgm_approve_privacy_notice_as_admin",
      {
        p_actor_id: operator.userId,
        p_organization_id: organizationId,
        p_notice_copy: copy,
        p_policy_url: policyUrl,
      },
    );
    if (error) {
      if (error.code === "42501") {
        throw new HttpError(403, "Admin access required", "admin_required");
      }
      if (error.code === "23514" || error.code === "22023") {
        throw new HttpError(
          400,
          "Check the notice copy and HTTPS policy URL",
          "notice_invalid",
        );
      }
      throw error;
    }
    return json({ approved: true });
  } catch (error) {
    return failure(error);
  }
}

export default {
  fetch: withSupabase<Database>({ auth: "user" }, handleApprovePrivacyNotice),
};
