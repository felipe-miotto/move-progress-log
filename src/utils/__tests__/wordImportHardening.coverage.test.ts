/**
 * Source-based coverage do PR de hardening do modal Word de prescrições.
 *
 * Trava dois invariantes adicionados sobre o sistema já em main:
 *  - Busca de exercício no Combobox é case- e acento-insensitive.
 *  - O modal não fecha por acidente quando há revisão em andamento.
 *
 * Mesmo padrão dos demais *.coverage.test.ts (readFileSync + asserts no
 * fonte) — sem render, sem Postgres.
 */
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const read = (rel: string) => readFileSync(resolve(__dirname, rel), "utf-8");

const wordDialogSrc = read("../../components/ImportPrescriptionFromWordDialog.tsx");
const comboboxSrc = read("../../components/ExerciseCombobox.tsx");

describe("PR — Word import hardening", () => {
  describe("Busca de exercício case- e acento-insensitive", () => {
    it("ExerciseCombobox importa e usa matchesSearch", () => {
      expect(comboboxSrc).toMatch(
        /import\s*\{\s*matchesSearch\s*\}\s*from\s*"@\/utils\/searchNormalize"/,
      );
      expect(comboboxSrc).toMatch(/matchesSearch\(value,\s*search\)/);
    });

    it("filtro antigo de tokens com startsWith foi removido", () => {
      expect(comboboxSrc).not.toMatch(/\.startsWith\(st\)/);
      expect(comboboxSrc).not.toMatch(/searchTokens\.every/);
    });
  });

  describe("Proteção contra fechamento acidental", () => {
    it("importa AlertDialog para a confirmação de descarte", () => {
      expect(wordDialogSrc).toMatch(
        /import\s*\{[\s\S]*?AlertDialog[\s\S]*?\}\s*from\s*"@\/components\/ui\/alert-dialog"/,
      );
    });

    it("declara state confirmDiscardOpen e const de trabalho não salvo", () => {
      // Nome original era hasWorkInProgress; agora é hasUnsavedWork
      // (mais preciso — só conta abas ainda não salvas neste lote).
      expect(wordDialogSrc).toMatch(
        /\[confirmDiscardOpen,\s*setConfirmDiscardOpen\]/,
      );
      expect(wordDialogSrc).toMatch(/const\s+hasUnsavedWork\s*=/);
    });

    it("o indicador de trabalho não salvo detecta abas pendentes (não só length>0)", () => {
      // Antes: prescriptions.length > 0. Depois do multi-save fix:
      // prescriptions.length > savedIndexes.size (ignora abas já criadas).
      expect(wordDialogSrc).toMatch(
        /hasUnsavedWork\s*=[\s\S]*?step\s*===\s*"review"[\s\S]*?prescriptions\.length\s*>\s*savedIndexes\.size/,
      );
    });

    it("handleClose intercepta o close quando há trabalho NÃO salvo", () => {
      expect(wordDialogSrc).toMatch(
        /if\s*\(!open\s*&&\s*hasUnsavedWork\)\s*\{\s*setConfirmDiscardOpen\(true\)/,
      );
    });

    it("estado inicial / parsing ainda fecha normalmente (sem interceptação)", () => {
      // O caminho default mantém o resetState + onOpenChange originais
      // após o ramo de interceptação. Sem hasWorkInProgress, o fluxo segue
      // como antes.
      expect(wordDialogSrc).toMatch(
        /if\s*\(!open\)\s*resetState\(\);\s*onOpenChange\(open\)/,
      );
    });

    it("AlertDialog mostra 'Descartar importação?' (e variante 'Existem treinos não salvos') com Continuar/Descartar", () => {
      // O título agora é condicional (varia conforme há ou não abas
      // salvas), mas os dois textos coexistem no source via ternário.
      expect(wordDialogSrc).toContain("Descartar importação?");
      expect(wordDialogSrc).toContain("Existem treinos não salvos");
      expect(wordDialogSrc).toMatch(
        /<AlertDialogCancel>\s*Continuar revisando\s*<\/AlertDialogCancel>/,
      );
      // A ação do confirm aparece com label condicional:
      // {hasAnySaved ? "Sair mesmo assim" : "Descartar"}.
      expect(wordDialogSrc).toMatch(
        /<AlertDialogAction[\s\S]*?onClick=\{handleConfirmDiscard\}[\s\S]*?<\/AlertDialogAction>/,
      );
      expect(wordDialogSrc).toContain('"Descartar"');
      expect(wordDialogSrc).toContain('"Sair mesmo assim"');
    });

    it("'Continuar revisando' é AlertDialogCancel (não chama reset; preserva estado)", () => {
      // AlertDialogCancel default só fecha a AlertDialog; o modal pai
      // permanece aberto e o state in-memory (passos, matches, folderId)
      // continua intacto.
      const cancelTagMatch = wordDialogSrc.match(
        /<AlertDialogCancel[^>]*>\s*Continuar revisando\s*<\/AlertDialogCancel>/,
      );
      expect(cancelTagMatch).not.toBeNull();
      // sem onClick que dispare resetState no Cancel:
      expect(cancelTagMatch?.[0]).not.toMatch(/onClick/);
    });

    it("handleConfirmDiscard reseta o state e fecha o modal", () => {
      expect(wordDialogSrc).toMatch(
        /const\s+handleConfirmDiscard[\s\S]*?resetState\(\)[\s\S]*?onOpenChange\(false\)/,
      );
    });
  });
});
