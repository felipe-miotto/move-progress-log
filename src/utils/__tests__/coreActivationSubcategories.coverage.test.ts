/**
 * Source-based coverage do PR de subcategorias para "Core e Ativação".
 *
 * Verifica que:
 *  - existe a constante CORE_ATIVACAO_SUBCATEGORIES com as 7 funções
 *    principais do core e que o re-export em useExercisesLibrary funciona;
 *  - AddExerciseDialog e EditExerciseLibraryDialog usam essa lista quando
 *    `category === "core_ativacao"` (Select controlado), mas mantêm o
 *    Input livre para outras categorias;
 *  - o PR não adiciona migration nem reintroduz a antiga label "Nível
 *    Boyle"; "Nível Fabrik" continua sendo a label pública.
 *
 * Mesmo padrão dos demais *.coverage.test.ts (readFileSync + asserts no
 * fonte) — sem render, sem Postgres.
 */
import { readFileSync, readdirSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const read = (rel: string) => readFileSync(resolve(__dirname, rel), "utf-8");

const constantsSrc = read("../../constants/backToBasics.ts");
const useExercisesLibrarySrc = read("../../hooks/useExercisesLibrary.ts");
const addDialogSrc = read("../../components/AddExerciseDialog.tsx");
const editDialogSrc = read("../../components/EditExerciseLibraryDialog.tsx");

const migrationsDir = resolve(__dirname, "../../../supabase/migrations");

/**
 * As 7 subcategorias controladas — checadas como labels textuais nas
 * options (chave em snake_case + label em ptBR). Mantém o teste robusto a
 * pequenas variações de ordem.
 */
const EXPECTED_CORE_SUBCAT_LABELS = [
  "Anti-extensão",
  "Anti-rotação",
  "Anti-flexão lateral",
  "Ativação de glúteos",
  "Cintura escapular / serrátil",
  "Controle motor / técnica",
  "Respiração / pressão intra-abdominal",
];

describe("PR — subcategorias Core e Ativação", () => {
  describe("constante CORE_ATIVACAO_SUBCATEGORIES", () => {
    it("é exportada por backToBasics.ts", () => {
      expect(constantsSrc).toMatch(
        /export\s+const\s+CORE_ATIVACAO_SUBCATEGORIES\s*=\s*\{/,
      );
    });

    it("contém exatamente as 7 labels esperadas", () => {
      for (const label of EXPECTED_CORE_SUBCAT_LABELS) {
        expect(constantsSrc).toContain(`"${label}"`);
      }
    });

    it("é re-exportada pelo hook useExercisesLibrary", () => {
      expect(useExercisesLibrarySrc).toMatch(
        /export\s*\{[\s\S]*?CORE_ATIVACAO_SUBCATEGORIES[\s\S]*?\}\s*from\s*"@\/constants\/backToBasics"/,
      );
    });
  });

  describe("AddExerciseDialog usa a lista quando categoria é core_ativacao", () => {
    it("importa CORE_ATIVACAO_SUBCATEGORIES", () => {
      expect(addDialogSrc).toContain("CORE_ATIVACAO_SUBCATEGORIES");
    });

    it("renderiza Select condicional para core_ativacao (preserva Input para outras)", () => {
      expect(addDialogSrc).toMatch(
        /category\s*===\s*"core_ativacao"\s*\?\s*\([\s\S]*?<Select/,
      );
      // O ramo "else" preserva o Input livre (não foi removido).
      expect(addDialogSrc).toMatch(/\)\s*:\s*\(\s*<Input/);
    });

    it("mostra texto de ajuda 'Use a função principal do exercício na prescrição'", () => {
      expect(addDialogSrc).toContain("Use a função principal do exercício na prescrição.");
    });
  });

  describe("EditExerciseLibraryDialog usa a lista quando categoria é core_ativacao", () => {
    it("importa CORE_ATIVACAO_SUBCATEGORIES", () => {
      expect(editDialogSrc).toContain("CORE_ATIVACAO_SUBCATEGORIES");
    });

    it("renderiza Select condicional para core_ativacao (preserva Input para outras)", () => {
      expect(editDialogSrc).toMatch(
        /category\s*===\s*"core_ativacao"\s*\?\s*\([\s\S]*?<Select/,
      );
      expect(editDialogSrc).toMatch(/\)\s*:\s*\(\s*<Input/);
    });
  });

  describe("preserva valor legado fora da lista controlada", () => {
    it("AddExerciseDialog exibe valor legado como opção 'legado'", () => {
      expect(addDialogSrc).toMatch(
        /!\(subcategory\s+in\s+CORE_ATIVACAO_SUBCATEGORIES\)/,
      );
      expect(addDialogSrc).toContain("(legado)");
    });

    it("EditExerciseLibraryDialog exibe valor legado como opção 'legado'", () => {
      expect(editDialogSrc).toMatch(
        /!\(subcategory\s+in\s+CORE_ATIVACAO_SUBCATEGORIES\)/,
      );
      expect(editDialogSrc).toContain("(legado)");
    });
  });

  describe("escopo — não regrediu nem expandiu além do esperado", () => {
    it("não criou migration nova para este PR", () => {
      const files = readdirSync(migrationsDir);
      const suspectMigrations = files.filter((f) =>
        /core_ativacao_subcat|core_activation_subcat|core_ativacao_subcategor/i.test(f),
      );
      expect(suspectMigrations).toEqual([]);
    });

    it("'Nível Boyle' não voltou ao código", () => {
      expect(constantsSrc).not.toMatch(/Nível Boyle/);
      expect(addDialogSrc).not.toMatch(/Nível Boyle/);
      expect(editDialogSrc).not.toMatch(/Nível Boyle/);
    });

    it("'Nível Fabrik' continua nos dois diálogos", () => {
      expect(addDialogSrc).toContain("Nível Fabrik");
      expect(editDialogSrc).toContain("Nível Fabrik");
    });
  });
});
