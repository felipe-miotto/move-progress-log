import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Activity-based filters for the students list, driven by the dashboard
 * KPI drill-downs:
 *  - "inactive" : students that exist for at least N days but had no
 *                 workout_session in the last N days. Mirrors the
 *                 server-side rule of count_students_inactive(p_days).
 *  - "dropping" : students whose session count in the last 28 days is
 *                 strictly less than in the prior 28 days. Mirrors
 *                 count_students_frequency_dropping().
 *
 * Both filters return a Set of student_ids that the page can intersect
 * with the full student list. Computing client-side keeps the change
 * surgical (no new RPC, no migration). Volume is capped to recent
 * sessions (<= 56 days) so the payload stays small.
 */

export type StudentsActivityFilter =
  | { kind: "none" }
  | { kind: "inactive"; days: number }
  | { kind: "dropping" };

interface SessionRow {
  student_id: string;
  date: string;
}

const sessionsLookbackForDropping = 56;

const computeInactiveIds = (
  studentIds: string[],
  recentSessions: SessionRow[],
): Set<string> => {
  const activeIds = new Set(recentSessions.map((s) => s.student_id));
  return new Set(studentIds.filter((id) => !activeIds.has(id)));
};

const computeDroppingIds = (sessions: SessionRow[]): Set<string> => {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const recentCutoff = now - 28 * day;
  const priorCutoff = now - 56 * day;

  const recent = new Map<string, number>();
  const prior = new Map<string, number>();

  for (const s of sessions) {
    const t = Date.parse(s.date);
    if (Number.isNaN(t)) continue;
    if (t >= recentCutoff) {
      recent.set(s.student_id, (recent.get(s.student_id) ?? 0) + 1);
    } else if (t >= priorCutoff) {
      prior.set(s.student_id, (prior.get(s.student_id) ?? 0) + 1);
    }
  }

  const dropping = new Set<string>();
  for (const [studentId, priorCount] of prior) {
    if (priorCount === 0) continue;
    const recentCount = recent.get(studentId) ?? 0;
    if (recentCount < priorCount) dropping.add(studentId);
  }
  return dropping;
};

/**
 * Returns a Set<string> of student ids that match the given activity filter,
 * or null if the filter is "none" (caller should bypass filtering entirely).
 */
export const useStudentsActivityFilter = (
  filter: StudentsActivityFilter,
  allStudentIds: string[],
) => {
  const idsKey = [...allStudentIds].sort().join(",");

  return useQuery({
    queryKey: ["students-activity-filter", filter, idsKey],
    enabled: filter.kind !== "none" && allStudentIds.length > 0,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<Set<string>> => {
      if (filter.kind === "inactive") {
        const cutoffISO = new Date(Date.now() - filter.days * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10);
        const { data, error } = await supabase
          .from("workout_sessions")
          .select("student_id, date")
          .gte("date", cutoffISO);
        if (error) throw error;
        return computeInactiveIds(allStudentIds, (data ?? []) as SessionRow[]);
      }

      // dropping
      const cutoffISO = new Date(Date.now() - sessionsLookbackForDropping * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      const { data, error } = await supabase
        .from("workout_sessions")
        .select("student_id, date")
        .gte("date", cutoffISO);
      if (error) throw error;
      return computeDroppingIds((data ?? []) as SessionRow[]);
    },
  });
};
