import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/utils/logger";

/**
 * Drill-down filter for the prescriptions list, driven by the dashboard
 * "Prescrições estagnadas" KPI:
 *   prescription.updated_at < (today - p_weeks weeks)
 *   AND has at least one ACTIVE assignment (start_date <= today AND
 *       (end_date IS NULL OR end_date >= today))
 *
 * Uses list_prescriptions_stagnant(p_weeks) on the server, mirroring
 * count_prescriptions_stagnant(p_weeks) exactly. Computing on the server
 * keeps the count card and the filtered list perfectly consistent — same
 * CURRENT_DATE boundary, no Date.now()/Date.parse() drift around midnight.
 */

interface IdRow {
  prescription_id: string;
}

/**
 * Returns a Set<string> of prescription ids that are stagnant. When `weeks`
 * is null the query is disabled and `data` stays undefined; the caller
 * should bypass filtering entirely.
 */
export const usePrescriptionsStagnantFilter = (weeks: number | null) => {
  return useQuery({
    queryKey: ["prescriptions-stagnant-filter", weeks],
    enabled: weeks !== null && weeks > 0,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<Set<string>> => {
      if (weeks === null) return new Set();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)(
        "list_prescriptions_stagnant",
        { p_weeks: weeks },
      );
      if (error) {
        logger.error(
          "[usePrescriptionsStagnantFilter] list_prescriptions_stagnant failed",
          error,
        );
        throw error;
      }
      return new Set(((data ?? []) as IdRow[]).map((r) => r.prescription_id));
    },
  });
};
