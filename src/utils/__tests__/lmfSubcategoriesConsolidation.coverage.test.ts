/**
 * Source-based coverage da Fase 3 — consolidação de LMF_SUBCATEGORIES.
 *
 * Objetivo: eliminar o drift entre a cópia local em `ExerciseReviewPage`
 * e a fonte canônica. Trava:
 *   - backToBasics exporta LMF_SUBCATEGORIES com os 8 grupos esperados
 *     (valores idênticos à cópia local que existia antes);
 *   - ExerciseReviewPage NÃO declara mais `const LMF_SUBCATEGORIES` local;
 *   - ExerciseReviewPage importa LMF_SUBCATEGORIES de backToBasics;
 *   - o consumo (`category === "lmf"`) continua presente;
 *   - GUARD DE ESCOPO: CORE_SUBCATEGORIES local permanece intacto — esta
 *     rodada NÃO toca CORE (isso é fase separada).
 *
 * Mesmo padrão dos demais *.coverage.test.ts (readFileSync + asserts no
 * fonte) — sem render, sem Postgres.
 */
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

import { LMF_SUBCATEGORIES } from "@/constants/backToBasics";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const read = (rel: string) => readFileSync(resolve(__dirname, rel), "utf-8");

const backToBasicsSrc = read("../../constants/backToBasics.ts");
const reviewPageSrc = read("../../pages/ExerciseReviewPage.tsx");

const EXPECTED_LMF: Record<string, string> = {
  adutores: "Adutores",
  gluteos: "Glúteos",
  quadriceps: "Quadríceps",
  isquiotibiais: "Isquiotibiais",
  panturrilha: "Panturrilha",
  coluna: "Coluna",
  ombro: "Ombro",
  pe: "Pé",
};

describe("Fase 3 — LMF_SUBCATEGORIES consolidado", () => {
  describe("fonte canônica em backToBasics", () => {
    it("exporta LMF_SUBCATEGORIES", () => {
      expect(backToBasicsSrc).toMatch(
        /export\s+const\s+LMF_SUBCATEGORIES\s*=\s*\{/,
      );
    });

    it("tem exatamente os 8 grupos esperados, com labels idênticos à cópia antiga", () => {
      expect(Object.keys(LMF_SUBCATEGORIES).sort()).toEqual(
        Object.keys(EXPECTED_LMF).sort(),
      );
      for (const [code, label] of Object.entries(EXPECTED_LMF)) {
        expect(LMF_SUBCATEGORIES[code as keyof typeof LMF_SUBCATEGORIES]).toBe(
          label,
        );
      }
    });
  });

  describe("ExerciseReviewPage usa a fonte canônica", () => {
    it("NÃO declara mais const LMF_SUBCATEGORIES local", () => {
      expect(reviewPageSrc).not.toMatch(/const\s+LMF_SUBCATEGORIES\s*[:=]/);
    });

    it("importa LMF_SUBCATEGORIES de @/constants/backToBasics", () => {
      expect(reviewPageSrc).toMatch(
        /import\s*\{[\s\S]*?LMF_SUBCATEGORIES[\s\S]*?\}\s*from\s*"@\/constants\/backToBasics"/,
      );
    });

    it("continua resolvendo subcategoria para category === 'lmf'", () => {
      expect(reviewPageSrc).toMatch(
        /category\s*===\s*"lmf"\s*\)\s*return\s+LMF_SUBCATEGORIES/,
      );
    });
  });

  describe("CORE consolidado depois, na Fase 4b", () => {
    it("CORE_SUBCATEGORIES local NÃO existe mais (consolidado no PR 4b)", () => {
      // Atualizado: no LMF (#199) o guard exigia que o CORE_SUBCATEGORIES local
      // permanecesse intocado (fase separada). A Fase 4b consolidou o CORE na
      // fonte canônica, então o const local foi removido. Cobertura detalhada
      // do CORE em coreSubcategoriesConsolidation.coverage.test.ts.
      expect(reviewPageSrc).not.toMatch(/const\s+CORE_SUBCATEGORIES\s*[:=]/);
    });
  });
});
