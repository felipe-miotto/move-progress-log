import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ExerciseLoadHistoryItem {
  studentId: string;
  studentName: string;
  lastLoadKg: number | null;
  lastLoadDescription: string | null;
  lastDate: string | null;
  lastObservations: string | null;
}

interface ExerciseLookupRow {
  session_id: string;
  exercise_library_id: string | null;
  exercise_name: string | null;
  load_kg: number | null;
  load_description: string | null;
  observations: string | null;
  created_at: string | null;
  workout_sessions:
    | {
        student_id: string;
        date: string;
        time: string;
      }
    | {
        student_id: string;
        date: string;
        time: string;
      }[]
    | null;
}

interface UseExerciseLoadHistoryParams {
  exerciseName: string;
  exerciseLibraryId?: string | null;
  prescriptionId: string;
  enabled: boolean;
}

const normalizeComparableText = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ");

export const useExerciseLoadHistory = ({
  exerciseName,
  exerciseLibraryId,
  prescriptionId,
  enabled,
}: UseExerciseLoadHistoryParams) => {
  return useQuery({
    queryKey: ["exercise-load-history", exerciseLibraryId ?? null, exerciseName, prescriptionId],
    enabled: enabled && !!exerciseName && !!prescriptionId,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<ExerciseLoadHistoryItem[]> => {
      // 1. Get assigned students via prescription_assignments + students
      const { data: assignments, error: assignError } = await supabase
        .from("prescription_assignments")
        .select("student_id, students(id, name)")
        .eq("prescription_id", prescriptionId);

      if (assignError) throw assignError;
      if (!assignments || assignments.length === 0) return [];

      const studentIds = [...new Set(assignments.map((a) => a.student_id))];
      const studentMap = new Map(
        assignments.map((a) => [
          a.student_id,
          (a.students as { name: string } | null)?.name || "—",
        ])
      );

      const targetName = normalizeComparableText(exerciseName);
      const matchesTargetExercise = (candidate: string | null): boolean => {
        if (!candidate) return false;
        const normalizedCandidate = normalizeComparableText(candidate);
        return (
          normalizedCandidate === targetName ||
          normalizedCandidate.includes(targetName) ||
          targetName.includes(normalizedCandidate)
        );
      };

      type LastExerciseEntry = {
        exercise: ExerciseLookupRow;
        date: string | null;
        sortTs: number;
      };
      const lastExerciseByStudent = new Map<string, LastExerciseEntry>();

      const mergeRows = (rows: ExerciseLookupRow[], options: { requireNameMatch: boolean }) => {
        for (const exercise of rows) {
          if (options.requireNameMatch && !matchesTargetExercise(exercise.exercise_name)) continue;

          const session = Array.isArray(exercise.workout_sessions)
            ? exercise.workout_sessions[0]
            : exercise.workout_sessions;
          if (!session?.student_id) continue;

          const sessionTs = Date.parse(`${session.date}T${session.time}`);
          const createdAtTs = exercise.created_at ? Date.parse(exercise.created_at) : Number.NaN;
          const sortTs = Number.isFinite(sessionTs)
            ? sessionTs
            : Number.isFinite(createdAtTs)
              ? createdAtTs
              : 0;

          const existing = lastExerciseByStudent.get(session.student_id);
          if (!existing || sortTs > existing.sortTs) {
            lastExerciseByStudent.set(session.student_id, {
              exercise,
              date: session.date ?? null,
              sortTs,
            });
          }
        }
      };

      const baseSelect = `
        session_id,
        exercise_library_id,
        exercise_name,
        load_kg,
        load_description,
        observations,
        created_at,
        workout_sessions!inner (
          student_id,
          date,
          time
        )
      `;

      // 2. Prefer the stable library id for rows written after/backfilled by the migration.
      if (exerciseLibraryId) {
        const { data: idMatches, error: idError } = await supabase
          .from("exercises")
          .select(baseSelect)
          .in("workout_sessions.student_id", studentIds)
          .eq("exercise_library_id", exerciseLibraryId)
          .order("created_at", { ascending: false });

        if (idError) throw idError;
        mergeRows((idMatches || []) as ExerciseLookupRow[], { requireNameMatch: false });
      }

      // 3. Fallback by normalized name for historical rows that could not be linked safely.
      const studentsNeedingFallback = studentIds.filter((studentId) => !lastExerciseByStudent.has(studentId));
      if (studentsNeedingFallback.length > 0) {
        const { data: nameMatches, error: nameError } = await supabase
          .from("exercises")
          .select(baseSelect)
          .in("workout_sessions.student_id", studentsNeedingFallback)
          .ilike("exercise_name", `%${exerciseName}%`)
          .order("created_at", { ascending: false });

        if (nameError) throw nameError;
        mergeRows((nameMatches || []) as ExerciseLookupRow[], { requireNameMatch: true });
      }

      // 4. Build one entry per assigned student
      const results: ExerciseLoadHistoryItem[] = [];
      for (const studentId of studentIds) {
        const latest = lastExerciseByStudent.get(studentId);
        const studentExercise = latest?.exercise ?? null;

        results.push({
          studentId,
          studentName: studentMap.get(studentId) || "—",
          lastLoadKg: studentExercise?.load_kg ?? null,
          lastLoadDescription: studentExercise?.load_description ?? null,
          lastDate: latest?.date ?? null,
          lastObservations: studentExercise?.observations ?? null,
        });
      }

      return results;
    },
    staleTime: 5 * 60 * 1000,
  });
};
