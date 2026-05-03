import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { logger } from "@/utils/logger";

/**
 * Dashboard KPIs consumed by StatsGrid. Each KPI is independent — a single
 * failing RPC sets that field to `null` and records a code in `errors`,
 * the other KPIs still render. The UI uses `errors[key]` to distinguish
 * "not loaded yet" from "loaded but failed".
 */
export type DashboardKPIKey =
  | "inactive7d"
  | "frequencyDropping"
  | "weekAdherence"
  | "stagnant4w";

export interface DashboardKPIs {
  inactive7d: number | null;
  frequencyDropping: number | null;
  weekAdherence: {
    realized: number;
    prescribed: number;
    percentage: number;
  } | null;
  stagnant4w: number | null;
  /**
   * Per-KPI error map. `errors[key]` is the RPC name that failed for that
   * KPI; absent when the KPI loaded successfully.
   */
  errors: Partial<Record<DashboardKPIKey, string>>;
}

const DEFAULT_INACTIVE_DAYS = 7;
const DEFAULT_STAGNANT_WEEKS = 4;

type RpcName = keyof Database["public"]["Functions"];

interface RpcOk<T> {
  ok: true;
  data: T;
}

interface RpcErr {
  ok: false;
  error: string;
}

const callRpc = async <T>(
  name: RpcName,
  args?: Record<string, unknown>,
): Promise<RpcOk<T> | RpcErr> => {
  // Supabase's overloaded rpc() typing fights generic call-sites; the runtime
  // shape is the same. We narrow at the boundary via the explicit T below.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)(name, args ?? {});
  if (error) {
    logger.error(`[useDashboardKPIs] RPC ${name} failed`, error);
    return { ok: false, error: name };
  }
  return { ok: true, data: data as T };
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

      const errors: DashboardKPIs["errors"] = {};

      const inactive7d = inactive.ok && typeof inactive.data === "number" ? inactive.data : null;
      if (!inactive.ok) errors.inactive7d = inactive.error;

      const frequencyDropping =
        dropping.ok && typeof dropping.data === "number" ? dropping.data : null;
      if (!dropping.ok) errors.frequencyDropping = dropping.error;

      const weekAdherence =
        adherence.ok && isWeekAdherence(adherence.data) ? adherence.data : null;
      if (!adherence.ok) errors.weekAdherence = adherence.error;

      const stagnant4w =
        stagnant.ok && typeof stagnant.data === "number" ? stagnant.data : null;
      if (!stagnant.ok) errors.stagnant4w = stagnant.error;

      return {
        inactive7d,
        frequencyDropping,
        weekAdherence,
        stagnant4w,
        errors,
      };
    },
  });
};
