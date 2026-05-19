/**
 * Contrato único de importação de PRESCRIÇÃO de treino.
 *
 * Por que existir:
 *   O app hoje tem 1 importador (Word) acoplado a 1 edge (IA) e 1 UI
 *   específica. O fluxo "importar Excel de prescrição" não existe (o
 *   ImportSessionsDialog é de SESSÃO EXECUTADA, escopo diferente).
 *
 *   Para não criar dois importadores divergentes, o passo 1 é
 *   estabelecer um shape interno único que TANTO o Word parser
 *   (via IA) QUANTO o Excel parser (determinístico) emitam. A UI de
 *   revisão consome este shape uniformemente.
 *
 * Fluxo alvo:
 *   1. Word/Excel → parser → `PrescriptionImportDraft`
 *   2. UI revisa → resolve issues + faz match com biblioteca
 *   3. `draftToCreatePrescriptionInput()` → `CreatePrescriptionInput`
 *      (shape de `prescriptionCreateUtils.createPrescriptionWithRelations`)
 *   4. `useCreatePrescription` persiste em
 *      `workout_prescriptions` + `prescription_exercises`.
 *
 * NUNCA persiste nada por este módulo — só normaliza/valida em
 * memória. Sem chamadas a Supabase, sem mutations.
 */

import type { CreatePrescriptionExerciseInput } from "@/hooks/prescriptionCreateUtils";

// ────────────────────────────────────────────────────────────────────────────
// Enums + tipos primitivos
// ────────────────────────────────────────────────────────────────────────────

/** Origem da importação. Usado pra telemetria + branding na UI. */
export type PrescriptionImportSource = "word" | "excel";

/** Tipo da prescrição. Espelha `workout_prescriptions.prescription_type`. */
export type PrescriptionImportType = "group" | "individual";

/**
 * Métodos de treino reconhecidos pelo app. Espelha o vocabulário do
 * Word parser atual (`parse-word-prescription`). Texto livre é
 * aceito no draft mas downstream pode normalizar pra um dos abaixo.
 */
export type PrescriptionImportMethod =
  | "CIRCUITO"
  | "SUPERSET"
  | "EMOM"
  | string;

// ────────────────────────────────────────────────────────────────────────────
// Issues — diagnóstico estruturado
// ────────────────────────────────────────────────────────────────────────────

/**
 * Severidade de um problema no draft. `block` impede salvar; `warn`
 * exibe alerta mas permite confirmar; `info` é apenas informativo.
 */
export type PrescriptionImportIssueSeverity = "block" | "warn" | "info";

/** Códigos enumerados de problemas (estável; UI mapeia label/i18n). */
export type PrescriptionImportIssueCode =
  /** Exercício sem match na biblioteca. */
  | "exercise_unmatched"
  /** Múltiplos matches com similaridade próxima. */
  | "exercise_ambiguous_match"
  /** Campo obrigatório vazio depois da normalização. */
  | "missing_required_field"
  /** Valor numérico inválido (ex.: sets=`"abc"`). */
  | "invalid_numeric"
  /** Valor textual vazio depois de trim. */
  | "empty_text"
  /** Linha do Excel sem nome de exercício (skip implícito). */
  | "row_skipped_no_name"
  /** Header do Excel sem coluna obrigatória reconhecida. */
  | "missing_required_column"
  /** Aliás desconhecido em coluna do Excel. */
  | "unknown_column"
  /** Catch-all. */
  | "unknown";

export interface PrescriptionImportIssue {
  code: PrescriptionImportIssueCode;
  severity: PrescriptionImportIssueSeverity;
  /** Mensagem humana SEM PII (sem nome de aluno). */
  message: string;
  /**
   * Localizador no draft. Ex.: `prescriptions[0].exercises[3].load`,
   * `prescriptions[1].name`. Útil pra UI navegar até o problema.
   */
  path?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Exercise draft
// ────────────────────────────────────────────────────────────────────────────

/**
 * Match candidato gerado por fuzzy/embedding contra a biblioteca de
 * exercícios. Não é persistido — só ajuda a UI a sugerir/auto-selecionar.
 */
export interface PrescriptionImportExerciseMatch {
  /** `exercises_library.id`. */
  id: string;
  /** Nome canônico do exercício na biblioteca. */
  name: string;
  /** [0..1]. ≥0.9 = match seguro; 0.5–0.9 = sugestão; <0.5 = fraco. */
  similarity: number;
}

/**
 * Shape NORMALIZADO de um exercício no draft.
 * `name` é o texto original (pra UI mostrar lado a lado do match).
 * `exercise_library_id` só é setado quando o usuário (ou auto-match)
 * confirmou; sem ele o draft fica `block` no `validate`.
 */
export interface PrescriptionImportExerciseDraft {
  /** Nome como aparece no arquivo de origem. Preserva acentos/case. */
  name: string;
  /** ID do match aceito; null até resolução. */
  exercise_library_id: string | null;
  /** Top-N matches pra UI escolher. Não vazio implica que o parser tentou match. */
  matches: PrescriptionImportExerciseMatch[];

