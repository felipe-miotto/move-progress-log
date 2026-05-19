import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { notify } from "@/lib/notify";
import i18n from "@/i18n/pt-BR.json";
import { buildErrorDescription } from "@/utils/errorParsing";
import { formatSessionTime } from "@/utils/sessionTime";
import { logger } from "@/utils/logger";
import { invalidateSessionQueries } from "@/hooks/sessionQueryInvalidation";

// Chaves i18n disponíveis para workouts
const workoutKeys = i18n.modules.workouts;

export interface WorkoutSession {
  id: string;
  student_id: string;
  date: string;
  time: string;
  session_type: 'individual' | 'group';
  workout_name?: string;
  room_name?: string;
  trainer_name?: string;
  is_finalized?: boolean;
  can_reopen?: boolean;
  prescription_id?: string;
  created_at: string;
  updated_at: string;
}

export interface Exercise {
  id: string;
  session_id: string;
  exercise_library_id?: string | null;
  exercise_name: string;
  sets?: number;
  reps?: number;
  reserve_reps?: string;
  load_kg?: number;
  load_description?: string;
  load_breakdown?: string;
  observations?: string;
  created_at: string;
}

type WorkoutSessionRow = Database["public"]["Tables"]["workout_sessions"]["Row"];
type ExerciseRow = Database["public"]["Tables"]["exercises"]["Row"];
type ExerciseInsert = Database["public"]["Tables"]["exercises"]["Insert"];
type SessionExercisePayload = {
  exercise_library_id?: string | null;
  exercise_name: string;
  sets?: number | null;
  reps?: number | null;
  reserve_reps?: string | null;
  load_kg?: number | null;
  load_description?: string | null;
  load_breakdown?: string | null;
  observations?: string | null;
};
type GroupSessionCreationResult = {
  student: string;
  success: boolean;
  session_id?: string;
  error?: string;
};

const WORKOUT_SESSION_SELECT =
  "id, student_id, date, time, session_type, workout_name, room_name, trainer_name, is_finalized, can_reopen, prescription_id, created_at, updated_at";

const STUDENT_WORKOUT_PAGE_SIZE = 200;
const STUDENT_WORKOUT_MAX_PAGES = 30;

