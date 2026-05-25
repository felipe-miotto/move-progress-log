/**
 * Source-based coverage do PR que corrige dois bugs reais:
 *  1. Excluir prescrição pelo menu não abria confirmação (o AlertDialog
 *     estava dentro do bloco {selectedFolder && (...)} e nunca era
 *     renderizado para deletes de cards no "Sem Pasta"/raiz).
 *  2. Import Word permitia duplicar uma aba já salva e ficava confuso ao
 *     fechar (não havia rastreio de abas salvas; o nome era prefixado
 *     com ✅; hasWorkInProgress não levava em conta o que já fora salvo).
 *
 * Mesmo padrão dos demais *.coverage.test.ts.
 */
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const read = (rel: string) => readFileSync(resolve(__dirname, rel), "utf-8");

const prescriptionsPageSrc = read("../../pages/PrescriptionsPage.tsx");
const wordDialogSrc = read("../../components/ImportPrescriptionFromWordDialog.tsx");

describe("PR — delete prescription + Word multi-save fixes", () => {
  describe("Delete: AlertDialog renderizado fora de {selectedFolder && (...)}", () => {
    it("AlertDialog do delete usa deletePrescriptionDialogOpen", () => {
      expect(prescriptionsPageSrc).toContain(
        "<AlertDialog open={deletePrescriptionDialogOpen}",
      );
      expect(prescriptionsPageSrc).toContain("handleConfirmDeletePrescription");
    });

    it("o AlertDialog do delete aparece DEPOIS do fechamento do bloco {selectedFolder && (...)}", () => {
      const openIdx = prescriptionsPageSrc.indexOf("{selectedFolder && (");
      const closeIdx = prescriptionsPageSrc.indexOf("</>\n      )}", openIdx);
      const dialogIdx = prescriptionsPageSrc.indexOf(
        "<AlertDialog open={deletePrescriptionDialogOpen}",
      );
      expect(openIdx).toBeGreaterThan(-1);
      expect(closeIdx).toBeGreaterThan(openIdx);
      expect(dialogIdx).toBeGreaterThan(closeIdx);
    });

    it("o título e a ação 'Excluir' estão presentes", () => {
      expect(prescriptionsPageSrc).toContain("Excluir prescrição");
      expect(prescriptionsPageSrc).toMatch(
        /onClick=\{handleConfirmDeletePrescription\}/,
      );
    });
  });

  describe("Word import: anti-duplicação por aba", () => {
    it("importa useRef e declara submittingRef", () => {
      expect(wordDialogSrc).toMatch(
        /import\s*\{[^}]*\buseRef\b[^}]*\}\s*from\s*"react"/,
      );
      expect(wordDialogSrc).toMatch(/submittingRef\s*=\s*useRef/);
    });

    it("declara state savedIndexes: Set<number>", () => {
      expect(wordDialogSrc).toMatch(
        /\[savedIndexes,\s*setSavedIndexes\]\s*=\s*useState<Set<number>>/,
      );
    });

    it("resetState limpa savedIndexes e submittingRef", () => {
      expect(wordDialogSrc).toMatch(/setSavedIndexes\(new Set\(\)\)/);
      expect(wordDialogSrc).toMatch(/submittingRef\.current\s*=\s*false/);
    });

    it("handleConfirm guarda contra submit em curso e contra aba já salva", () => {
      const handler = wordDialogSrc.slice(
        wordDialogSrc.indexOf("const handleConfirm"),
      );
      expect(handler).toMatch(/if\s*\(submittingRef\.current\)\s*return/);
      expect(handler).toMatch(/if\s*\(savedIndexes\.has\(index\)\)\s*return/);
    });

    it("o hack do prefixo ✅ no name foi removido", () => {
      expect(wordDialogSrc).not.toContain("`✅ ${");
      expect(wordDialogSrc).not.toContain('replace("✅ ", "")');
    });

    it("handleConfirm marca o índice como salvo no sucesso", () => {
      const handler = wordDialogSrc.slice(
        wordDialogSrc.indexOf("const handleConfirm"),
      );
      expect(handler).toMatch(/newSaved\.add\(index\)/);
      expect(handler).toMatch(/setSavedIndexes\(newSaved\)/);
    });
  });

  describe("Word import: UI clara por aba", () => {
    it("botão primário diz 'Criar treino atual' ou 'Prescrição já criada'", () => {
      expect(wordDialogSrc).toContain("Criar treino atual");
      expect(wordDialogSrc).toContain("Prescrição já criada");
    });

    it("botão primário fica desabilitado quando a aba atual já foi salva", () => {
      expect(wordDialogSrc).toMatch(
        /disabled=\{[\s\S]*?savedIndexes\.has\(selectedIndex\)[\s\S]*?\}/,
      );
    });

    it("abas mostram status 'Salva' / 'Pendente'", () => {
      expect(wordDialogSrc).toContain("Salva");
      expect(wordDialogSrc).toContain("Pendente");
    });

    it("mostra banner 'Importação concluída' quando todas as abas estão salvas", () => {
      expect(wordDialogSrc).toMatch(/allSaved\s*=/);
      expect(wordDialogSrc).toContain("Importação concluída");
    });
  });

  describe("Word import: fechamento sensível ao estado salvo", () => {
    it("hasUnsavedWork considera prescrições não salvas, não apenas length>0", () => {
      expect(wordDialogSrc).toMatch(
        /hasUnsavedWork\s*=[\s\S]*?prescriptions\.length\s*>\s*savedIndexes\.size/,
      );
    });

    it("handleClose usa hasUnsavedWork (não a antiga hasWorkInProgress)", () => {
      expect(wordDialogSrc).not.toMatch(/hasWorkInProgress\s*=/);
      expect(wordDialogSrc).toMatch(
        /if\s*\(!open\s*&&\s*hasUnsavedWork\)/,
      );
    });

    it("AlertDialog varia título/ação quando há saves parciais", () => {
      expect(wordDialogSrc).toContain("Existem treinos não salvos");
      expect(wordDialogSrc).toContain("Sair mesmo assim");
      // ainda mantém a versão original para 0 salvos:
      expect(wordDialogSrc).toContain("Descartar importação?");
      expect(wordDialogSrc).toContain("Descartar");
    });
  });
});
