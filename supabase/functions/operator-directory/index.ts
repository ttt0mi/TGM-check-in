import { withSupabase } from "@supabase/server";
import { authenticatedOperator, failure, HttpError, json, readJson } from "../_shared/tgm.ts";
import type { Database } from "../_shared/database.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

type PagedDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Functions"> & {
    Functions: Database["public"]["Functions"] & {
      tgm_list_organization_operators_page: {
        Args: { p_actor_id: string; p_limit?: number; p_search?: string; p_after_email?: string; p_after_id?: string };
        Returns: { user_id: string; email: string; role: Database["public"]["Enums"]["tgm_operator_role"]; is_active: boolean; location_id: string | null }[];
      };
    };
  };
};

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
	  const operatorSearch = typeof input.operator_search === "string" ? input.operator_search.trim() : "";
	  const operatorAfterEmail = typeof input.operator_after_email === "string" ? input.operator_after_email : null;
	  const operatorAfterId = typeof input.operator_after_id === "string" ? input.operator_after_id : null;
      if (search.length > 120 || operatorSearch.length > 120 || Boolean(afterCreatedAt) !== Boolean(afterId)
	    || Boolean(operatorAfterEmail) !== Boolean(operatorAfterId) || (afterId && operatorAfterId))
        throw new HttpError(400, "Invalid invitation page request");
      const service = operator.service as unknown as SupabaseClient<PagedDatabase>;
      const [operators, invitations] = await Promise.all([
        afterId ? Promise.resolve({ data: null, error: null }) : service.rpc("tgm_list_organization_operators_page", {
          p_actor_id: operator.userId,
          p_limit: 26,
          p_search: operatorSearch || undefined,
          p_after_email: operatorAfterEmail || undefined,
          p_after_id: operatorAfterId || undefined,
        }),
        operatorAfterId ? Promise.resolve({ data: null, error: null }) : operator.service.rpc("tgm_list_organization_invitations_page", {
          p_actor_id: operator.userId,
          p_limit: 26,
          p_search: search || undefined,
          p_after_created_at: afterCreatedAt || undefined,
          p_after_id: afterId || undefined,
        }),
      ]);
      if (operators.error) throw operators.error;
      if (invitations.error) throw invitations.error;
      const invitationRows = invitations.data ?? [];
      const invitationPage = invitationRows.slice(0, 25);
      const lastInvitation = invitationPage.at(-1);
      const operatorRows = operators.data ?? [];
      const operatorPage = operatorRows.slice(0, 25);
      const lastOperator = operatorPage.at(-1);
      return json({
        operators: operators.data ? operatorPage : null,
        operator_next_cursor: operatorRows.length > 25 && lastOperator ? { email: lastOperator.email, id: lastOperator.user_id } : null,
        invitations: invitations.data ? invitationPage : null,
        next_cursor: invitationRows.length > 25 && lastInvitation ? { created_at: lastInvitation.created_at, id: lastInvitation.id } : null,
      });
    } catch (error) { return failure(error); }
  }),
};
