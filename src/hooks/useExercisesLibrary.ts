import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { notify } from "@/lib/notify";
import i18n from "@/i18n/pt-BR.json";
import { buildErrorDescription } from "@/utils/errorParsing";
import {
  buildExercisesLibraryQueryKey,
  sanitizeExerciseFilters,
} from "./exerciseFilters";
import type { ExerciseFilters } from "./exerciseFilters";

// Re-exportar constantes do backToBasics para manter compatibilidade
export {
  MOVEMENT_PATTERNS,
  LATERALITY_OPTIONS,
  MOVEMENT_PLANES,
  CONTRACTION_TYPES,
  LEVEL_OPTIONS,
  EXERCISE_CATEGORIES,
  RISK_LEVELS,
  NUMERIC_LEVEL_SCALE,
  BOYLE_SCORE_SCALE,
  EXERCISE_DIMENSIONS,
  PATTERN_TO_CATEGORY,
  SESSION_PATTERN_GROUPS,
  STRENGTH_SUBCATEGORIES,
  POTENCIA_SUBCATEGORIES,
  CORE_ATIVACAO_SUBCATEGORIES,
  STABILITY_POSITION_OPTIONS,
  SURFACE_MODIFIER_OPTIONS,
} from "@/constants/backToBasics";

export interface ExerciseLibrary {
  id: string;
  name: string;
  movement_pattern: string | null;
  functional_group: string | null;
  laterality: string | null;
  movement_plane: string | null;
  description: string | null;
  contraction_type: string | null;
  level: string | null;
  numeric_level: number | null;
  created_at: string;
  updated_at: string;
  video_url: string | null;
  equipment_required: string[] | null;
  prerequisites: unknown | null;
  risk_level: string | null;
  category: string | null;
  subcategory: string | null;
  plyometric_phase: number | null;
  default_sets: string | null;
  default_reps: string | null;
  // Novos campos de classificação multidimensional
  boyle_score: number | null;
  axial_load: number | null;
  lumbar_demand: number | null;
  technical_complexity: number | null;
  metabolic_potential: number | null;
  knee_dominance: number | null;
  hip_dominance: number | null;
  primary_muscles: string[] | null;
  emphasis: string | null;
  stability_position: string | null;
  surface_modifier: string | null;
}

// Interface para criação (campos opcionais)
export interface CreateExerciseInput {
  name: string;
  movement_pattern?: string | null;
  laterality?: string | null;
  movement_plane?: string | null;
  description?: string | null;
  contraction_type?: string | null;
  level?: string | null;
  numeric_level?: number | null;
  video_url?: string | null;
  equipment_required?: string[] | null;
  prerequisites?: unknown | null;
  risk_level?: string | null;
  category?: string | null;
  subcategory?: string | null;
  plyometric_phase?: number | null;
  default_sets?: string | null;
  default_reps?: string | null;
  // Novos campos de classificação
  boyle_score?: number | null;
  axial_load?: number | null;
  lumbar_demand?: number | null;
  technical_complexity?: number | null;
  metabolic_potential?: number | null;
  knee_dominance?: number | null;
  hip_dominance?: number | null;
  primary_muscles?: string[] | null;
  emphasis?: string | null;
  stability_position?: string | null;
  surface_modifier?: string | null;
}

export type { ExerciseFilters } from "./exerciseFilters";

const EXERCISES_PAGE_SIZE = 1000;
const EXERCISES_MAX_PAGES = 50;
const EXERCISES_LIBRARY_SELECT = `
  id, name, movement_pattern, functional_group, laterality, movement_plane, description,
  contraction_type, level, numeric_level, created_at, updated_at, video_url,
  equipment_required, prerequisites, risk_level, category, subcategory,
  plyometric_phase, default_sets, default_reps, boyle_score, axial_load,
  lumbar_demand, technical_complexity, metabolic_potential, knee_dominance,
  hip_dominance, primary_muscles, emphasis, stability_position, surface_modifier
`;

