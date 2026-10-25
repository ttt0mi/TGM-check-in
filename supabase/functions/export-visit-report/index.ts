import { withSupabase } from "@supabase/server";
import { failure } from "../_shared/tgm.ts";
import { csvReport, loadReport } from "../_shared/reporting.ts";
import type { Database } from "../_shared/database.ts";

export default {
  fetch: withSupabase<Database>({ auth: "user" }, async (req, ctx) => {
    try {
      const report = await loadReport(req, ctx);
      const csv = await csvReport(report);
      return new Response(csv, { status: 200, headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="tgm-visits-${report.startDate}-${report.endDate}.csv"`,
        "Cache-Control": "no-store, private",
        "X-Content-Type-Options": "nosniff",
      } });
    } catch (error) { return failure(error); }
  }),
};
