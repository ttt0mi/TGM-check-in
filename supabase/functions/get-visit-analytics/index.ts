import { withSupabase } from "@supabase/server";
import { failure, json } from "../_shared/tgm.ts";
import { aggregateReport } from "../_shared/reporting-service.ts";
import type { Database } from "../_shared/database.ts";

export default {
  fetch: withSupabase<Database>({ auth: "user" }, async (req, ctx) => {
    try { return json(await aggregateReport(req, ctx)); }
    catch (error) { return failure(error); }
  }),
};
