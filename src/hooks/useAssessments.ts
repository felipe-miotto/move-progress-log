/**
 * Hooks de leitura/escrita do módulo de avaliação Precision 12.
 *
 * Cobre as 11 tabelas criadas em
 * supabase/migrations/20260513002546_precision12_assessment_foundation.sql:
 *
 *   assessments (mãe)
 *   ├─ vo2_assessment_details + vo2_bike_stages
 *   ├─ handgrip_results
 *   ├─ dexa_results
 *   ├─ sit_to_stand_results
 *   ├─ cardiovascular_baseline
 *   ├─ subjective_scores
 *   └─ questionnaire_responses
 *
 *   student_external_professionals (separada, FK com students)
 *   precision_reports (separada, gerada em E6/E7)
 *
 * Padrão TanStack Query igual a useStudents.ts:
 *   • useQuery pra leitura, com staleTime e invalidateQueries em mutations
 *   • useMutation com onSuccess (invalidate + toast) e onError (toast + parse)
 *   • Notify via @/lib/notify, i18n via @/i18n/pt-BR.json
 *
 * Decisões aplicadas (vide PR #116 e memory Section 8):
 *   • trainer_id é o campo canônico, professional_id é LEGACY (nullable)
 *   • sit_to_stand_results: coach insere sit_score/rise_score já descontados;
 *     supports/instabilities ficam como audit trail
 *   • DEXA upload de PDF vai pro bucket storage 'dexa-pdfs' (não está neste
 *     hook — é responsabilidade do DexaForm via supabase.storage)
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { notify } from "@/lib/notify";
import i18n from "@/i18n/pt-BR.json";
import { buildErrorDescription } from "@/utils/errorParsing";
import type {
  Assessment,
  AssessmentType,
  CardiovascularBaseline,
  DexaResults,
  HandgripResults,
  SitToStandResults,
  SubjectiveScores,
  Vo2AssessmentDetails,
  Vo2BikeStage,
} from "@/types/assessment";

// ────────────────────────────────────────────────────────────────────────────
// Constantes
// ────────────────────────────────────────────────────────────────────────────

const ASSESSMENT_SELECT =
  "id, student_id, trainer_id, professional_id, assessment_type, " +
  "assessment_date, status, started_at, completed_at, " +
  "age_years, weight_kg, height_cm, sex, notes, created_at, updated_at";

// ────────────────────────────────────────────────────────────────────────────
// Tipos compostos (assessment + tabela filha)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Resultado completo da query 1-assessment-com-filha. Apenas o campo
 * correspondente ao `assessment_type` virá preenchido — os outros são
 * nulos. Discrimine por `assessment.assessment_type` antes de usar.
 */
export interface AssessmentWithChild {
  assessment: Assessment;
  vo2?: Vo2AssessmentDetails | null;
  bike_stages?: Vo2BikeStage[] | null;
  handgrip?: HandgripResults | null;
  dexa?: DexaResults | null;
  sit_to_stand?: SitToStandResults | null;
  cardiovascular?: CardiovascularBaseline | null;
  subjective?: SubjectiveScores | null;
}

// ────────────────────────────────────────────────────────────────────────────
// Queries
// ────────────────────────────────────────────────────────────────────────────

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

      // Discrimina e carrega tabela filha apropriada
      if (
        type === "vo2_bike_max" ||
        type === "vo2_bike_submax" ||
        type === "vo2_treadmill_walk_submax" ||
        type === "vo2_treadmill_run_submax" ||
        type === "vo2_treadmill_run_max"
      ) {
        const { data: vo2 } = await supabase
          .from("vo2_assessment_details")
          .select("*")
          .eq("assessment_id", id)
          .maybeSingle();
        result.vo2 = (vo2 as Vo2AssessmentDetails) ?? null;

        if (type === "vo2_bike_max" || type === "vo2_bike_submax") {
          const { data: stages } = await supabase
            .from("vo2_bike_stages")
            .select("*")
            .eq("assessment_id", id)
            .order("stage_number", { ascending: true });
          result.bike_stages = (stages as Vo2BikeStage[]) ?? null;
        }
      } else if (type === "handgrip") {
        const { data } = await supabase
          .from("handgrip_results")
          .select("*")
          .eq("assessment_id", id)
          .maybeSingle();
        result.handgrip = (data as HandgripResults) ?? null;
      } else if (type === "dexa") {
        const { data } = await supabase
          .from("dexa_results")
          .select("*")
          .eq("assessment_id", id)
          .maybeSingle();
        result.dexa = (data as DexaResults) ?? null;
      } else if (type === "sit_to_stand") {
        const { data } = await supabase
          .from("sit_to_stand_results")
          .select("*")
          .eq("assessment_id", id)
          .maybeSingle();
        result.sit_to_stand = (data as SitToStandResults) ?? null;
      }

      // Cardiovascular baseline + subjective scores são opcionais
      // em qualquer assessment — carrega se existirem
      const [{ data: cv }, { data: subj }] = await Promise.all([
        supabase
          .from("cardiovascular_baseline")
          .select("*")
          .eq("assessment_id", id)
          .maybeSingle(),
        supabase
          .from("subjective_scores")
          .select("*")
          .eq("assessment_id", id)
          .maybeSingle(),
      ]);
      result.cardiovascular = (cv as CardiovascularBaseline) ?? null;
      result.subjective = (subj as SubjectiveScores) ?? null;

      return result;
    },
  });
};

