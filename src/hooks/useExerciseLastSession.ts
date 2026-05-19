import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  normalizeExerciseSessionName,
  type ExerciseLastSessionTarget,
} from "@/utils/exerciseSessionKeys";

export interface LastSessionData {
  load_kg: number | null;
  load_breakdown: string | null;
  reps: number | null;
  reserve_reps: string | null;
  date: string | null;
  observations: string | null;
}

const LAST_SESSION_PAGE_SIZE = 250;
const LAST_SESSION_MAX_PAGES = 40;

/**
 * Batch hook that fetches the last session data for all students × exercises
 * Returns a Map keyed by stable library id when available, with name fallback for legacy rows.
 */
export const useExerciseLastSession = (
  studentIds: string[],
  exerciseTargets: ExerciseLastSessionTarget[],
  enabled: boolean
) => {
  const stableStudentIdsKey = [...studentIds].sort().join(",");
  const stableExerciseTargetsKey = exerciseTargets
    .map((target) => target.exerciseLibraryId ?? `name:${normalizeExerciseSessionName(target.exerciseName)}`)
    .sort()
    .join(",");

  return useQuery({
    queryKey: ["exercise-last-session-batch", stableStudentIdsKey, stableExerciseTargetsKey],
    enabled: enabled && studentIds.length > 0 && exerciseTargets.length > 0,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<Map<string, LastSessionData>> => {
      const result = new Map<string, LastSessionData>();
      const targetLibraryIds = new Set(
        exerciseTargets
          .map((target) => target.exerciseLibraryId)
          .filter((id): id is string => Boolean(id))
      );
      const normalizedExerciseNames = Array.from(
        new Set(exerciseTargets.map((target) => normalizeExerciseSessionName(target.exerciseName)))
      );
      const targetNameSet = new Set(normalizedExerciseNames);
      const targetKeys = new Set(
        exerciseTargets.map((target) =>
          target.exerciseLibraryId
            ? `id:${target.exerciseLibraryId}`
            : `name:${normalizeExerciseSessionName(target.exerciseName)}`
        )
      );
      const maxPossibleMatches = studentIds.length * targetKeys.size;

      for (let pageIndex = 0; pageIndex < LAST_SESSION_MAX_PAGES; pageIndex += 1) {
        const from = pageIndex * LAST_SESSION_PAGE_SIZE;
        const to = from + LAST_SESSION_PAGE_SIZE - 1;

        // Get sessions for these students, most recent first
        const { data: sessions, error: sessionsError } = await supabase
          .from("workout_sessions")
          .select("id, student_id, date, time, created_at")
          .in("student_id", studentIds)
          .order("date", { ascending: false })
          .order("time", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, to);

        if (sessionsError) throw sessionsError;
        if (!sessions || sessions.length === 0) break;

        const sessionIds = sessions.map((session) => session.id);

        // Chunk sessionIds to avoid URL length limits (max ~300 per query)
        const CHUNK_SIZE = 300;
        const exercisesBySessionId = new Map<
          string,
          Array<{
            session_id: string;
            exercise_library_id: string | null;
            exercise_name: string;
            load_kg: number | null;
            load_breakdown: string | null;
            reps: number | null;
            reserve_reps: string | null;
            observations: string | null;
          }>
        >();

        for (let index = 0; index < sessionIds.length; index += CHUNK_SIZE) {
          const chunk = sessionIds.slice(index, index + CHUNK_SIZE);
          const { data: exercises, error: exError } = await supabase
            .from("exercises")
            .select("session_id, exercise_library_id, exercise_name, load_kg, load_breakdown, reps, reserve_reps, observations")
            .in("session_id", chunk);
          if (exError) throw exError;
          if (!exercises || exercises.length === 0) continue;

          exercises.forEach((exercise) => {
            const bucket = exercisesBySessionId.get(exercise.session_id);
            if (bucket) {
              bucket.push(exercise);
            } else {
              exercisesBySessionId.set(exercise.session_id, [exercise]);
            }
          });
        }

        if (exercisesBySessionId.size === 0) {
          if (sessions.length < LAST_SESSION_PAGE_SIZE) break;
          continue;
        }

        // Iterate sessions in recency order to guarantee first match = latest
        for (const session of sessions) {
          const sessionExercises = exercisesBySessionId.get(session.id) || [];
          for (const exercise of sessionExercises) {
            const normalizedExerciseName = normalizeExerciseSessionName(exercise.exercise_name);
            const matchesById =
              !!exercise.exercise_library_id && targetLibraryIds.has(exercise.exercise_library_id);
            const matchesByName = targetNameSet.has(normalizedExerciseName);
            if (!matchesById && !matchesByName) continue;

            const key = matchesById
              ? `${session.student_id}_id:${exercise.exercise_library_id}`
              : `${session.student_id}_name:${normalizedExerciseName}`;
            if (result.has(key)) continue;

            result.set(key, {
              load_kg: exercise.load_kg ?? null,
              load_breakdown: exercise.load_breakdown ?? null,
              reps: exercise.reps ?? null,
              reserve_reps: exercise.reserve_reps ?? null,
              date: session.date,
              observations: exercise.observations ?? null,
            });
          }
        }

        if (result.size >= maxPossibleMatches) break;
        if (sessions.length < LAST_SESSION_PAGE_SIZE) break;
      }

      return result;
    },
    staleTime: 5 * 60 * 1000,
  });
};
