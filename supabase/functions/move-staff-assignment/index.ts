import { withSupabase } from "@supabase/server";
import {
  authenticatedOperator,
  failure,
  HttpError,
  json,
  readJson,
  uuid,
} from "../_shared/tgm.ts";
import type { Database } from "../_shared/database.ts";

type Context = Parameters<typeof authenticatedOperator>[0];
type OperatorResolver = typeof authenticatedOperator;

export async function handleMoveStaffAssignment(
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
    const staffId = uuid(body.staff_id, "staff");
    const locationId = uuid(body.location_id, "branch");
    const departmentId = uuid(body.department_id, "department");
    const [staff, branch, department] = await Promise.all([
      operator.service.from("staff").select("organization_id,is_active").eq(
        "id",
        staffId,
      ).maybeSingle(),
      operator.service.from("locations").select("organization_id,is_active").eq(
        "id",
        locationId,
      ).maybeSingle(),
      operator.service.from("departments").select("organization_id,is_active")
        .eq("id", departmentId).maybeSingle(),
    ]);
    if (staff.error || branch.error || department.error) {
      throw new Error("Staff move preflight failed");
    }
    if (
      !staff.data?.is_active ||
      staff.data.organization_id !== operator.organizationId ||
      !branch.data?.is_active ||
      branch.data.organization_id !== operator.organizationId ||
      !department.data?.is_active ||
      department.data.organization_id !== operator.organizationId
    ) {
      throw new HttpError(
        400,
        "Choose active staff, branch and department in your organization",
        "resource_inactive",
      );
    }
    const { data, error } = await operator.service.rpc(
      "tgm_move_staff_assignment",
      {
        p_actor_id: operator.userId,
        p_staff_id: staffId,
        p_location_id: locationId,
        p_department_id: departmentId,
      },
    );
    if (error) {
      if (error.code === "23514") {
        throw new HttpError(
          409,
          "Resolve active visits before moving this host",
          "active_visits",
        );
      }
      if (error.code === "42501") {
        throw new HttpError(403, "Admin access required", "admin_required");
      }
      if (error.code === "22023") {
        throw new HttpError(
          400,
          "The destination is unavailable",
          "resource_inactive",
        );
      }
      throw error;
    }
    return json({ staff_id: data.id });
  } catch (error) {
    return failure(error);
  }
}

export default {
  fetch: withSupabase<Database>({ auth: "user" }, handleMoveStaffAssignment),
};