// ────────────────────────────────────────────────────────────────────────────
// Mutation payloads (omitem generated columns + audit cols)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Payload de criação da row mãe. Omite `id`, `created_at`, `updated_at`,
 * `trainer_id` (vem do auth.uid()), `professional_id` (LEGACY, preenchido
 * com trainer_id pra compat).
 */
export type CreateAssessmentInput = Omit<
  Assessment,
  | "id"
  | "created_at"
  | "updated_at"
  | "trainer_id"
  | "professional_id"
  | "started_at"
  | "completed_at"
>;

/**
 * Args do useCreateAssessment: row mãe + payload da tabela filha
 * tipado de acordo com o assessment_type.
 */
export interface CreateAssessmentArgs {
  parent: CreateAssessmentInput;
  child:
    | { kind: "vo2"; data: Omit<Vo2AssessmentDetails, "assessment_id">; stages?: Omit<Vo2BikeStage, "id" | "assessment_id" | "created_at">[] }
    | { kind: "handgrip"; data: Omit<HandgripResults, "assessment_id" | "best_kg"> }
    | { kind: "dexa"; data: Omit<DexaResults, "assessment_id"> }
    | { kind: "sit_to_stand"; data: Omit<SitToStandResults, "assessment_id" | "total_score"> }
    | { kind: "questionnaire"; data: never }
    | { kind: "none" };
  cardiovascular?: Omit<CardiovascularBaseline, "assessment_id">;
  subjective?: Omit<SubjectiveScores, "assessment_id">;
}

// ────────────────────────────────────────────────────────────────────────────
// Mutations
// ────────────────────────────────────────────────────────────────────────────

/**
 * Cria 1 avaliação completa: row mãe + tabela filha + (opcional)
 * cardiovascular_baseline + subjective_scores.
 *
 * NOTA: não é transação real (Supabase JS não suporta), mas inserts são
 * sequenciais. Se a filha falhar após a mãe ter sido criada, fica um
 * registro órfão — UI deve oferecer "tentar novamente" ou apagar.
 * Em produção, considerar mover essa orquestração pra edge function
 * em ciclo posterior.
 */
export const useCreateAssessment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: CreateAssessmentArgs) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // 1. Cria row mãe
      const parentInsert = {
        ...args.parent,
        trainer_id: user.id,
        // LEGACY: preenche professional_id com mesmo trainer_id pra rows
        // novas. Schema nullable então não obrigatório, mas mantém
        // consistência com queries antigas.
        professional_id: user.id,
      };

      const { data: assessment, error: parentError } = await supabase
        .from("assessments")
        .insert(parentInsert)
        .select(ASSESSMENT_SELECT)
        .single();

      if (parentError) throw parentError;
      if (!assessment) throw new Error("Falha ao criar avaliação");

      const assessmentId = (assessment as Assessment).id;

      // 2. Cria tabela filha conforme kind
      if (args.child.kind === "vo2") {
        const { error: vo2Error } = await supabase
          .from("vo2_assessment_details")
          .insert({ ...args.child.data, assessment_id: assessmentId });
        if (vo2Error) throw vo2Error;

        if (args.child.stages && args.child.stages.length > 0) {
          const { error: stagesError } = await supabase
            .from("vo2_bike_stages")
            .insert(
              args.child.stages.map((s) => ({ ...s, assessment_id: assessmentId })),
            );
          if (stagesError) throw stagesError;
        }
      } else if (args.child.kind === "handgrip") {
        const { error } = await supabase
          .from("handgrip_results")
          .insert({ ...args.child.data, assessment_id: assessmentId });
        if (error) throw error;
      } else if (args.child.kind === "dexa") {
        const { error } = await supabase
          .from("dexa_results")
          .insert({ ...args.child.data, assessment_id: assessmentId });
        if (error) throw error;
      } else if (args.child.kind === "sit_to_stand") {
        const { error } = await supabase
          .from("sit_to_stand_results")
          .insert({ ...args.child.data, assessment_id: assessmentId });
        if (error) throw error;
      }
      // kind === "none" ou "questionnaire" → não escreve filha aqui
      // (questionnaire vai por edge function em E3)

      // 3. Cardiovascular baseline e subjective scores (opcionais)
      if (args.cardiovascular) {
        const { error } = await supabase
          .from("cardiovascular_baseline")
          .insert({ ...args.cardiovascular, assessment_id: assessmentId });
        if (error) throw error;
      }
      if (args.subjective) {
        const { error } = await supabase
          .from("subjective_scores")
          .insert({ ...args.subjective, assessment_id: assessmentId });
        if (error) throw error;
      }

      return assessment as Assessment;
    },
    onSuccess: (assessment) => {
      queryClient.invalidateQueries({
        queryKey: ["assessments", "by-student", assessment.student_id],
      });
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
 * mutations específicas que ainda não existem — adicionar quando E2.5+
 * pedir edição.
 */
export const useUpdateAssessment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: { id: string; patch: Partial<Pick<Assessment, "status" | "notes" | "assessment_date">> }) => {
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
      notify.success("Avaliação removida");
    },
    onError: (error: Error) => {
      notify.error("Erro ao remover avaliação", {
        description: buildErrorDescription(error, i18n.errors.unknown),
      });
    },
  });
};
