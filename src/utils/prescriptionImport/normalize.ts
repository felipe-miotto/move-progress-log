/**
 * Helpers PUROS para o pipeline de importação de prescrição.
 *
 *   - `normalizePrescriptionDraft` — coage shape cru (Word/Excel) num
 *      `PrescriptionImportDraft` sanitizado (trim, defaults, types).
 *   - `validatePrescriptionDraft` — devolve `PrescriptionImportIssue[]`
 *      com severidades. Não muta input.
 *   - `draftToCreatePrescriptionInput` — bridge pro shape esperado por
 *      `createPrescriptionWithRelations`. Trava se houver `block` issues.
 *   - `parseIntervalToSeconds` — coage "1 min" / "90s" / "2 min" / 90
 *      em segundos. Usada pelos parsers Word e Excel.
 *
 * SEM Supabase, SEM React, SEM IO. Tudo puro. Tudo testável.
 */

import type { CreatePrescriptionExerciseInput } from "@/hooks/prescriptionCreateUtils";

import type {
  DraftToCreateResult,
  PrescriptionImportDraft,
  PrescriptionImportExerciseDraft,
  PrescriptionImportExerciseMatch,
  PrescriptionImportIssue,
  PrescriptionImportType,
} from "./types";

// ────────────────────────────────────────────────────────────────────────────
// Utilitários internos
// ────────────────────────────────────────────────────────────────────────────

/** Trim seguro de string|number|null|undefined. */
const safeTrim = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
};

/** Trim → string ou null se vazio. */
const coerceText = (v: unknown): string | null => {
  const t = safeTrim(v);
  return t.length === 0 ? null : t;
};

/**
 * Coerção de sets/reps. Aceita number, string e variantes BR (vírgula
 * como decimal — raro, mas defensivo). Devolve a representação
 * STRING porque o schema de `prescription_exercises.sets/reps` é
 * `text` (aceita "3-4", "AMRAP", "30s").
 */
const coerceSetsOrReps = (v: unknown): string => {
  if (typeof v === "number" && Number.isFinite(v)) {
    return String(v);
  }
  return safeTrim(v);
};

/** Boolean tolerante: `true|"true"|"1"|1|"sim"|"x"` → true. */
const coerceBoolean = (v: unknown, fallback = false): boolean => {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v === 1;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "" ) return fallback;
    return ["true", "1", "sim", "yes", "y", "x"].includes(s);
  }
  return fallback;
};

// ────────────────────────────────────────────────────────────────────────────
// parseIntervalToSeconds — usado por Word e Excel
// ────────────────────────────────────────────────────────────────────────────

/**
 * Coage representações comuns de intervalo em segundos.
 *
 * Aceita:
 *   - number direto (já em segundos) → identidade segura (>=0)
 *   - "90s", "90 s", "90 seg", "90 segundos"
 *   - "1min", "1 min", "1 minuto", "1m"
 *   - "1.5 min", "1,5 min" (decimal BR/US)
 *   - "1min 30s", "1 min 30 s", "1min30s" (composição com/sem espaço)
 *   - "2 mins" (plural en/pt)
 *
 * Retorna `null` se não conseguir extrair número plausível.
 * Valores negativos → null. Valores não finitos → null.
 *
 * Algoritmo: para cada número encontrado, lê o sufixo de letras
 * imediatamente após (com whitespace opcional). "min*" → minutos;
 * "s*" → segundos; "m" sozinho → minutos; sem sufixo → segundos.
 * Permite que "1min30s" funcione igual a "1 min 30 s".
 */
const INTERVAL_NUMBER_WITH_SUFFIX_RE = /(\d+(?:[.,]\d+)?)\s*([a-z]*)/gi;

export function parseIntervalToSeconds(value: unknown): number | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return null;
    return Math.round(value);
  }
  if (typeof value !== "string") return null;
  const raw = value.trim().toLowerCase();
  if (raw.length === 0) return null;

  let totalSec = 0;
  let foundAny = false;
  let match: RegExpExecArray | null;
  INTERVAL_NUMBER_WITH_SUFFIX_RE.lastIndex = 0;
  while ((match = INTERVAL_NUMBER_WITH_SUFFIX_RE.exec(raw)) !== null) {
    const n = parseFloat(match[1].replace(",", "."));
    if (!Number.isFinite(n) || n < 0) continue;
    foundAny = true;
    const suffix = match[2];
    // "min", "mins", "minuto", "minutos" → minutos
    // "m" sozinho → minutos (atalho)
    // "s", "seg", "segundos", "sec" → segundos
    // sem sufixo → segundos
    if (/^min/.test(suffix) || /^m$/.test(suffix)) {
      totalSec += n * 60;
    } else {
      totalSec += n;
    }
  }
  if (!foundAny) return null;
  return Math.round(totalSec);
}

