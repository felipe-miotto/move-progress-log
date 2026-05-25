/**
 * Source-based coverage do PR de "pasta destino" na importação e criação
 * de prescrição.
 *
 * Trava os invariantes sem precisar do banco nem de render — mesmo padrão
 * dos demais *.coverage.test.ts.
 */
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const read = (rel: string) => readFileSync(resolve(__dirname, rel), "utf-8");

const createUtilsSrc = read("../../hooks/prescriptionCreateUtils.ts");
const useFoldersSrc = read("../../hooks/useFolders.ts");
const wordDialogSrc = read("../../components/ImportPrescriptionFromWordDialog.tsx");
const createDialogSrc = read("../../components/CreatePrescriptionDialog.tsx");

describe("PR — pasta destino na criação/importação de prescrição", () => {
  describe("contrato (prescriptionCreateUtils)", () => {
    it("CreatePrescriptionInput aceita folder_id opcional", () => {
      // tipo declara folder_id como string | null | undefined opcional
      expect(createUtilsSrc).toMatch(
        /folder_id\?:\s*string\s*\|\s*null/,
      );
    });

    it("createPrescriptionWithRelations passa folder_id no insert (default null)", () => {
      // o objeto que vai pro insert tem folder_id: data.folder_id ?? null
      expect(createUtilsSrc).toMatch(
        /folder_id\s*:\s*data\.folder_id\s*\?\?\s*null/,
      );
    });
  });

  describe("helper de árvore (useFolders)", () => {
    it("useFolders exporta flattenFolderTree", () => {
      expect(useFoldersSrc).toMatch(
        /export\s+const\s+flattenFolderTree\s*=/,
      );
    });
  });

  describe("ImportPrescriptionFromWordDialog", () => {
    it("usa useFolders + flattenFolderTree", () => {
      expect(wordDialogSrc).toMatch(
        /import\s*\{[^}]*useFolders[^}]*flattenFolderTree[^}]*\}\s*from\s*"@\/hooks\/useFolders"/,
      );
      expect(wordDialogSrc).toContain("useFolders()");
      expect(wordDialogSrc).toContain("flattenFolderTree(folders)");
    });

    it("oferece a opção 'Raiz (sem pasta)' como padrão", () => {
      expect(wordDialogSrc).toContain('value="root"');
      expect(wordDialogSrc).toContain("Raiz (sem pasta)");
    });

    it("passa folder_id no createPrescription.mutateAsync", () => {
      // O ramo handleConfirm precisa incluir folder_id: folderId
      expect(wordDialogSrc).toMatch(
        /createPrescription\.mutateAsync\(\{[\s\S]*?folder_id:\s*folderId/,
      );
    });

    it("mantém importação sem pasta funcionando (folderId inicia null)", () => {
      // state default = null -> raiz
      expect(wordDialogSrc).toMatch(
        /useState<string\s*\|\s*null>\(null\)/,
      );
    });
  });

  describe("CreatePrescriptionDialog", () => {
    it("usa useFolders + flattenFolderTree", () => {
      expect(createDialogSrc).toMatch(
        /import\s*\{\s*useFolders\s*,\s*flattenFolderTree\s*\}\s*from\s*"@\/hooks\/useFolders"/,
      );
      expect(createDialogSrc).toContain("useFolders()");
      expect(createDialogSrc).toContain("flattenFolderTree(folders)");
    });

    it("oferece a opção 'Raiz (sem pasta)' como padrão", () => {
      expect(createDialogSrc).toContain('value="root"');
      expect(createDialogSrc).toContain("Raiz (sem pasta)");
    });

    it("passa folder_id no createPrescription.mutateAsync", () => {
      expect(createDialogSrc).toMatch(
        /createPrescription\.mutateAsync\(\{[\s\S]*?folder_id:\s*folderId/,
      );
    });
  });
});
