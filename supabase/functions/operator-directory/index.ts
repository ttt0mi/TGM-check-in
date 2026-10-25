import { withSupabase } from "@supabase/server";
import { authenticatedOperator, failure, HttpError, json, readJson } from "../_shared/tgm.ts";
import type { Database } from "../_shared/database.ts";

export default {
  fetch: withSupabase<Database>({ auth: "user" }, async (req, ctx) => {
    try {
      if (req.method !== "GET" && req.method !== "POST") return json({ error: "Method not allowed" }, 405);
      const operator = await authenticatedOperator(ctx);
      if (operator.role !== "admin") throw new HttpError(403, "Admin access required");
      const input = req.method === "POST" ? await readJson(req) : {};
      const search = typeof input.search === "string" ? input.search.trim() : "";
      const afterCreatedAt = typeof input.after_created_at === "string" ? input.after_created_at : null;
      const afterId = typeof input.after_id === "string" ? input.after_id : null;
      if (search.length > 120 || Boolean(afterCreatedAt) !== Boolean(afterId))
        throw new HttpError(400, "Invalid invitation page request");
      const [operators, invitations] = await Promise.all([
        afterId ? Promise.resolve({ data: null, error: null }) : operator.service.rpc("tgm_list_organization_operators", { p_actor_id: operator.userId }),
        operator.service.rpc("tgm_list_organization_invitations_page", {
          p_actor_id: operator.userId,
          p_limit: 26,
          p_search: search || undefined,
          p_after_created_at: afterCreatedAt || undefined,
          p_after_id: afterId || undefined,
        }),
      ]);
      if (operators.error) throw operators.error;
      if (invitations.error) throw invitations.error;
      const rows = invitations.data ?? [];
      const page = rows.slice(0, 25);
      const last = page.at(-1);
      return json({ operators: operators.data, invitations: page,
        next_cursor: rows.length > 25 && last ? { created_at: last.created_at, id: last.id } : null });
    } catch (error) { return failure(error); }
  }),
};