// ────────────────────────────────────────────────────────────────────────────
// Normalização — input cru → draft estruturado
// ────────────────────────────────────────────────────────────────────────────

const DEFAULT_PRESCRIPTION_TYPE: PrescriptionImportType = "group";

/**
 * Aceita prescrição com `prescription_type` em formato flexível e
 * coage no enum. Default `group` (alinhado com
 * `prescriptionCreateUtils.createPrescriptionWithRelations`).
 */
function coercePrescriptionType(v: unknown): PrescriptionImportType {
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "individual" || s === "individuais" || s === "individuo") {
      return "individual";
    }
    if (s === "group" || s === "grupo" || s === "coletivo") {
      return "group";
    }
  }
  return DEFAULT_PRESCRIPTION_TYPE;
}

function normalizeMatches(raw: unknown): PrescriptionImportExerciseMatch[] {
  if (!Array.isArray(raw)) return [];
  const out: PrescriptionImportExerciseMatch[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const id = safeTrim(obj.id);
    const name = safeTrim(obj.name);
    const similarityRaw = obj.similarity;
    const similarity =
      typeof similarityRaw === "number" && Number.isFinite(similarityRaw)
        ? Math.max(0, Math.min(1, similarityRaw))
        : 0;
    if (id.length === 0 || name.length === 0) continue;
    out.push({ id, name, similarity });
  }
  // Maior similarity primeiro — UI já recebe pronto.
  out.sort((a, b) => b.similarity - a.similarity);
  return out;
}

/**
 * Coage 1 exercício cru. Não inventa nada: campos ausentes viram
 * null/false; `name`/`sets`/`reps` vêm como string vazia se faltarem
 * (issues são geradas separadamente em `validate`).
 */
export function normalizeExerciseDraft(
  raw: unknown,
): PrescriptionImportExerciseDraft {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    name: safeTrim(obj.name),
    exercise_library_id: coerceText(obj.exercise_library_id),
    matches: normalizeMatches(obj.matches),
    sets: coerceSetsOrReps(obj.sets),
    reps: coerceSetsOrReps(obj.reps),
    load: coerceText(obj.load),
    rir: coerceText(obj.rir ?? obj.rr ?? obj.reserva),
    pse: coerceText(obj.pse),
    interval_seconds:
      obj.interval_seconds !== undefined
        ? parseIntervalToSeconds(obj.interval_seconds)
        : parseIntervalToSeconds(obj.interval ?? obj.intervalo ?? null),
    training_method: coerceText(obj.training_method ?? obj.method ?? obj.metodo),
    observations: coerceText(obj.observations ?? obj.obs ?? obj.observacoes),
    // `group_with_previous`: NUNCA inferir true; tem que vir explícito.
    group_with_previous: coerceBoolean(obj.group_with_previous, false),
    // `should_track`: default TRUE (regra do app: por padrão registramos
    // desempenho; coach desliga só pra mobilidade/aquecimento etc.).
    should_track: coerceBoolean(obj.should_track, true),
  };
}

/**
 * Coage 1 prescrição crua. Lista de exercícios sempre array (vazia
 * se input inválido).
 */
