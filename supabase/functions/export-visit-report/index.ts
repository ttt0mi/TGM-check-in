import { withSupabase } from "@supabase/server";
import { failure } from "../_shared/tgm.ts";
import { streamCsvReport } from "../_shared/reporting-service.ts";
import type { Database } from "../_shared/database.ts";

export default {
  fetch: withSupabase<Database>({ auth: "user" }, async (req, ctx) => {
    try {
      return await streamCsvReport(req, ctx);
    } catch (error) { return failure(error); }
  }),
};
