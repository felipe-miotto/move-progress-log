/**
 * Teste de paridade entre os codes do app
 * (src/constants/precision12Questionnaire.ts) e a cópia
 * server-side em supabase/functions/_shared/precision12QuestionnaireValidation.ts.
 *
 * Por que existe: edge functions rodam em Deno e não podem importar
 * código do bundle React via alias `@/`. A cópia em `_shared/` é
 * mantida em paralelo. Este teste lê o arquivo `_shared` como texto
 * e confirma que cada array de codes bate **exatamente** (ordem +
 * conteúdo) com o do app.
 *
 * Mudar code no app sem atualizar `_shared` (ou vice-versa) → quebra
 * este teste. Mudanças válidas exigem update síncrono em ambos.
 */

import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import {
  ACCOMPANIMENT_PREFERENCE_CODES,
  ALCOHOL_CODES,
  BIGGEST_DIFFICULTY_CODES,
  CAFFEINE_DOSES_CODES,
  CONSISTENCY_SELF_RATING_CODES,
  CORRECTION_PREFERENCE_CODES,
  DIFFICULTY_HELPER_CODES,
  DISCOMFORT_RESPONSE_CODES,
  EXERCISE_HISTORY_CODES,
  EXTERNAL_TRAINING_RESOURCES_CODES,
  FIRM_PROFESSIONAL_RESPONSE_CODES,
  GENDER_CODES,
  GOAL_CODES,
  LIFE_STABILITY_CODES,
  MISSED_SESSION_RESPONSE_CODES,
  MOTIVATION_CODES,
  PAIN_MOVEMENT_CODES,
  PAIN_STATUS_CODES,
  PAIN_STATUS_REQUIRES_DETAILS,
  PRIMARY_ADHERENCE_BARRIER_CODES,
  RECOVERY_QUALITY_CODES,
  RECOVERY_STRATEGY_CODES,
  ROUTINE_CODES,
  SESSION_DURATION_CODES,
  SLEEP_HOURS_CODES,
  TOBACCO_CODES,
  TRAINING_AVAILABLE_DAYS_CODES,
  TRAINING_PERIOD_CODES,
  WEARABLE_BRAND_CODES,
} from "@/constants/precision12Questionnaire";

const sharedPath = resolve(
  __dirname,
  "../../../supabase/functions/_shared/precision12QuestionnaireValidation.ts",
);
const sharedSource = readFileSync(sharedPath, "utf-8");

/**
 * Extrai o array literal de codes do arquivo shared. Funciona em
 * `export const NAME = [ ... ] as const;` (multi-linha ou inline).
 */
function extractCodesFromShared(name: string): readonly string[] {
  // Regex: captura tudo entre `[` e `]` após `export const NAME = `
  const pattern = new RegExp(
    `export\\s+const\\s+${name}\\s*=\\s*\\[([^\\]]*)\\]\\s*as\\s+const`,
    "m",
  );
  const match = sharedSource.match(pattern);
  if (!match) {
    throw new Error(`Constante ${name} não encontrada em _shared/`);
  }
  const body = match[1];
  // Extrai strings entre aspas (suporta tanto "code" quanto 'code')
  const codes = Array.from(body.matchAll(/["']([^"']+)["']/g)).map((m) => m[1]);
  if (codes.length === 0) {
    throw new Error(`Constante ${name} em _shared/ não tem codes`);
  }
  return codes;
}

interface ParityCase {
  name: string;
  appCodes: readonly string[];
}

const CASES: ParityCase[] = [
  { name: "GENDER_CODES", appCodes: GENDER_CODES },
  { name: "ROUTINE_CODES", appCodes: ROUTINE_CODES },
  { name: "GOAL_CODES", appCodes: GOAL_CODES },
  { name: "EXERCISE_HISTORY_CODES", appCodes: EXERCISE_HISTORY_CODES },
  { name: "SESSION_DURATION_CODES", appCodes: SESSION_DURATION_CODES },
  { name: "TRAINING_AVAILABLE_DAYS_CODES", appCodes: TRAINING_AVAILABLE_DAYS_CODES },
  { name: "TRAINING_PERIOD_CODES", appCodes: TRAINING_PERIOD_CODES },
  { name: "EXTERNAL_TRAINING_RESOURCES_CODES", appCodes: EXTERNAL_TRAINING_RESOURCES_CODES },
  { name: "PRIMARY_ADHERENCE_BARRIER_CODES", appCodes: PRIMARY_ADHERENCE_BARRIER_CODES },
  { name: "PAIN_STATUS_CODES", appCodes: PAIN_STATUS_CODES },
  { name: "PAIN_STATUS_REQUIRES_DETAILS", appCodes: PAIN_STATUS_REQUIRES_DETAILS },
  { name: "PAIN_MOVEMENT_CODES", appCodes: PAIN_MOVEMENT_CODES },
  { name: "BIGGEST_DIFFICULTY_CODES", appCodes: BIGGEST_DIFFICULTY_CODES },
  { name: "RECOVERY_STRATEGY_CODES", appCodes: RECOVERY_STRATEGY_CODES },
  { name: "ALCOHOL_CODES", appCodes: ALCOHOL_CODES },
  { name: "TOBACCO_CODES", appCodes: TOBACCO_CODES },
  { name: "CAFFEINE_DOSES_CODES", appCodes: CAFFEINE_DOSES_CODES },
  { name: "SLEEP_HOURS_CODES", appCodes: SLEEP_HOURS_CODES },
  { name: "RECOVERY_QUALITY_CODES", appCodes: RECOVERY_QUALITY_CODES },
  { name: "WEARABLE_BRAND_CODES", appCodes: WEARABLE_BRAND_CODES },
  { name: "MOTIVATION_CODES", appCodes: MOTIVATION_CODES },
  { name: "DISCOMFORT_RESPONSE_CODES", appCodes: DISCOMFORT_RESPONSE_CODES },
  { name: "DIFFICULTY_HELPER_CODES", appCodes: DIFFICULTY_HELPER_CODES },
  { name: "MISSED_SESSION_RESPONSE_CODES", appCodes: MISSED_SESSION_RESPONSE_CODES },
  { name: "FIRM_PROFESSIONAL_RESPONSE_CODES", appCodes: FIRM_PROFESSIONAL_RESPONSE_CODES },
  { name: "ACCOMPANIMENT_PREFERENCE_CODES", appCodes: ACCOMPANIMENT_PREFERENCE_CODES },
  { name: "CORRECTION_PREFERENCE_CODES", appCodes: CORRECTION_PREFERENCE_CODES },
  { name: "CONSISTENCY_SELF_RATING_CODES", appCodes: CONSISTENCY_SELF_RATING_CODES },
  { name: "LIFE_STABILITY_CODES", appCodes: LIFE_STABILITY_CODES },
];

describe("precision12 questionnaire codes — paridade app ↔ edge function", () => {
  it.each(CASES)("$name tem mesmos codes em src/ e supabase/functions/_shared/", ({ name, appCodes }) => {
    const sharedCodes = extractCodesFromShared(name);
    expect(sharedCodes).toEqual([...appCodes]);
  });
});
