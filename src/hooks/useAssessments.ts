/**
 * Hooks de leitura/escrita do módulo de avaliação Precision 12.
 *
 * Cobre as 11 tabelas criadas em
 * supabase/migrations/20260513002546_precision12_assessment_foundation.sql.
 *
 * Padrão TanStack Query igual a useStudents.ts:
 *   - useQuery pra leitura, com staleTime e invalidateQueries em mutations
 *   - useMutation com onSuccess (invalidate + toast) e onError (toast + parse)
 *   - Notify via @/lib/notify, i18n via @/i18n/pt-BR.json
 *
 * Decisões aplicadas (vide PR #116):
 *   - trainer_id é o campo canônico, professional_id é LEGACY (nullable)
 *   - sit_to_stand_results: coach insere sit_score/rise_score já descontados;
 *     supports/instabilities ficam como audit trail
 *   - DEXA upload de PDF vai pro bucket storage 'dexa-pdfs' fora deste hook
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { notify } from "@/lib/notify";
import i18n from "@/i18n/pt-BR.json";
import { buildErrorDescription } from "@/utils/errorParsing";
import type { Database, Json } from "@/integrations/supabase/types";
import type {
  Assessment,
  AssessmentType,
  CardiovascularBaseline,
  DexaResults,
  HandgripResults,
  QuestionnaireResponses,
  SitToStandResults,
  SubjectiveScores,
  Vo2AssessmentDetails,
  Vo2BikeStage,
} from "@/types/assessment";

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const ASSESSMENT_SELECT =
  "id, student_id, trainer_id, professional_id, assessment_type, assessment_date, status, started_at, completed_at, age_years, weight_kg, height_cm, sex, notes, created_at, updated_at" as const;

type PublicTables = Database["public"]["Tables"];
type TableInsert<T extends keyof PublicTables> = PublicTables[T]["Insert"];

type AssessmentInsert = TableInsert<"assessments">;
type Vo2DetailsInsert = TableInsert<"vo2_assessment_details">;
type Vo2BikeStageInsert = TableInsert<"vo2_bike_stages">;
type HandgripInsert = TableInsert<"handgrip_results">;
type DexaInsert = TableInsert<"dexa_results">;
type SitToStandInsert = TableInsert<"sit_to_stand_results">;
type CardiovascularInsert = TableInsert<"cardiovascular_baseline">;
type SubjectiveInsert = TableInsert<"subjective_scores">;

/**
 * Discriminator pra qual tabela filha vai ser criada. Espelha o
 * domínio do parâmetro `p_child_kind` da RPC `create_precision12_assessment`.
 */
type ChildKind = "vo2" | "handgrip" | "dexa" | "sit_to_stand" | "none";

const toJson = (value: unknown): Json =>
  JSON.parse(JSON.stringify(value ?? {})) as Json;

// ---------------------------------------------------------------------------
// Tipos compostos (assessment + tabela filha)
// ---------------------------------------------------------------------------

/**
 * Resultado completo da query 1-assessment-com-filha. Apenas o campo
 * correspondente ao `assessment_type` virá preenchido.
 */