  /** Sets (string por design — aceita "3", "3-4", "AMRAP"). */
  sets: string;
  /** Reps (string — aceita "8-12", "30s", "1 min", "AMRAP"). */
  reps: string;

  /** Carga alvo (texto livre — ex.: "20 kg", "PC", "Carga moderada"). */
  load: string | null;
  /** Reserva (RR/RIR) — texto livre (ex.: "2-3", "0", "RM", "4+"). */
  rir: string | null;
  /** PSE — texto livre (ex.: "7-8", "All out", "Leve"). */
  pse: string | null;

  /** Intervalo em SEGUNDOS — `null` se não especificado. */
  interval_seconds: number | null;

  /** Método: CIRCUITO/SUPERSET/EMOM/etc. ou null. */
  training_method: PrescriptionImportMethod | null;

  /** Observações livres. */
  observations: string | null;

  /** Agrupado com exercício anterior (mesmo bloco/circuito). */
  group_with_previous: boolean;

  /** Coach quer registrar desempenho deste exercício. Default true. */
  should_track: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// Prescription draft
// ────────────────────────────────────────────────────────────────────────────

export interface PrescriptionImportDraft {
  /** Nome do treino (ex.: "TREINO 1 – FORÇA / HIPERTROFIA"). */
  name: string;
  /** Objetivo principal (texto livre). */
  objective: string | null;
  /** Dia(s) da semana — texto livre. NÃO persistido; uso só na UI. */
  day_of_week: string | null;
  /** Tipo. Default "group" (alinhado com `prescriptionCreateUtils`). */
  prescription_type: PrescriptionImportType;
  /** Exercícios em ordem. Index = `order_index`. */
  exercises: PrescriptionImportExerciseDraft[];
}

// ────────────────────────────────────────────────────────────────────────────
// Batch — payload de saída do parser
// ────────────────────────────────────────────────────────────────────────────

export interface PrescriptionImportBatch {
  /** Word/Excel. */
  source: PrescriptionImportSource;
  /**
   * Nome do arquivo original. **NÃO persistido**. Útil só pra
   * telemetria local (toast: "X.docx importado"). Não é PII por
   * convenção (coach escolhe o nome).
   */
  source_filename: string | null;
  /** Drafts extraídos. Pode estar vazio se o arquivo não tinha treinos. */
  prescriptions: PrescriptionImportDraft[];
  /**
   * Issues que não cabem num exercício/prescrição específico —
   * ex.: "Excel sem coluna 'exercício'". Issues escopadas a um
   * draft/exercise ficam dentro deles via `path`.
   */
  global_issues: PrescriptionImportIssue[];
}

// ────────────────────────────────────────────────────────────────────────────
// Bridge: draft → CreatePrescriptionInput
// ────────────────────────────────────────────────────────────────────────────

/**
 * Resultado de `draftToCreatePrescriptionInput`. Inclui o input pronto
 * pra `createPrescriptionWithRelations` E uma lista de issues que
 * impediram a conversão (ex.: exercício sem `exercise_library_id`).
 */
export interface DraftToCreateResult {
  /**
   * Input pronto pra persistir. `null` se houve issue `block` que
   * impediu a conversão (ex.: exercício sem match resolvido).
   */
  input: {
    name: string;
    objective?: string;
    prescription_type?: PrescriptionImportType;
    exercises: CreatePrescriptionExerciseInput[];
  } | null;
  blocking_issues: PrescriptionImportIssue[];
}
