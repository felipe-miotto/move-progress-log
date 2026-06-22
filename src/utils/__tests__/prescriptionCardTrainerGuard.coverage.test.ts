/**
 * Source-based coverage: o botão "Registrar Sessão" no PrescriptionCard abre o
 * registro de sessão em grupo (ação de treinador) e deve ficar escondido para
 * aluno (user). RLS já bloqueia no backend; isto evita expor um botão que
 * falharia. Lê a fonte SEM comentários (stripComments) para travar o código real.
 */
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function read(rel: string) {
  return readFileSync(resolve(__dirname, "../../..", rel), "utf-8");
}

const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*\n/g, "");

const cardSource = stripComments(read("src/components/PrescriptionCard.tsx"));

describe("PrescriptionCard — 'Registrar Sessão' (grupo) só para treinador/admin", () => {
  it("importa e usa useIsModerator", () => {
    expect(cardSource).toContain('from "@/hooks/useUserRole"');
    expect(cardSource).toContain("useIsModerator()");
  });

  it("o botão 'Registrar Sessão' (onAddSession) só renderiza dentro do guard", () => {
    // Existe exatamente UM gatilho de onAddSession...
    const triggers = cardSource.match(/onAddSession\(prescription\.id\)/g) ?? [];
    expect(triggers).toHaveLength(1);
    // ...e ele precisa estar DENTRO do guard isModerator.
    expect(cardSource).toMatch(/\{isModerator && \([\s\S]*?onAddSession\(prescription\.id\)/);
  });
});