export interface AssessmentWithChild {
  assessment: Assessment;
  vo2?: Vo2AssessmentDetails | null;
  bike_stages?: Vo2BikeStage[] | null;
  handgrip?: HandgripResults | null;
  dexa?: DexaResults | null;
  sit_to_stand?: SitToStandResults | null;
  questionnaire?: QuestionnaireResponses | null;
  cardiovascular?: CardiovascularBaseline | null;
  subjective?: SubjectiveScores | null;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Lista todas as avaliações de um aluno, ordenadas por data desc.
 * Não traz tabelas filhas (use useAssessment pra detalhe).
 */
export const useAssessmentsByStudent = (studentId: string | null) => {
  return useQuery({
    queryKey: ["assessments", "by-student", studentId],
    enabled: !!studentId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      if (!studentId) return [];
      const { data, error } = await supabase
        .from("assessments")
        .select(ASSESSMENT_SELECT)
        .eq("student_id", studentId)
        .order("assessment_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Assessment[];
    },
  });
};

/**
 * Carrega 1 avaliação + sua tabela filha. Retorna `null` se id inexistente.
 */
export const useAssessment = (id: string | null) => {
  return useQuery({
    queryKey: ["assessment", id],
    enabled: !!id,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<AssessmentWithChild | null> => {
      if (!id) return null;

      const { data: assessment, error } = await supabase
        .from("assessments")
        .select(ASSESSMENT_SELECT)
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;
      if (!assessment) return null;

      const type = assessment.assessment_type as AssessmentType;
      const result: AssessmentWithChild = { assessment: assessment as Assessment };

      if (
        type === "vo2_bike_max" ||
        type === "vo2_bike_submax" ||
        type === "vo2_treadmill_walk_submax" ||
        type === "vo2_treadmill_run_submax" ||
        type === "vo2_treadmill_run_max"
      ) {
        const { data: vo2, error: vo2Error } = await supabase
          .from("vo2_assessment_details")
          .select("*")
          .eq("assessment_id", id)
          .maybeSingle();
        if (vo2Error) throw vo2Error;
        result.vo2 = (vo2 as Vo2AssessmentDetails) ?? null;

        if (type === "vo2_bike_max" || type === "vo2_bike_submax") {
          const { data: stages, error: stagesError } = await supabase
            .from("vo2_bike_stages")
            .select("*")
            .eq("assessment_id", id)
            .order("stage_order", { ascending: true });
          if (stagesError) throw stagesError;
          result.bike_stages = (stages as Vo2BikeStage[]) ?? [];
        }
      } else if (type === "handgrip") {
        const { data, error: childError } = await supabase
          .from("handgrip_results")
          .select("*")
          .eq("assessment_id", id)
          .maybeSingle();
        if (childError) throw childError;
        result.handgrip = (data as HandgripResults) ?? null;
      } else if (type === "dexa") {
        const { data, error: childError } = await supabase
          .from("dexa_results")
          .select("*")
          .eq("assessment_id", id)
          .maybeSingle();
        if (childError) throw childError;
        result.dexa = (data as DexaResults) ?? null;
      } else if (type === "sit_to_stand") {
        const { data, error: childError } = await supabase
          .from("sit_to_stand_results")
          .select("*")
          .eq("assessment_id", id)
          .maybeSingle();
        if (childError) throw childError;
        result.sit_to_stand = (data as unknown as SitToStandResults) ?? null;
      } else if (type === "questionnaire_precision12") {
        const { data, error: childError } = await supabase
          .from("questionnaire_responses")
          .select("*")
          .eq("assessment_id", id)
          .maybeSingle();
        if (childError) throw childError;
        result.questionnaire = (data as QuestionnaireResponses) ?? null;
      }

      const [{ data: cv, error: cvError }, { data: subj, error: subjError }] =
        await Promise.all([
          supabase
            .from("cardiovascular_baseline")
            .select("*")
            .eq("assessment_id", id)
            .maybeSingle(),
          supabase
            .from("subjective_scores")
            .select("*")
            .eq("assessment_id", id)
            .order("recorded_at", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);
      if (cvError) throw cvError;
      if (subjError) throw subjError;
      result.cardiovascular = (cv as CardiovascularBaseline) ?? null;
      result.subjective = (subj as SubjectiveScores) ?? null;

      return result;
    },
  });
};

// ---------------------------------------------------------------------------
// Mutation payloads (omitem generated columns + audit cols)
// ---------------------------------------------------------------------------

export type CreateAssessmentInput = Omit<
  AssessmentInsert,
  | "id"
  | "created_at"
  | "updated_at"
  | "trainer_id"
  | "professional_id"
  | "started_at"
  | "completed_at"
>;

export interface CreateAssessmentArgs {
  parent: CreateAssessmentInput;
  child:
    | {
        kind: "vo2";
        data: Omit<Vo2DetailsInsert, "assessment_id">;
        stages?: Omit<Vo2BikeStageInsert, "id" | "assessment_id">[];
      }
    | {
        kind: "handgrip";
        data: Omit<HandgripInsert, "assessment_id" | "best_kg">;
      }
    | {
        kind: "dexa";
        data: Omit<DexaInsert, "assessment_id">;
      }
    | {
        kind: "sit_to_stand";
        data: Omit<SitToStandInsert, "assessment_id" | "total_score">;
      }
    | { kind: "questionnaire"; data: never }
    | { kind: "none" };
  cardiovascular?: Omit<CardiovascularInsert, "assessment_id">;
  subjective?: Omit<
    SubjectiveInsert,
    "id" | "student_id" | "assessment_id" | "created_at"
  >;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Cria 1 avaliação completa de forma atômica: row mãe + tabela filha +
 * (opcional) cardiovascular_baseline + subjective_scores.
 *
 * A transação vive no Postgres via RPC `create_precision12_assessment`.
 * Se qualquer insert filho falhar, a assessment mãe também é rollbackada.
 */
export const useCreateAssessment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: CreateAssessmentArgs) => {
      if (args.child.kind === "questionnaire") {
        throw new Error("Questionário Precision 12 deve ser criado pelo link mágico");
      }

      const childData = args.child.kind === "none" ? {} : args.child.data;
      const bikeStages = args.child.kind === "vo2" ? args.child.stages ?? [] : [];

      const childKind: ChildKind = args.child.kind;

      const { data, error } = await supabase.rpc("create_precision12_assessment", {
        p_parent: toJson(args.parent),
        p_child_kind: childKind,
        p_child_data: toJson(childData),
        p_bike_stages: toJson(bikeStages),
        p_cardiovascular: args.cardiovascular ? toJson(args.cardiovascular) : undefined,
        p_subjective: args.subjective ? toJson(args.subjective) : undefined,
      });

      if (error) throw error;
      if (!data) throw new Error("Falha ao criar avaliação");

      return data as Assessment;
    },
    onSuccess: (assessment) => {
      queryClient.invalidateQueries({ queryKey: ["assessment", assessment.id] });
      queryClient.invalidateQueries({
        queryKey: ["assessments", "by-student", assessment.student_id],
      });
      queryClient.invalidateQueries({ queryKey: ["student", assessment.student_id] });
      notify.success("Avaliação registrada com sucesso");
    },
    onError: (error: Error) => {
      notify.error("Erro ao registrar avaliação", {
        description: buildErrorDescription(error, i18n.errors.unknown),
      });
    },
  });
};

