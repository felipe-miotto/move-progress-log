import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface OuraMetrics {
  id: string;
  student_id: string;
  date: string;
  
  // Existing metrics
  readiness_score: number | null;
  sleep_score: number | null;
  hrv_balance: number | null;
  resting_heart_rate: number | null;
  temperature_deviation: number | null;
  activity_balance: number | null;
  
  // Activity metrics
  activity_score: number | null;
  steps: number | null;
  active_calories: number | null;
  total_calories: number | null;
  met_minutes: number | null;
  high_activity_time: number | null;
  medium_activity_time: number | null;
  low_activity_time: number | null;
  sedentary_time: number | null;
  training_volume: number | null;
  training_frequency: number | null;
  
  // Sleep detailed metrics
  total_sleep_duration: number | null;
  deep_sleep_duration: number | null;
  rem_sleep_duration: number | null;
  light_sleep_duration: number | null;
  awake_time: number | null;
  sleep_efficiency: number | null;
  sleep_latency: number | null;
  lowest_heart_rate: number | null;
  average_sleep_hrv: number | null;
  average_breath: number | null;
  
  // Stress metrics
  stress_high_time: number | null;
  recovery_high_time: number | null;
  day_summary: string | null;
  
  // SpO2 metrics
  spo2_average: number | null;
  breathing_disturbance_index: number | null;
  
  // VO2 Max
  vo2_max: number | null;
  
  // Resilience
  resilience_level: string | null;
  
  created_at: string;
}

const OURA_METRICS_SELECT = `
  id, student_id, date, readiness_score, sleep_score, hrv_balance, resting_heart_rate, temperature_deviation,
  activity_balance, activity_score, steps, active_calories, total_calories, met_minutes, high_activity_time,
  medium_activity_time, low_activity_time, sedentary_time, training_volume, training_frequency,
  total_sleep_duration, deep_sleep_duration, rem_sleep_duration, light_sleep_duration, awake_time,
  sleep_efficiency, sleep_latency, lowest_heart_rate, average_sleep_hrv, average_breath,
  stress_high_time, recovery_high_time, day_summary, spo2_average, breathing_disturbance_index,
  vo2_max, resilience_level, created_at
`;

// AUD-F03: Histórico com paginação e deduplicação
export const useOuraMetrics = (studentId: string, limit?: number) => {
  return useQuery({
    queryKey: ["oura-metrics", studentId, limit],
    enabled: !!studentId,
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000, // Manter em cache por 10 minutos
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      let query = supabase
        .from("oura_metrics")
        .select(OURA_METRICS_SELECT)
        .eq("student_id", studentId)
        .order("date", { ascending: false });

      if (limit) {
        query = query.limit(limit);
      } else {
        query = query.limit(365);
      }

      const { data, error } = await query;

      if (error) throw error;

      // AUD-F03: Deduplicar registros por data (mantendo o mais recente do dia)
      const byDate = new Map<string, OuraMetrics>();
      for (const current of (data || []) as OuraMetrics[]) {
        const existing = byDate.get(current.date);
        if (!existing || new Date(current.created_at) > new Date(existing.created_at)) {
          byDate.set(current.date, current);
        }
      }

      return Array.from(byDate.values()).sort((a, b) => b.date.localeCompare(a.date));
    },
  });
};

export const useLatestOuraMetrics = (studentId: string) => {
  return useQuery({
    queryKey: ["oura-metrics-latest", studentId],
    enabled: !!studentId,
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      // Search a wider window to avoid showing "--" when recent days are sparse.
      const { data, error } = await supabase
        .from("oura_metrics")
        .select(OURA_METRICS_SELECT)
        .eq("student_id", studentId)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(90);

      if (error) throw error;
      const rows = (data || []) as OuraMetrics[];
      if (rows.length === 0) return null;

      // Prefer the latest row that already has recovery core signals.
      const withRecoveryCore = rows.find(
        (row) => row.readiness_score !== null || row.sleep_score !== null
      );

      return withRecoveryCore ?? rows[0];
    },
  });
};

