import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/utils/logger";
import { formatSessionTime } from "@/utils/sessionTime";

interface SessionExercise {
  id: string;
  exercise_library_id: string | null;
  exercise_name: string;
  sets: number | null;
  reps: number | null;
  load_kg: number | null;
  load_description: string | null;
  load_breakdown: string | null;
  observations: string | null;
  is_best_set: boolean | null;
  created_at: string;
  exercise_library: {
    id: string;
    movement_pattern: string | null;
  } | null;
}

interface Student {
  id: string;
  name: string;
  avatar_url: string | null;
  birth_date: string | null;
}

interface SessionDetail {
  id: string;
  date: string;
  time: string;
  session_type: string;
  workout_name: string | null;
  trainer_name: string | null;
  room_name: string | null;
  is_finalized: boolean | null;
  can_reopen: boolean | null;
  prescription_id: string | null;
  student: Student;
  exercises: SessionExercise[];
}

export const useSessionDetail = (sessionId: string | null) => {
  return useQuery({
    queryKey: ["session-detail", sessionId],
    enabled: !!sessionId,
    staleTime: 2 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!sessionId) return null;

      try {
        const { data: sessionData, error: sessionError } = await supabase
          .from("workout_sessions")
          .select(`
            id,
            student_id,
            date,
            time,
            session_type,
            workout_name,
            trainer_name,
            room_name,
            is_finalized,
            can_reopen,
            prescription_id,
            student:students!student_id (
              id,
              name,
              avatar_url,
              birth_date
            ),
            exercises (
              id,
              exercise_library_id,
              exercise_name,
              sets,
              reps,
              load_kg,
              load_description,
              load_breakdown,
              observations,
              is_best_set,
              created_at,
              exercise_library:exercises_library!exercises_exercise_library_id_fkey (
                id,
                movement_pattern
              )
            )
          `)
          .eq("id", sessionId)
          .single();

        if (sessionError) {
          logger.error("Erro ao buscar sessão", sessionError);
          throw sessionError;
        }
        if (!sessionData) {
          logger.error("Sessão não encontrada", { sessionId });
          throw new Error("Sessão não encontrada");
        }

        const studentData = Array.isArray(sessionData.student)
          ? sessionData.student[0]
          : sessionData.student;
        if (!studentData) {
          logger.error("Aluno não encontrado para sessão", { sessionId, studentId: sessionData.student_id });
          throw new Error("Aluno não encontrado");
        }
        const exercisesData = Array.isArray(sessionData.exercises) ? sessionData.exercises : [];
        const sortedExercises = [...exercisesData].sort((a, b) => {
          const left = new Date(a.created_at).getTime();
          const right = new Date(b.created_at).getTime();
          return left - right;
        });

        return {
          ...sessionData,
          time: formatSessionTime(sessionData.time),
          student: studentData,
          exercises: sortedExercises,
        } as SessionDetail;
      } catch (e) {
        logger.error("Erro inesperado no carregamento de detalhes da sessão", e);
        throw e;
      }
    },
  });
};
