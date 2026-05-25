import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { logger } from "@/utils/logger";

type PrescriptionInsert = Database["public"]["Tables"]["workout_prescriptions"]["Insert"];
type PrescriptionRow = Database["public"]["Tables"]["workout_prescriptions"]["Row"];
type PrescriptionExerciseInsert = Database["public"]["Tables"]["prescription_exercises"]["Insert"];
type ExerciseAdaptationInsert = Database["public"]["Tables"]["exercise_adaptations"]["Insert"];

export interface CreatePrescriptionAdaptationInput {
  type: "regression_1" | "regression_2" | "regression_3";
  exercise_library_id: string;
  sets?: string;
  reps?: string;
  interval_seconds?: number;
  pse?: string;
  observations?: string;
}

export interface CreatePrescriptionExerciseInput {
  exercise_library_id: string;
  sets: string;
  reps: string;
  interval_seconds?: number;
  pse?: string;
  load?: string;
  rir?: string;
  training_method?: string;
  observations?: string;
  group_with_previous?: boolean;
  should_track?: boolean;
  adaptations?: CreatePrescriptionAdaptationInput[];
}

export interface CreatePrescriptionInput {
  name: string;
  objective?: string;
  prescription_type?: "group" | "individual";
  /**
   * Optional destination folder. `null` / omitted = root (no folder).
   * Mirrors workout_prescriptions.folder_id (FK to prescription_folders).
   */
  folder_id?: string | null;
  exercises: CreatePrescriptionExerciseInput[];
}

type AppSupabaseClient = SupabaseClient<Database>;

const buildExercisesInsertPayload = (
  prescriptionId: string,
  exercises: CreatePrescriptionExerciseInput[]
): PrescriptionExerciseInsert[] =>
  exercises.map((exercise, index) => ({
    prescription_id: prescriptionId,
    exercise_library_id: exercise.exercise_library_id,
    order_index: index,
    sets: exercise.sets,
    reps: exercise.reps,
    interval_seconds: exercise.interval_seconds ?? null,
    pse: exercise.pse ?? null,
    load: exercise.load ?? null,
    rir: exercise.rir ?? null,
    training_method: exercise.training_method ?? null,
    observations: exercise.observations ?? null,
    group_with_previous: exercise.group_with_previous ?? false,
    should_track: exercise.should_track ?? true,
  }));

const buildAdaptationsInsertPayload = (
  exercises: CreatePrescriptionExerciseInput[],
  insertedExercises: Array<{ id: string }>
): ExerciseAdaptationInsert[] => {
  const allAdaptations: ExerciseAdaptationInsert[] = [];

  exercises.forEach((exercise, index) => {
    if (!exercise.adaptations?.length || !insertedExercises[index]) return;

    for (const adaptation of exercise.adaptations) {
      allAdaptations.push({
        prescription_exercise_id: insertedExercises[index].id,
        adaptation_type: adaptation.type,
        exercise_library_id: adaptation.exercise_library_id,
        sets: adaptation.sets ?? null,
        reps: adaptation.reps ?? null,
        interval_seconds: adaptation.interval_seconds ?? null,
        pse: adaptation.pse ?? null,
        observations: adaptation.observations ?? null,
      });
    }
  });

  return allAdaptations;
};

const WORKOUT_PRESCRIPTION_SELECT =
  "id, name, objective, prescription_type, trainer_id, folder_id, order_index, created_at, updated_at";

const rollbackPrescriptionHeader = async (
  supabaseClient: AppSupabaseClient,
  prescriptionId: string
) => {
  const { error: rollbackError } = await supabaseClient
    .from("workout_prescriptions")
    .delete()
    .eq("id", prescriptionId);

  if (rollbackError) {
    logger.error("Failed to rollback partial prescription", rollbackError);
  }
};

export const createPrescriptionWithRelations = async (
  supabaseClient: AppSupabaseClient,
  trainerId: string,
  data: CreatePrescriptionInput
): Promise<PrescriptionRow> => {
  const prescriptionToInsert: PrescriptionInsert = {
    name: data.name,
    objective: data.objective ?? null,
    prescription_type: data.prescription_type ?? "group",
    folder_id: data.folder_id ?? null,
    trainer_id: trainerId,
  };

  const { data: prescription, error: prescriptionError } = await supabaseClient
    .from("workout_prescriptions")
    .insert(prescriptionToInsert)
    .select(WORKOUT_PRESCRIPTION_SELECT)
    .single();

  if (prescriptionError) throw prescriptionError;

  try {
    const exercisesToInsert = buildExercisesInsertPayload(prescription.id, data.exercises);

    const { data: insertedExercises, error: exercisesError } = await supabaseClient
      .from("prescription_exercises")
      .insert(exercisesToInsert)
      .select("id");

    if (exercisesError) throw exercisesError;

    const adaptationRows = buildAdaptationsInsertPayload(data.exercises, insertedExercises || []);
    if (adaptationRows.length > 0) {
      const { error: adaptationError } = await supabaseClient
        .from("exercise_adaptations")
        .insert(adaptationRows);
      if (adaptationError) throw adaptationError;
    }
  } catch (stepError) {
    await rollbackPrescriptionHeader(supabaseClient, prescription.id);
    throw stepError;
  }

  return prescription;
};
