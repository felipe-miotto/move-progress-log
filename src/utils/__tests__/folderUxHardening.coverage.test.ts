/**
 * Source-based coverage do PR de UX hardening do sistema de pastas.
 *
 * Trava invariantes de UX adicionados sobre o sistema técnico já em main
 * (depth 5 + move_prescription_folder RPC): "Sem Pasta" sempre visível,
 * indentação enxuta, feedback de drag-over reforçado, toasts para drops
 * inválidos e indicação clara quando a pasta atinge MAX_FOLDER_DEPTH.
 *
 * Mesmo padrão dos demais *.coverage.test.ts (readFileSync + asserts no
 * fonte) — sem Postgres, sem render.
 */
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const read = (rel: string) => readFileSync(resolve(__dirname, rel), "utf-8");

const prescriptionsPageSrc = read("../../pages/PrescriptionsPage.tsx");
const folderTreeSrc = read("../../components/FolderTree.tsx");
const folderSectionSrc = read("../../components/FolderSection.tsx");

describe("PR UX hardening — pastas de prescrição", () => {
  describe("Sem Pasta / raiz sempre visível", () => {
    it("FolderSection não é mais condicionado a noFolderPrescriptions.length", () => {
      // O antigo guard era:
      //   (noFolderPrescriptions.length > 0 || activeDragType === 'folder')
      // Após o hardening, esse guard sumiu e o FolderSection é renderizado
      // sem condição.
      expect(prescriptionsPageSrc).not.toMatch(
        /noFolderPrescriptions\.length\s*>\s*0\s*\|\|\s*activeDragType/,
      );
      expect(prescriptionsPageSrc).toContain("<FolderSection");
    });

    it("FolderSection usa 'Sem prescrições fora de pasta' como vazio", () => {
      expect(folderSectionSrc).toContain("Sem prescrições fora de pasta");
      expect(folderSectionSrc).not.toContain("Nenhuma prescrição sem pasta");
    });
  });

  describe("Indentação enxuta da árvore", () => {
    it("FolderTree não usa mais ml-8 no conteúdo expandido", () => {
      expect(folderTreeSrc).not.toMatch(/className="ml-8\b/);
    });

    it("FolderTree não usa paddingLeft 20px na recursão", () => {
      expect(folderTreeSrc).not.toContain("'20px'");
    });

    it("PrescriptionsPage envolve FolderTree em overflow-x-auto", () => {
      expect(prescriptionsPageSrc).toMatch(
        /overflow-x-auto[\s\S]{0,200}<FolderTree/,
      );
    });
  });

  describe("Feedback visual de drag-over reforçado", () => {
    it("FolderTree adiciona ring no estado dropAccepted", () => {
      expect(folderTreeSrc).toMatch(
        /dropAccepted\s*&&\s*"[^"]*ring-2[^"]*ring-primary/,
      );
    });

    it("FolderTree adiciona ring/cursor-not-allowed no estado dropRejected", () => {
      expect(folderTreeSrc).toMatch(
        /dropRejected\s*&&\s*"[^"]*ring-2[^"]*ring-destructive/,
      );
      expect(folderTreeSrc).toMatch(
        /dropRejected\s*&&\s*"[^"]*cursor-not-allowed/,
      );
    });
  });

  describe("Toasts informativos para drops inválidos", () => {
    it("PrescriptionsPage importa notify de @/lib/notify", () => {
      expect(prescriptionsPageSrc).toMatch(
        /import\s*\{\s*notify\s*\}\s*from\s*"@\/lib\/notify"/,
      );
    });

    it("ramo de folder drag chama notify.info pelo menos 3 vezes (self, descendente, profundidade)", () => {
      const folderBranchStart = prescriptionsPageSrc.indexOf(
        "active.data.current?.type === 'folder'",
      );
      const prescriptionBranchStart = prescriptionsPageSrc.indexOf(
        "// --- Prescription drag",
      );
      expect(folderBranchStart).toBeGreaterThan(-1);
      expect(prescriptionBranchStart).toBeGreaterThan(folderBranchStart);

      const folderBranch = prescriptionsPageSrc.slice(
        folderBranchStart,
        prescriptionBranchStart,
      );
      const infoCalls = folderBranch.match(/notify\.info\(/g) ?? [];
      expect(infoCalls.length).toBeGreaterThanOrEqual(3);
    });

    it("usa MAX_FOLDER_DEPTH e getFolderSubtreeHeight no guard de profundidade", () => {
      expect(prescriptionsPageSrc).toContain("MAX_FOLDER_DEPTH");
      expect(prescriptionsPageSrc).toContain("getFolderSubtreeHeight");
    });
  });

  describe("Indicação de limite máximo de profundidade", () => {
    it("FolderTree mostra 'Limite de 5 níveis atingido' quando não cabe subpasta", () => {
      expect(folderTreeSrc).toContain("Limite de 5 níveis atingido");
      // Continua não permitindo o botão clicável de criar subpasta no nível 5.
      expect(folderTreeSrc).toMatch(/canHaveSubfolders\s*\?/);
    });
  });
});