const mapWorkoutSession = (row: WorkoutSessionRow): WorkoutSession => ({
  id: row.id,
  student_id: row.student_id,
  date: row.date,
  time: formatSessionTime(row.time),
  session_type: row.session_type === "group" ? "group" : "individual",
  workout_name: row.workout_name ?? undefined,
  room_name: row.room_name ?? undefined,
  trainer_name: row.trainer_name ?? undefined,
  is_finalized: row.is_finalized ?? undefined,
  can_reopen: row.can_reopen ?? undefined,
  prescription_id: row.prescription_id ?? undefined,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

const mapExercise = (row: ExerciseRow): Exercise => ({
  id: row.id,
  session_id: row.session_id,
  exercise_library_id: row.exercise_library_id,
  exercise_name: row.exercise_name,
  sets: row.sets ?? undefined,
  reps: row.reps ?? undefined,
  reserve_reps: row.reserve_reps ?? undefined,
  load_kg: row.load_kg ?? undefined,
  load_description: row.load_description ?? undefined,
  load_breakdown: row.load_breakdown ?? undefined,
  observations: row.observations ?? undefined,
  created_at: row.created_at,
});

const isMissingRpcFunctionError = (error: unknown, functionName: string): boolean => {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  const code = typeof record.code === "string" ? record.code : "";
  const message = buildErrorDescription(error).toLowerCase();

  return (
    code === "PGRST202" ||
    message.includes(`could not find the function public.${functionName}`.toLowerCase()) ||
    message.includes("function") && message.includes("does not exist")
  );
};

const assertExercisesHaveLibraryIds = (exercises: SessionExercisePayload[]) => {
  const unlinkedExercise = exercises.find((exercise) => !exercise.exercise_library_id);
  if (!unlinkedExercise) return;

  throw new Error(
    `Selecione um exercício cadastrado para "${unlinkedExercise.exercise_name || "exercício sem nome"}".`
  );
};

const mapExercisesToInsert = (
  sessionId: string,
  exercises: SessionExercisePayload[]
): ExerciseInsert[] =>
  exercises.map((exercise) => ({
    session_id: sessionId,
    exercise_library_id: exercise.exercise_library_id ?? null,
    exercise_name: exercise.exercise_name,
    sets: exercise.sets ?? null,
    reps: exercise.reps ?? null,
    reserve_reps: exercise.reserve_reps ?? null,
    load_kg: exercise.load_kg ?? null,
    load_description: exercise.load_description ?? null,
    load_breakdown: exercise.load_breakdown ?? null,
    observations: exercise.observations ?? null,
  }));

const createSessionWithDirectInsert = async (params: {
  student_id: string;
  date: string;
  time: string;
  session_type: "individual" | "group";
  prescription_id?: string;
  exercises: SessionExercisePayload[];
}) => {
  assertExercisesHaveLibraryIds(params.exercises);

  const { data: session, error: sessionError } = await supabase
    .from("workout_sessions")
    .insert({
      student_id: params.student_id,
      date: params.date,
      time: params.time,
      session_type: params.session_type,
      prescription_id: params.prescription_id ?? null,
      is_finalized: params.session_type === "group" ? true : null,
      can_reopen: params.session_type === "group" ? true : null,
    })
    .select(WORKOUT_SESSION_SELECT)
    .single();

  if (sessionError) throw sessionError;

  try {
    const exercisesToInsert = mapExercisesToInsert(session.id, params.exercises);
    if (exercisesToInsert.length > 0) {
      const { error: exercisesError } = await supabase
        .from("exercises")
        .insert(exercisesToInsert);
      if (exercisesError) throw exercisesError;
    }
  } catch (stepError) {
    const { error: rollbackError } = await supabase
      .from("workout_sessions")
      .delete()
      .eq("id", session.id);
    if (rollbackError) {
      logger.error("[useCreateSessionWithExercises] Failed to rollback workout_session", rollbackError);
    }
    throw stepError;
  }

  return session;
};

export const useWorkoutSessions = (studentId?: string) => {
  return useQuery({
    queryKey: ["workout-sessions", studentId],
    staleTime: 2 * 60 * 1000,
    gcTime: 20 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (studentId) {
        const allStudentSessions: WorkoutSessionRow[] = [];

        for (let pageIndex = 0; pageIndex < STUDENT_WORKOUT_MAX_PAGES; pageIndex += 1) {
          const from = pageIndex * STUDENT_WORKOUT_PAGE_SIZE;
          const to = from + STUDENT_WORKOUT_PAGE_SIZE - 1;

          const { data, error } = await supabase
            .from("workout_sessions")
            .select(WORKOUT_SESSION_SELECT)
            .eq("student_id", studentId)
            .order("date", { ascending: false })
            .order("time", { ascending: false })
            .order("id", { ascending: false })
            .range(from, to);

          if (error) throw error;
          if (!data || data.length === 0) break;

          allStudentSessions.push(...(data as WorkoutSessionRow[]));
          if (data.length < STUDENT_WORKOUT_PAGE_SIZE) break;
        }

        return allStudentSessions.map(mapWorkoutSession);
      }

      const { data, error } = await supabase
        .from("workout_sessions")
        .select(WORKOUT_SESSION_SELECT)
        .order("date", { ascending: false })
        .order("time", { ascending: false })
        .limit(500);

      if (error) throw error;
      return (data || []).map(mapWorkoutSession);
    },
  });
};

export const useSessionExercises = (sessionId: string | null) => {
  return useQuery({
    queryKey: ["session-exercises", sessionId],
    enabled: !!sessionId,
    staleTime: 2 * 60 * 1000,
    gcTime: 20 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!sessionId) return [];

      const { data, error } = await supabase
        .from("exercises")
        .select("id, session_id, exercise_library_id, exercise_name, sets, reps, reserve_reps, load_kg, load_description, load_breakdown, observations, created_at")
        .eq("session_id", sessionId)
        .order("created_at");

      if (error) throw error;
      return (data || []).map(mapExercise);
    },
  });
};

