/**
 * Source-based coverage da nomenclatura pública do nível de exercício.
 *
 * Regra de produto: o usuário vê "Nível Fabrik". O schema/código interno
 * mantém `boyle_score` por compatibilidade com banco, types, imports e IA.
 */
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const read = (rel: string) => readFileSync(resolve(__dirname, rel), "utf-8");

const addDialogSrc = read("../../components/AddExerciseDialog.tsx");
const editDialogSrc = read("../../components/EditExerciseLibraryDialog.tsx");
const libraryPageSrc = read("../../pages/ExercisesLibraryPage.tsx");
const taxonomyConstantsSrc = read("../../constants/backToBasics.ts");

describe("Nível Fabrik — nomenclatura pública", () => {
  it("cadastro de exercício mostra Nível Fabrik, não Nível Boyle", () => {
    expect(addDialogSrc).toContain("Nível Fabrik");
    expect(addDialogSrc).not.toContain("Nível Boyle");
  });

  it("edição de exercício mostra Nível Fabrik, não Nível Boyle", () => {
    expect(editDialogSrc).toContain("Nível Fabrik");
    expect(editDialogSrc).not.toContain("Nível Boyle");
  });

  it("explica que é nível mínimo recomendado e que níveis menores servem para avançados", () => {
    expect(addDialogSrc).toContain("Nível mínimo recomendado");
    expect(addDialogSrc).toContain("níveis menores também podem ser usados por alunos mais avançados");
    expect(editDialogSrc).toContain("Nível mínimo recomendado");
    expect(editDialogSrc).toContain("níveis menores também podem ser usados por alunos mais avançados");
  });

  it("badge público usa prefixo F de Fabrik, preservando boyle_score internamente", () => {
    expect(libraryPageSrc).toContain("F{exercise.boyle_score}");
    expect(libraryPageSrc).toContain("Nível Fabrik");
    expect(libraryPageSrc).not.toContain(">B{exercise.boyle_score}<");
  });

  it("constante mantém compatibilidade interna, mas comentário público fala Escala Fabrik", () => {
    expect(taxonomyConstantsSrc).toContain("ESCALA FABRIK (1-5)");
    expect(taxonomyConstantsSrc).toContain("armazenada em boyle_score por compatibilidade");
    expect(taxonomyConstantsSrc).toContain("export const BOYLE_SCORE_SCALE");
  });
});