/**
 * Atualiza status / notes da row mãe. Edição completa de filhas vai em
 * mutations específicas quando E2.5+ pedir edição.
 */
export const useUpdateAssessment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: {
      id: string;
      patch: Partial<Pick<Assessment, "status" | "notes" | "assessment_date">>;
    }) => {
      const { data, error } = await supabase
        .from("assessments")
        .update(args.patch)
        .eq("id", args.id)
        .select(ASSESSMENT_SELECT)
        .single();
      if (error) throw error;
      return data as Assessment;
    },
    onSuccess: (assessment) => {
      queryClient.invalidateQueries({ queryKey: ["assessment", assessment.id] });
      queryClient.invalidateQueries({
        queryKey: ["assessments", "by-student", assessment.student_id],
      });
      queryClient.invalidateQueries({ queryKey: ["student", assessment.student_id] });
      notify.success("Avaliação atualizada");
    },
    onError: (error: Error) => {
      notify.error("Erro ao atualizar avaliação", {
        description: buildErrorDescription(error, i18n.errors.unknown),
      });
    },
  });
};

/**
 * Hard delete da row mãe — cascade nas filhas via FK ON DELETE CASCADE.
 * UI deve confirmar com dialog antes de chamar.
 */
export const useDeleteAssessment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: { id: string; studentId: string }) => {
      const { error } = await supabase
        .from("assessments")
        .delete()
        .eq("id", args.id);
      if (error) throw error;
      return args;
    },
    onSuccess: (args) => {
      queryClient.invalidateQueries({ queryKey: ["assessment", args.id] });
      queryClient.invalidateQueries({
        queryKey: ["assessments", "by-student", args.studentId],
      });
      queryClient.invalidateQueries({ queryKey: ["student", args.studentId] });
      notify.success("Avaliação removida");
    },
    onError: (error: Error) => {
      notify.error("Erro ao remover avaliação", {
        description: buildErrorDescription(error, i18n.errors.unknown),
      });
    },
  });
};