export const useCreateWorkoutSession = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      student_id: string;
      date: string;
      time: string;
      silent?: boolean;
      exercises: Array<{
        exercise_library_id?: string | null;
        exercise_name: string;
        sets?: number;
        reps?: number;
        reserve_reps?: string;
        load_kg?: number;
        load_description?: string;
        load_breakdown?: string;
        observations?: string;
      }>;
    }) => {
      const exercisesPayload = data.exercises.map((ex) => ({
        exercise_library_id: ex.exercise_library_id ?? null,
        exercise_name: ex.exercise_name,
        sets: ex.sets ?? null,
        reps: ex.reps ?? null,
        reserve_reps: ex.reserve_reps ?? null,
        load_kg: ex.load_kg ?? null,
        load_description: ex.load_description ?? null,
        load_breakdown: ex.load_breakdown ?? null,
        observations: ex.observations ?? null,
      }));
      assertExercisesHaveLibraryIds(exercisesPayload);

      const { data: createdSession, error } = await (supabase.rpc as CallableFunction)(
        "create_workout_session_with_exercises",
        {
          p_student_id: data.student_id,
          p_date: data.date,
          p_time: data.time,
          p_session_type: "individual",
          p_exercises: exercisesPayload,
        }
      );

      if (error) {
        if (isMissingRpcFunctionError(error, "create_workout_session_with_exercises")) {
          const session = await createSessionWithDirectInsert({
            student_id: data.student_id,
            date: data.date,
            time: data.time,
            session_type: "individual",
            exercises: exercisesPayload,
          });
          return mapWorkoutSession(session as WorkoutSessionRow);
        }
        throw error;
      }

      const sessionRow = (Array.isArray(createdSession)
        ? createdSession[0]
        : createdSession) as WorkoutSessionRow | null;
      if (!sessionRow) {
        throw new Error("Falha ao criar sessão");
      }

      return mapWorkoutSession(sessionRow);
    },
    onSuccess: (_, variables) => {
      if (variables.silent) {
        return;
      }

      void invalidateSessionQueries(queryClient, {
        includeStudentsData: true,
        studentId: variables.student_id,
      });

      notify.success(workoutKeys.sessionCreated, {
        description: workoutKeys.sessionSaved,
      });
    },
    onError: (error: unknown, variables) => {
      if (!variables?.silent) {
        notify.error(workoutKeys.errorSession, {
          description: buildErrorDescription(error) || i18n.errors.unknown,
        });
      }
    },
  });
};