export const useExercisesLibrary = (filters?: ExerciseFilters) => {
  const normalizedFilters = sanitizeExerciseFilters(filters);

  return useQuery({
    queryKey: ["exercises-library", buildExercisesLibraryQueryKey(normalizedFilters)],
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const allExercises: ExerciseLibrary[] = [];

      const buildPageQuery = (pageIndex: number) => {
        const from = pageIndex * EXERCISES_PAGE_SIZE;
        const to = from + EXERCISES_PAGE_SIZE - 1;

        let query = supabase
          .from("exercises_library")
          .select(EXERCISES_LIBRARY_SELECT)
          .order("name")
          .order("id")
          .range(from, to);

        if (normalizedFilters.search) {
          query = query.ilike("name", `%${normalizedFilters.search}%`);
        }
        if (normalizedFilters.movement_pattern) {
          query = query.eq("movement_pattern", normalizedFilters.movement_pattern);
        }
        if (normalizedFilters.laterality) {
          query = query.eq("laterality", normalizedFilters.laterality);
        }
        if (normalizedFilters.movement_plane) {
          query = query.eq("movement_plane", normalizedFilters.movement_plane);
        }
        if (normalizedFilters.contraction_type) {
          query = query.eq("contraction_type", normalizedFilters.contraction_type);
        }
        if (normalizedFilters.level) {
          query = query.eq("level", normalizedFilters.level);
        }
        if (normalizedFilters.category) {
          query = query.eq("category", normalizedFilters.category);
        }
        if (normalizedFilters.subcategory) {
          query = query.eq("subcategory", normalizedFilters.subcategory);
        }
        if (normalizedFilters.risk_level) {
          query = query.eq("risk_level", normalizedFilters.risk_level);
        }
        if (normalizedFilters.stability_position) {
          query = query.eq("stability_position", normalizedFilters.stability_position);
        }

        return query;
      };

      for (let pageIndex = 0; pageIndex < EXERCISES_MAX_PAGES; pageIndex += 1) {
        const { data, error } = await buildPageQuery(pageIndex);
        if (error) throw error;
        if (!data || data.length === 0) break;

        allExercises.push(...(data as ExerciseLibrary[]));
        if (data.length < EXERCISES_PAGE_SIZE) break;
      }

      return allExercises;
    },
  });
};

export const useCreateExercise = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (exercise: CreateExerciseInput) => {
      const { data, error } = await supabase
        .from("exercises_library")
        .insert(exercise as never)
        .select(EXERCISES_LIBRARY_SELECT)
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exercises-library"] });
      notify.success(i18n.modules.exercises.created);
    },
    onError: (error) => {
      notify.error(i18n.modules.exercises.errorCreate, {
        description: buildErrorDescription(error, i18n.errors.unknown),
      });
    },
  });
};

export const useUpdateExercise = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...exercise }: Partial<CreateExerciseInput> & { id: string }) => {
      const { data, error } = await supabase
        .from("exercises_library")
        .update(exercise as never)
        .eq("id", id)
        .select(EXERCISES_LIBRARY_SELECT)
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exercises-library"] });
      notify.success(i18n.modules.exercises.updated);
    },
    onError: (error) => {
      notify.error(i18n.modules.exercises.errorUpdate, {
        description: buildErrorDescription(error, i18n.errors.unknown),
      });
    },
  });
};

export const useDeleteExercise = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // Check if exercise is used in prescriptions
      const { data: prescriptionExercises, error: checkError } = await supabase
        .from("prescription_exercises")
        .select("id")
        .eq("exercise_library_id", id)
        .limit(1);

      if (checkError) throw checkError;

      if (prescriptionExercises && prescriptionExercises.length > 0) {
        throw new Error("Este exercício está sendo usado em uma ou mais prescrições e não pode ser excluído. Remova-o das prescrições primeiro.");
      }

      // Check if exercise is used in exercise adaptations
      const { data: adaptations, error: adaptError } = await supabase
        .from("exercise_adaptations")
        .select("id")
        .eq("exercise_library_id", id)
        .limit(1);

      if (adaptError) throw adaptError;

      if (adaptations && adaptations.length > 0) {
        throw new Error("Este exercício está sendo usado em adaptações de prescrições e não pode ser excluído. Remova-o das adaptações primeiro.");
      }

      const { data: sessionExercises, error: sessionExerciseError } = await supabase
        .from("exercises")
        .select("id")
        .eq("exercise_library_id", id)
        .limit(1);

      if (sessionExerciseError) throw sessionExerciseError;

      if (sessionExercises && sessionExercises.length > 0) {
        throw new Error("Este exercício já aparece em sessões registradas e não pode ser excluído sem preservar o histórico. Renomeie ou consolide em vez de excluir.");
      }

      const { data: reportTracked, error: reportTrackedError } = await supabase
        .from("report_tracked_exercises")
        .select("id")
        .eq("exercise_library_id", id)
        .limit(1);

      if (reportTrackedError) throw reportTrackedError;

      if (reportTracked && reportTracked.length > 0) {
        throw new Error("Este exercício está vinculado a relatórios gerados e não pode ser excluído sem preservar o histórico. Renomeie ou consolide em vez de excluir.");
      }

      const { error } = await supabase
        .from("exercises_library")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exercises-library"] });
      notify.success(i18n.modules.exercises.deleted);
    },
    onError: (error) => {
      notify.error(i18n.modules.exercises.errorDelete, {
        description: buildErrorDescription(error, i18n.errors.unknown),
      });
    },
  });
};
