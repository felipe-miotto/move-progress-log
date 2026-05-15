/**
 * E4.2 — Sanity tests source-based pra integração do Coach Console
 * Precision 12. Sem DOM/testing-library — apenas invariantes textuais
 * verificáveis pela leitura do código-fonte, no padrão do
 * QuestionnaireLinkPanel.coverage.test.ts.
 */

import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const coachConsolePath = resolve(
  __dirname,
  "../../../pages/CoachConsole.tsx",
);
const coachConsoleSource = readFileSync(coachConsolePath, "utf-8");

const precision12ConsolePath = resolve(__dirname, "../Precision12Console.tsx");
const precision12ConsoleSource = readFileSync(precision12ConsolePath, "utf-8");

describe("E4.2 CoachConsole — sanity", () => {
  it("registra a tab 'precision12' no type Tab", () => {
    expect(coachConsoleSource).toMatch(
      /type\s+Tab\s*=[^;]*'precision12'/,
    );
  });

  it("importa Precision12Console", () => {
    expect(coachConsoleSource).toContain(
      "from '@/components/precision12/Precision12Console'",
    );
  });

  it("renderiza Precision12Console quando tab === 'precision12'", () => {
    expect(coachConsoleSource).toMatch(
      /tab\s*===\s*'precision12'\s*&&\s*<Precision12Console\s*\/>/,
    );
  });

  it("preserva as 3 tabs originais (AI Coach, Analista, Relatório)", () => {
    // Regressão: a tab Precision 12 não pode remover as existentes.
    expect(coachConsoleSource).toContain("'coach'");
    expect(coachConsoleSource).toContain("'analyst'");
    expect(coachConsoleSource).toContain("'report'");
    expect(coachConsoleSource).toContain("AI Coach");
    expect(coachConsoleSource).toContain("Analista");
    expect(coachConsoleSource).toContain("Relatório");
  });
});

describe("E4.2 Precision12Console — sanity", () => {
  it("invoca o hook usePrecision12CoachConsole", () => {
    expect(precision12ConsoleSource).toContain("usePrecision12CoachConsole");
    expect(precision12ConsoleSource).toContain(
      'from "@/hooks/usePrecision12CoachConsole"',
    );
  });

  it("compõe os 3 sub-componentes do E4.2", () => {
    expect(precision12ConsoleSource).toContain("<Precision12KpiCards");
    expect(precision12ConsoleSource).toContain("<Precision12ActionQueue");
    expect(precision12ConsoleSource).toContain(
      "<Precision12StudentProgressTable",
    );
  });

  it("trata os 3 estados do hook (loading / error / empty) antes de renderizar", () => {
    // Loading skeleton, alerta de erro, e empty state pro caso de 0 alunos.
    expect(precision12ConsoleSource).toContain("query.isLoading");
    expect(precision12ConsoleSource).toContain("query.isError");
    expect(precision12ConsoleSource).toMatch(/students\.length\s*===\s*0/);
  });

  it("não introduz mutation (read-only nesta etapa)", () => {
    expect(precision12ConsoleSource).not.toContain("useMutation");
    expect(precision12ConsoleSource).not.toMatch(/supabase\.[a-z]+\.(insert|update|delete|upsert)/);
  });
});
