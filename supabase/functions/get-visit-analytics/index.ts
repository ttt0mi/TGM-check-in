import { withSupabase } from "@supabase/server";
import { failure, json } from "../_shared/tgm.ts";
import { loadReport, summarizeReport } from "../_shared/reporting.ts";
import type { Database } from "../_shared/database.ts";

export default {
  fetch: withSupabase<Database>({ auth: "user" }, async (req, ctx) => {
    try { return json(summarizeReport(await loadReport(req, ctx))); }
    catch (error) { return failure(error); }
  }),
};
