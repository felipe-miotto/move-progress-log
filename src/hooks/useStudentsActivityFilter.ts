import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/utils/logger";

/**
 * Activity-based filters for the students list, driven by the dashboard
 * KPI drill-downs:
 *  - "inactive" : students that exist for at least N days but had no
 *                 workout_session in the last N days. Mirrors
 *                 count_students_inactive(p_days) exactly via the
 *                 list_students_inactive(p_days) RPC.
 *  - "dropping" : students whose session count in the last 28 days is
 *                 strictly less than in the prior 28 days. Mirrors
 *                 count_students_frequency_dropping() exactly via the
 *                 list_students_frequency_dropping() RPC.
 *
 * Both filters return a Set of student_ids. Using the server-side RPC
 * (instead of recomputing client-side) keeps the count card and the
 * filtered list perfectly consistent — same CURRENT_DATE boundaries,
 * no timezone drift, no "new students" leakage in the inactive bucket.
 */

export type StudentsActivityFilter =
  | { kind: "none" }
  | { kind: "inactive"; days: number }
  | { kind: "dropping" };

interface IdRow {
  student_id: string;
}

/**
 * Returns a Set<string> of student ids that match the given activity filter,
 * or undefined while loading. When `filter.kind === "none"` the query is
 * disabled and `data` stays undefined; the caller should bypass filtering
 * entirely in that case.
 */
export const useStudentsActivityFilter = (filter: StudentsActivityFilter) => {
  return useQuery({
    queryKey: ["students-activity-filter", filter],
    enabled: filter.kind !== "none",
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<Set<string>> => {
      if (filter.kind === "inactive") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase.rpc as any)(
          "list_students_inactive",
          { p_days: filter.days },
        );
        if (error) {
          logger.error("[useStudentsActivityFilter] list_students_inactive failed", error);
          throw error;
        }
        return new Set(((data ?? []) as IdRow[]).map((r) => r.student_id));
      }

      // dropping
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)(
        "list_students_frequency_dropping",
      );
      if (error) {
        logger.error(
          "[useStudentsActivityFilter] list_students_frequency_dropping failed",
          error,
        );
        throw error;
      }
      return new Set(((data ?? []) as IdRow[]).map((r) => r.student_id));
    },
  });
};