export const useCreateGroupWorkoutSessions = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      prescriptionId: string;
      date: string;
      time: string;
      sessions: Array<{
        student_id: string;
        student_name: string;
        exercises: Array<{
          prescribed_exercise_name?: string | null;
          executed_exercise_name: string;
          exercise_library_id?: string | null;
          sets?: number | null;
          prescribed_sets?: number;
          reps: number;
          reserve_reps?: string | null;
          load_kg?: number | null;
          load_breakdown: string;
          observations?: string | null;
          is_best_set: boolean;
        }>;
      }>;
    }) => {
      const results: GroupSessionCreationResult[] = [];
      
      for (const session of data.sessions) {
        try {
          const exercisesPayload = session.exercises.map((ex) => {
            const finalSets = ex.sets !== null && ex.sets !== undefined 
              ? ex.sets 
              : ex.prescribed_sets;
            
            let finalObservations = ex.observations || "";
            
            if (ex.prescribed_exercise_name && 
                ex.prescribed_exercise_name !== ex.executed_exercise_name) {
              const adaptationNote = `Adaptação: ${ex.executed_exercise_name} substituindo ${ex.prescribed_exercise_name}`;
              finalObservations = finalObservations 
                ? `${adaptationNote}. ${finalObservations}`
                : adaptationNote;
            }
            
            return {
              exercise_name: ex.executed_exercise_name,
              exercise_library_id: ex.exercise_library_id ?? null,
              sets: finalSets,
              reps: ex.reps,
              reserve_reps: ex.reserve_reps ?? null,
              load_kg: ex.load_kg,
              load_breakdown: ex.load_breakdown,
              observations: finalObservations || null,
            };
          });
          assertExercisesHaveLibraryIds(exercisesPayload);

          const { data: createdSession, error: creationError } = await (supabase.rpc as CallableFunction)(
            "create_group_workout_session_with_exercises",
            {
              p_student_id: session.student_id,
              p_prescription_id: data.prescriptionId,
              p_date: data.date,
              p_time: data.time,
              p_exercises: exercisesPayload,
            }
          );

          if (creationError) {
            if (isMissingRpcFunctionError(creationError, "create_group_workout_session_with_exercises")) {
              const fallbackSession = await createSessionWithDirectInsert({
                student_id: session.student_id,
                date: data.date,
                time: data.time,
                session_type: "group",
                prescription_id: data.prescriptionId,
                exercises: exercisesPayload,
              });

              results.push({
                student: session.student_name,
                success: true,
                session_id: fallbackSession.id,
              });
              continue;
            }
            throw creationError;
          }

          const sessionRow = Array.isArray(createdSession)
            ? (createdSession as Record<string, unknown>[])[0]
            : createdSession;

          if (!sessionRow) {
            throw new Error("Falha ao criar sessão de grupo");
          }
          
          results.push({ 
            student: session.student_name, 
            success: true,
            session_id: sessionRow.id,
          });
          
        } catch (error) {
          const description = buildErrorDescription(error);
          results.push({ 
            student: session.student_name, 
            success: false, 
            error: description || 'Unknown error'
          });
        }
      }

      const successCount = results.filter(r => r.success).length;
      if (successCount === 0) {
        throw new Error("Nenhuma sessão foi criada com sucesso");
      }

      return results;
    },
    onSuccess: (results) => {
      void invalidateSessionQueries(queryClient, {
        includeStudentsData: true,
      });
      
      const successResults = results.filter(r => r.success);
      const failedResults = results.filter(r => !r.success);
      
      if (successResults.length > 0) {
        notify.success(`${successResults.length} ${workoutKeys.groupSessionsCreated}`, {
          description: `${workoutKeys.savedFor}: ${successResults.map(r => r.student).join(", ")}`,
        });
      }
      
      if (failedResults.length > 0) {
        notify.error(`${failedResults.length} ${workoutKeys.recordingsFailed}`, {
          description: `${workoutKeys.errorFor}: ${failedResults.map(r => r.student).join(", ")}`,
        });
      }
    },
    onError: (error) => {
      notify.error(workoutKeys.errorGroupSessions, {
        description: buildErrorDescription(error) || i18n.errors.unknown,
      });
    },
  });
};

export const useReopenWorkoutSession = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      // INC-004: removed manual updated_at — handled by DB trigger
      const { data, error } = await supabase
        .from("workout_sessions")
        .update({ 
          is_finalized: false,
        })
        .eq("id", sessionId)
        .select(WORKOUT_SESSION_SELECT)
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void invalidateSessionQueries(queryClient);
      
      notify.success("Sessão reaberta com sucesso", {
        description: "Você pode continuar editando esta sessão",
      });
    },
    onError: (error) => {
      notify.error("Erro ao reabrir sessão", {
        description: buildErrorDescription(error) || "Erro desconhecido",
      });
    },
  });
};

export const useFinalizeWorkoutSession = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      const { data, error } = await supabase
        .from("workout_sessions")
        .update({ 
          is_finalized: true,
        })
        .eq("id", sessionId)
        .select(WORKOUT_SESSION_SELECT)
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void invalidateSessionQueries(queryClient);
      
      notify.success("Sessão finalizada", {
        description: "A sessão foi salva e finalizada com sucesso",
      });
    },
    onError: (error) => {
      notify.error("Erro ao finalizar sessão", {
        description: buildErrorDescription(error) || "Erro desconhecido",
      });
    },
  });
};
