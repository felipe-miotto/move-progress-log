/**
 * Source-based coverage do PR 1 — profundidade de pastas de prescrição
 * elevada de 3 para 5 níveis.
 *
 * Trava os invariantes da migration `increase_folder_depth_to_5` e do
 * frontend (constante MAX_FOLDER_DEPTH) sem precisar de Postgres nem de
 * render — mesmo padrão dos demais *.coverage.test.ts.
 */
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const read = (rel: string) => readFileSync(resolve(__dirname, rel), "utf-8");

const migrationSql = read(
  "../../../supabase/migrations/20260522090237_increase_folder_depth_to_5.sql",
);
const useFoldersSrc = read("../../hooks/useFolders.ts");
const folderTreeSrc = read("../../components/FolderTree.tsx");
const createSubfolderSrc = read("../../components/CreateSubfolderDialog.tsx");

/** Migration sem comentários SQL — para asserts de "não deve conter". */
const migrationCode = migrationSql
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/--[^\n]*/g, " ");

describe("PR1 — profundidade de pastas (3 -> 5)", () => {
  describe("migration increase_folder_depth_to_5", () => {
    it("altera a constraint check_max_depth para depth_level <= 5", () => {
      expect(migrationCode).toMatch(
        /add\s+constraint\s+check_max_depth\s+check\s*\(\s*depth_level\s*<=\s*5\s*\)/i,
      );
      expect(migrationCode).not.toMatch(/depth_level\s*<=\s*3/);
    });

    it("atualiza o limite do trigger e a mensagem para 5 níveis", () => {
      expect(migrationCode).toMatch(/parent_depth\s*>=\s*5/i);
      expect(migrationSql).toContain("Maximum folder depth (5 levels) exceeded");
      expect(migrationCode).not.toContain("(3 levels)");
    });

    it("preserva SECURITY DEFINER e search_path da função", () => {
      expect(migrationCode).toMatch(/security\s+definer/i);
      expect(migrationCode).toMatch(/set\s+search_path\s*=\s*public/i);
    });

    it("cria o índice composto idx_prescription_folders_trainer_parent_order com IF NOT EXISTS", () => {
      expect(migrationCode).toMatch(
        /create\s+index\s+if\s+not\s+exists\s+idx_prescription_folders_trainer_parent_order/i,
      );
      expect(migrationCode).toMatch(
        /\(\s*trainer_id\s*,\s*parent_id\s*,\s*order_index\s*\)/i,
      );
    });
  });

  describe("frontend usa MAX_FOLDER_DEPTH", () => {
    it("useFolders exporta MAX_FOLDER_DEPTH = 5", () => {
      expect(useFoldersSrc).toMatch(/export\s+const\s+MAX_FOLDER_DEPTH\s*=\s*5/);
    });

    it("FolderTree usa MAX_FOLDER_DEPTH e não tem depth_level < 3 hardcoded", () => {
      expect(folderTreeSrc).toContain("MAX_FOLDER_DEPTH");
      expect(folderTreeSrc).not.toMatch(/depth_level\s*<\s*3\b/);
    });

    it("CreateSubfolderDialog usa MAX_FOLDER_DEPTH e não tem depth_level < 3 hardcoded", () => {
      expect(createSubfolderSrc).toContain("MAX_FOLDER_DEPTH");
      expect(createSubfolderSrc).not.toMatch(/depth_level\s*<\s*3\b/);
    });
  });

  describe("nenhum texto de UI menciona '3 níveis'", () => {
    it("FolderTree e CreateSubfolderDialog não contêm '3 níveis'", () => {
      expect(folderTreeSrc).not.toContain("3 níveis");
      expect(createSubfolderSrc).not.toContain("3 níveis");
      expect(createSubfolderSrc).toContain("5 níveis");
    });
  });
});
