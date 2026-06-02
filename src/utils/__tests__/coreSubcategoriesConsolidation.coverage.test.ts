/**
 * Source-based coverage da Fase 4b — consolidação de CORE subcategories.
 *
 * Decisões de produto (sem migration / sem backfill):
 *   - `ExerciseReviewPage` deixa de ter `CORE_SUBCATEGORIES` local divergente
 *     e passa a usar a lista canônica `CORE_ATIVACAO_SUBCATEGORIES`.
 *   - As 3 chaves legadas (ativacao_gluteo / ativacao_ombro / estabilizacao)
 *     ficam preservadas como "(legado)" via `LEGACY_CORE_SUBCATEGORIES`, pra
 *     que dados existentes continuem visíveis/editáveis.
 *   - ativacao_ombro mapeia conceitualmente p/ cintura_escapular_serratil;
 *     estabilizacao não tem equivalente (reclassificar manual).
 *   - Os 3 `anti_*` (idênticos, e únicas chaves consumidas por
 *     generate-group-session) NÃO mudam.
 *
 * Mesmo padrão dos demais *.coverage.test.ts (readFileSync + asserts + import
 * da constante) — sem render, sem Postgres.
 */
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

import {
  CORE_ATIVACAO_SUBCATEGORIES,
  LEGACY_CORE_SUBCATEGORIES,
} from "@/constants/backToBasics";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const read = (rel: string) => readFileSync(resolve(__dirname, rel), "utf-8");

const backToBasicsSrc = read("../../constants/backToBasics.ts");
const reviewPageSrc = read("../../pages/ExerciseReviewPage.tsx");
const generateGroupSrc = read(
  "../../../supabase/functions/generate-group-session/index.ts",
);

describe("Fase 4b — CORE subcategories consolidado", () => {
  describe("LEGACY_CORE_SUBCATEGORIES (back-compat)", () => {
    it("é exportada por backToBasics", () => {
      expect(backToBasicsSrc).toMatch(/export\s+const\s+LEGACY_CORE_SUBCATEGORIES\s*=\s*\{/);
    });

    it("tem exatamente as 3 chaves legadas, marcadas '(legado)'", () => {
      expect(Object.keys(LEGACY_CORE_SUBCATEGORIES).sort()).toEqual(
        ["ativacao_gluteo", "ativacao_ombro", "estabilizacao"],
      );
      for (const label of Object.values(LEGACY_CORE_SUBCATEGORIES)) {
        expect(label).toMatch(/\(legado\)/);
      }
    });

    it("NÃO inclui os 3 anti_* (esses são canônicos e consumidos pela IA)", () => {
      for (const k of ["anti_extensao", "anti_rotacao", "anti_flexao_lateral"]) {
        expect(k in LEGACY_CORE_SUBCATEGORIES).toBe(false);
      }
    });
  });

  describe("canônica preservada", () => {
    it("CORE_ATIVACAO_SUBCATEGORIES mantém os 3 anti_* + ativacao_gluteos + cintura_escapular_serratil", () => {
      for (const k of [
        "anti_extensao",
        "anti_rotacao",
        "anti_flexao_lateral",
        "ativacao_gluteos",
        "cintura_escapular_serratil",
        "controle_motor_tecnica",
        "respiracao_pressao_iap",
      ]) {
        expect(k in CORE_ATIVACAO_SUBCATEGORIES).toBe(true);
      }
    });
  });

  describe("ExerciseReviewPage usa canônica + legado", () => {
    it("NÃO declara mais const CORE_SUBCATEGORIES local divergente", () => {
      expect(reviewPageSrc).not.toMatch(/const\s+CORE_SUBCATEGORIES\s*[:=]/);
    });

    it("importa CORE_ATIVACAO_SUBCATEGORIES e LEGACY_CORE_SUBCATEGORIES", () => {
      expect(reviewPageSrc).toMatch(
        /import\s*\{[\s\S]*?CORE_ATIVACAO_SUBCATEGORIES[\s\S]*?LEGACY_CORE_SUBCATEGORIES[\s\S]*?\}\s*from\s*"@\/constants\/backToBasics"/,
      );
    });

    it("monta o dropdown de core mesclando canônica + legado", () => {
      expect(reviewPageSrc).toMatch(
        /CORE_SUBCATEGORY_OPTIONS[\s\S]*?\.\.\.CORE_ATIVACAO_SUBCATEGORIES[\s\S]*?\.\.\.LEGACY_CORE_SUBCATEGORIES/,
      );
      expect(reviewPageSrc).toMatch(
        /category\s*===\s*"core_ativacao"\s*\)\s*return\s+CORE_SUBCATEGORY_OPTIONS/,
      );
    });
  });

  describe("guard — IA (generate-group-session) intocada", () => {
    it("ainda só referencia os 3 anti_* de core (nenhuma chave de ativação)", () => {
      expect(generateGroupSrc).toMatch(/anti_extensao/);
      expect(generateGroupSrc).toMatch(/anti_flexao_lateral/);
      expect(generateGroupSrc).toMatch(/anti_rotacao/);
      // A IA não deve depender das chaves de ativação/estabilização.
      for (const k of [
        "ativacao_gluteo",
        "ativacao_ombro",
        "estabilizacao",
        "cintura_escapular_serratil",
        "controle_motor_tecnica",
        "respiracao_pressao_iap",
      ]) {
        expect(generateGroupSrc.includes(k)).toBe(false);
      }
    });
  });
});