export function normalizePrescriptionDraft(
  raw: unknown,
): PrescriptionImportDraft {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const exercisesRaw = Array.isArray(obj.exercises) ? obj.exercises : [];
  return {
    name: safeTrim(obj.name),
    objective: coerceText(obj.objective),
    day_of_week: coerceText(obj.day_of_week ?? obj.dia ?? obj.dia_semana),
    prescription_type: coercePrescriptionType(obj.prescription_type),
    exercises: exercisesRaw.map(normalizeExerciseDraft),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Validação — gera issues por path
// ────────────────────────────────────────────────────────────────────────────

const issue = (
  code: PrescriptionImportIssue["code"],
  severity: PrescriptionImportIssue["severity"],
  message: string,
  path?: string,
): PrescriptionImportIssue => ({ code, severity, message, path });

export function validateExerciseDraft(
  exercise: PrescriptionImportExerciseDraft,
  path: string,
): PrescriptionImportIssue[] {
  const issues: PrescriptionImportIssue[] = [];

  if (exercise.name.length === 0) {
    issues.push(
      issue(
        "missing_required_field",
        "block",
        "Exercício sem nome",
        `${path}.name`,
      ),
    );
  }
  if (exercise.sets.length === 0) {
    issues.push(
      issue(
        "missing_required_field",
        "block",
        "Sets ausente",
        `${path}.sets`,
      ),
    );
  }
  if (exercise.reps.length === 0) {
    issues.push(
      issue(
        "missing_required_field",
        "block",
        "Reps ausente",
        `${path}.reps`,
      ),
    );
  }

  if (!exercise.exercise_library_id) {
    // Diferencia "nenhum match" vs "ambíguo".
    if (exercise.matches.length === 0) {
      issues.push(
        issue(
          "exercise_unmatched",
          "block",
          `Exercício "${exercise.name || "(sem nome)"}" sem match na biblioteca`,
          `${path}.exercise_library_id`,
        ),
      );
    } else {
      const top = exercise.matches[0];
      const second = exercise.matches[1];
      // Ambíguo se o top é abaixo de 0.9 OU se a diferença pro 2º é menor que 0.1.
      const isAmbiguous =
        top.similarity < 0.9 ||
        (second !== undefined && top.similarity - second.similarity < 0.1);
      if (isAmbiguous) {
        issues.push(
          issue(
            "exercise_ambiguous_match",
            "block",
            `Match ambíguo para "${exercise.name || "(sem nome)"}"`,
            `${path}.exercise_library_id`,
          ),
        );
      } else {
        // Top é seguro mas o coach não confirmou → warn (UI pode auto-aceitar).
        issues.push(
          issue(
            "exercise_unmatched",
            "warn",
            `"${exercise.name || "(sem nome)"}" → sugestão: "${top.name}" (${Math.round(top.similarity * 100)}%)`,
            `${path}.exercise_library_id`,
          ),
        );
      }
    }
  }

  if (
    exercise.interval_seconds !== null &&
    (!Number.isFinite(exercise.interval_seconds) || exercise.interval_seconds < 0)
  ) {
    issues.push(
      issue(
        "invalid_numeric",
        "block",
        "Intervalo inválido",
        `${path}.interval_seconds`,
      ),
    );
  }

  return issues;
}

export function validatePrescriptionDraft(
  draft: PrescriptionImportDraft,
  path: string,
): PrescriptionImportIssue[] {
  const issues: PrescriptionImportIssue[] = [];

  if (draft.name.length === 0) {
    issues.push(
      issue(
        "missing_required_field",
        "block",
        "Nome do treino ausente",
        `${path}.name`,
      ),
    );
  }

  draft.exercises.forEach((ex, idx) => {
    issues.push(...validateExerciseDraft(ex, `${path}.exercises[${idx}]`));
  });

  return issues;
}

// ────────────────────────────────────────────────────────────────────────────
// Bridge: draft → CreatePrescriptionInput
// ────────────────────────────────────────────────────────────────────────────

/**
 * Converte um draft revisado em payload pronto pra
 * `createPrescriptionWithRelations`. Bloqueia se houver issues `block`.
 *
 * NÃO chama Supabase, NÃO persiste. Só constrói o objeto e devolve
 * os issues que impediram a construção (caso o coach tente confirmar
 * antes de resolver).
 */
export function draftToCreatePrescriptionInput(
  draft: PrescriptionImportDraft,
): DraftToCreateResult {
  const blocking = validatePrescriptionDraft(draft, "$").filter(
    (i) => i.severity === "block",
  );
  if (blocking.length > 0) {
    return { input: null, blocking_issues: blocking };
  }

  const exercises: CreatePrescriptionExerciseInput[] = draft.exercises.map((ex) => ({
    // Validado acima — `exercise_library_id` é não-null neste ponto.
    exercise_library_id: ex.exercise_library_id as string,
    sets: ex.sets,
    reps: ex.reps,
    interval_seconds: ex.interval_seconds ?? undefined,
    pse: ex.pse ?? undefined,
    load: ex.load ?? undefined,
    rir: ex.rir ?? undefined,
    training_method: ex.training_method ?? undefined,
    observations: ex.observations ?? undefined,
    group_with_previous: ex.group_with_previous,
    should_track: ex.should_track,
  }));

  return {
    input: {
      name: draft.name,
      objective: draft.objective ?? undefined,
      prescription_type: draft.prescription_type,
      exercises,
    },
    blocking_issues: [],
  };
}
