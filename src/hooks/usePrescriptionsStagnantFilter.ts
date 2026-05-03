import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Drill-down filter for the prescriptions list, driven by the dashboard
 * "Prescrições estagnadas" KPI:
 *   prescription.updated_at < (today - p_weeks weeks)
 *   AND has at least one ACTIVE assignment (start_date <= today AND
 *       (end_date IS NULL OR end_date >= today))
 *
 * Mirrors the server-side rule of count_prescriptions_stagnant(p_weeks).
 * Returns a Set<string> of stagnant prescription_ids that the page can
 * intersect with the full prescription list. Computing client-side keeps
 * the change surgical (no new RPC, no migration). Volume is bounded by
 * the active-assignment count, which stays small.
 */

interface AssignmentRow {
  prescription_id: string;
  start_date: string;
  end_date: string | null;
}

interface PrescriptionRow {
  id: string;
  updated_at: string;
}

const computeStagnantIds = (
  prescriptions: PrescriptionRow[],
  activeAssignments: AssignmentRow[],
  weeks: number,
): Set<string> => {
  const cutoff = Date.now() - weeks * 7 * 24 * 60 * 60 * 1000;
  const activePrescriptionIds = new Set(activeAssignments.map((a) => a.prescription_id));

  const stagnant = new Set<string>();
  for (const p of prescriptions) {
    if (!activePrescriptionIds.has(p.id)) continue;
    const updatedAt = Date.parse(p.updated_at);
    if (Number.isNaN(updatedAt)) continue;
    if (updatedAt < cutoff) stagnant.add(p.id);
  }
  return stagnant;
};

/**
 * Returns a Set<string> of prescription ids that are stagnant (older than
 * `weeks` weeks AND have an active assignment), or `null` when `weeks` is
 * not provided (caller should bypass filtering entirely).
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
      const todayISO = new Date().toISOString().slice(0, 10);

      const [prescriptionsResp, assignmentsResp] = await Promise.all([
        supabase
          .from("workout_prescriptions")
          .select("id, updated_at"),
        supabase
          .from("prescription_assignments")
          .select("prescription_id, start_date, end_date")
          .lte("start_date", todayISO),
      ]);

      if (prescriptionsResp.error) throw prescriptionsResp.error;
      if (assignmentsResp.error) throw assignmentsResp.error;

      const activeAssignments = ((assignmentsResp.data ?? []) as AssignmentRow[]).filter(
        (a) => a.end_date === null || a.end_date >= todayISO,
      );

      return computeStagnantIds(
        (prescriptionsResp.data ?? []) as PrescriptionRow[],
        activeAssignments,
        weeks,
      );
    },
  });
};
