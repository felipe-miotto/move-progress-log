import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Dashboard KPI shape consumed by StatsGrid.
 * Each field is independent — partial failure is allowed (a single failing
 * RPC results in `null`, the others still render).
 */
export interface DashboardKPIs {
  inactive7d: number | null;
  frequencyDropping: number | null;
  weekAdherence: {
    realized: number;
    prescribed: number;
    percentage: number;
  } | null;
  stagnant4w: number | null;
}

const DEFAULT_INACTIVE_DAYS = 7;
const DEFAULT_STAGNANT_WEEKS = 4;

const callRpc = async <T>(name: string, args?: Record<string, unknown>): Promise<T | null> => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)(name, args ?? {});
  if (error) {
    return null;
  }
  return (data as T) ?? null;
};

const isWeekAdherence = (value: unknown): value is DashboardKPIs["weekAdherence"] => {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.realized === "number" &&
    typeof v.prescribed === "number" &&
    typeof v.percentage === "number"
  );
};

export const useDashboardKPIs = () => {
  return useQuery({
    queryKey: ["dashboard-kpis"],
    staleTime: 5 * 60 * 1000,
    gcTime: 20 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<DashboardKPIs> => {
      const [inactive, dropping, adherence, stagnant] = await Promise.all([
        callRpc<number>("count_students_inactive", { p_days: DEFAULT_INACTIVE_DAYS }),
        callRpc<number>("count_students_frequency_dropping"),
        callRpc<DashboardKPIs["weekAdherence"]>("compute_week_adherence"),
        callRpc<number>("count_prescriptions_stagnant", { p_weeks: DEFAULT_STAGNANT_WEEKS }),
      ]);

      return {
        inactive7d: typeof inactive === "number" ? inactive : null,
        frequencyDropping: typeof dropping === "number" ? dropping : null,
        weekAdherence: isWeekAdherence(adherence) ? adherence : null,
        stagnant4w: typeof stagnant === "number" ? stagnant : null,
      };
    },
  });
};
