import { withSupabase } from "@supabase/server";
import { authenticatedOperator, failure, HttpError, json } from "../_shared/tgm.ts";
import type { Database } from "../_shared/database.ts";

export default {
  fetch: withSupabase<Database>({ auth: "user" }, async (req, ctx) => {
    try {
      if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
      const operator = await authenticatedOperator(ctx);
      if (operator.role !== "admin") throw new HttpError(403, "Admin access required");
      const [operators, invitations] = await Promise.all([
        operator.service.rpc("tgm_list_organization_operators" as never, { p_actor_id: operator.userId } as never),
        operator.service.rpc("tgm_list_organization_invitations" as never, { p_actor_id: operator.userId } as never),
      ]);
      if (operators.error) throw operators.error;
      if (invitations.error) throw invitations.error;
      return json({ operators: operators.data, invitations: invitations.data });
    } catch (error) { return failure(error); }
  }),
};
