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

const precision12FiltersPath = resolve(__dirname, "../Precision12Filters.tsx");
const precision12FiltersSource = readFileSync(precision12FiltersPath, "utf-8");

const precision12ActionQueuePath = resolve(
  __dirname,
  "../Precision12ActionQueue.tsx",
);
const precision12ActionQueueSource = readFileSync(
  precision12ActionQueuePath,
  "utf-8",
);

const precision12ReissueDialogPath = resolve(
  __dirname,
  "../Precision12ReissueLinkDialog.tsx",
);
const precision12ReissueDialogSource = readFileSync(
  precision12ReissueDialogPath,
  "utf-8",
);

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

describe("E4.3a Precision12Console — filtros operacionais", () => {
  it("importa e renderiza Precision12Filters", () => {
    expect(precision12ConsoleSource).toContain(
      'from "./Precision12Filters"',
    );
    expect(precision12ConsoleSource).toContain("<Precision12Filters");
  });

  it("usa DEFAULT_PRECISION12_FILTERS como estado inicial", () => {
    expect(precision12ConsoleSource).toContain("DEFAULT_PRECISION12_FILTERS");
    expect(precision12ConsoleSource).toMatch(
      /useState<Precision12FiltersType>\(\s*DEFAULT_PRECISION12_FILTERS,?\s*\)/,
    );
  });

  it("aplica filterActionQueue e filterStudentsForProgress", () => {
    expect(precision12ConsoleSource).toContain("filterActionQueue");
    expect(precision12ConsoleSource).toContain("filterStudentsForProgress");
  });

  it("memoiza derivações filtradas com useMemo", () => {
    expect(precision12ConsoleSource).toContain("useMemo");
  });

  it("distingue empty-real de filter-empty na fila e na tabela", () => {
    // Empty real (sem dado): tratado nos componentes filhos / no early return.
    // Filter-empty: pelo console, comparando lengths.
    expect(precision12ConsoleSource).toContain(
      "data.actionQueue.length > 0 && filteredActionQueue.length === 0",
    );
    expect(precision12ConsoleSource).toContain(
      "data.students.length > 0 && filteredStudents.length === 0",
    );
  });

  it("expõe contador de smoke ocultos via countHiddenSmokeStudents", () => {
    expect(precision12ConsoleSource).toContain("countHiddenSmokeStudents");
    expect(precision12ConsoleSource).toContain("hiddenSmokeCount");
  });

  it("não introduz mutation (filtros são read-only)", () => {
    expect(precision12ConsoleSource).not.toContain("useMutation");
  });
});

describe("E4.3a Precision12Filters — sanity", () => {
  it("expõe as 4 superfícies de filtro (search, alertType, progressStatus, hideTestData)", () => {
    expect(precision12FiltersSource).toContain("searchQuery");
    expect(precision12FiltersSource).toContain("alertType");
    expect(precision12FiltersSource).toContain("progressStatus");
    expect(precision12FiltersSource).toContain("hideTestData");
  });

  it("usa Input + Select + Switch do shadcn", () => {
    expect(precision12FiltersSource).toContain(
      'from "@/components/ui/input"',
    );
    expect(precision12FiltersSource).toContain(
      'from "@/components/ui/select"',
    );
    expect(precision12FiltersSource).toContain(
      'from "@/components/ui/switch"',
    );
  });

  it("contém banner de smoke ocultos com microcopy explicativa", () => {
    expect(precision12FiltersSource).toContain("Dados de teste ocultos");
  });

  it("é read-only — propagado via onFiltersChange (sem fetch/mutation)", () => {
    expect(precision12FiltersSource).toContain("onFiltersChange");
    expect(precision12FiltersSource).not.toContain("useMutation");
    expect(precision12FiltersSource).not.toContain("supabase");
  });
});

describe("E4.4 Precision12ActionQueue — reissue UI integration", () => {
  it("importa canReissueQuestionnaireLink + Precision12ReissueLinkDialog", () => {
    expect(precision12ActionQueueSource).toContain(
      "canReissueQuestionnaireLink",
    );
    expect(precision12ActionQueueSource).toContain(
      'from "./Precision12ReissueLinkDialog"',
    );
  });

  it("renderiza botão Reemitir link condicionado por canReissueQuestionnaireLink", () => {
    expect(precision12ActionQueueSource).toMatch(
      /canReissueQuestionnaireLink\(item\)/,
    );
    expect(precision12ActionQueueSource).toContain("Reemitir link");
    // O botão só sai se `canReissue` for true.
    expect(precision12ActionQueueSource).toMatch(
      /canReissue\s*&&\s*item\.assessmentId\s*!==\s*null/,
    );
  });

  it("o click do botão NÃO chama edge — só abre o dialog (setReissueTarget)", () => {
    // A mutação só dispara dentro do dialog após confirmação. Aqui o
    // onClick apenas seta o target, garantindo confirmação intermediária.
    expect(precision12ActionQueueSource).toMatch(
      /onClick=\{\s*\(\)\s*=>\s*\n?\s*setReissueTarget\(/,
    );
    expect(precision12ActionQueueSource).not.toContain("supabase.functions.invoke");
    expect(precision12ActionQueueSource).not.toContain(".mutate(");
  });

  it("o dialog só monta quando há um target — close limpa o target", () => {
    expect(precision12ActionQueueSource).toMatch(
      /reissueTarget\s*&&\s*\(\s*\n?\s*<Precision12ReissueLinkDialog/,
    );
    expect(precision12ActionQueueSource).toMatch(/if\s*\(!open\)\s*setReissueTarget\(null\)/);
  });

  it("não introduz mutation direta de tabela (somente via dialog/edge)", () => {
    expect(precision12ActionQueueSource).not.toMatch(
      /supabase\.[a-z]+\.(insert|update|delete|upsert)/,
    );
    expect(precision12ActionQueueSource).not.toContain("useMutation");
  });
});

describe("E4.4 Precision12ReissueLinkDialog — controlled mutation", () => {
  it("chama exclusivamente a edge function create-precision12-questionnaire-link", () => {
    expect(precision12ReissueDialogSource).toContain(
      'supabase.functions.invoke<CreateLinkResponse>(\n        "create-precision12-questionnaire-link"',
    );
    // Nenhum acesso direto à tabela.
    expect(precision12ReissueDialogSource).not.toMatch(
      /supabase\.from\(/,
    );
    expect(precision12ReissueDialogSource).not.toMatch(
      /supabase\.[a-z]+\.(insert|update|delete|upsert)/,
    );
    // Nenhuma RPC.
    expect(precision12ReissueDialogSource).not.toMatch(/supabase\.rpc\(/);
  });

  it("envia assessment_id no body (modo reissue) + frontend_origin = window.location.origin", () => {
    expect(precision12ReissueDialogSource).toContain("assessment_id: assessmentId");
    expect(precision12ReissueDialogSource).toContain(
      "frontend_origin: window.location.origin",
    );
  });

  it("usa TanStack useMutation e invalida o cache do Coach Console no onSuccess", () => {
    expect(precision12ReissueDialogSource).toContain("useMutation");
    expect(precision12ReissueDialogSource).toMatch(
      /queryKey:\s*\[\s*["']precision12["']\s*,\s*["']coach-console["']\s*\]/,
    );
    expect(precision12ReissueDialogSource).toMatch(
      /queryKey:\s*\[\s*["']assessments["']\s*,\s*["']by-student["']\s*,\s*studentId\s*\]/,
    );
  });

  it("exige confirmação explícita antes de chamar a edge (mutation.mutate dentro de handleConfirm)", () => {
    expect(precision12ReissueDialogSource).toMatch(
      /const handleConfirm = \(\)\s*=>\s*\{[\s\S]*?mutation\.mutate\(/,
    );
    // Microcopy obrigatória.
    expect(precision12ReissueDialogSource).toContain(
      "Gerar um novo link revoga o anterior. Deseja continuar?",
    );
    // Botão de confirmar tem aria-label específico — não é clique acidental.
    expect(precision12ReissueDialogSource).toContain(
      'aria-label="Confirmar reemissão do link"',
    );
  });

  it("cancelar / fechar o dialog NÃO dispara a mutação", () => {
    // handleClose nunca invoca a mutação; só chama onOpenChange(false).
    expect(precision12ReissueDialogSource).toMatch(
      /const handleClose = \(\)\s*=>\s*\{[\s\S]*?onOpenChange\(false\)/,
    );
    // O único call site de mutation.mutate é handleConfirm, NUNCA handleClose.
    const mutateCalls = (
      precision12ReissueDialogSource.match(/mutation\.mutate\(/g) ?? []
    ).length;
    expect(mutateCalls).toBe(1);
  });

  it("traduz erro server-side 'Apenas avaliações in_progress permitem reemissão'", () => {
    expect(precision12ReissueDialogSource).toContain(
      "Apenas avaliações 'in_progress' permitem reemissão.",
    );
    expect(precision12ReissueDialogSource).toContain(
      "Este questionário não permite reemissão de link.",
    );
  });

  it("não persiste token/invite_url em localStorage/sessionStorage", () => {
    // Bloqueia chamadas REAIS de storage (comentários explicativos podem
    // mencionar o nome — o que importa é não haver `setItem`/`getItem`).
    expect(precision12ReissueDialogSource).not.toMatch(
      /\blocalStorage\s*\.\s*(setItem|getItem|removeItem)\b/,
    );
    expect(precision12ReissueDialogSource).not.toMatch(
      /\bsessionStorage\s*\.\s*(setItem|getItem|removeItem)\b/,
    );
    expect(precision12ReissueDialogSource).not.toMatch(
      /\b(localStorage|sessionStorage)\s*\[/,
    );
  });

  it("não loga invite_url/token em console", () => {
    expect(precision12ReissueDialogSource).not.toMatch(/console\.(log|info|warn|error|debug)\([^)]*\b(invite|token|invite_url|inviteUrl)\b/);
    // Defensivo extra: nenhum console.log em geral neste arquivo
    // (telemetria deveria ir por toast, não console).
    expect(precision12ReissueDialogSource).not.toMatch(/console\.log\(/);
  });

  it("não introduz mutation direta de tabela / RPC / migration / edge nova", () => {
    expect(precision12ReissueDialogSource).not.toMatch(/supabase\.from\(/);
    expect(precision12ReissueDialogSource).not.toMatch(/supabase\.rpc\(/);
  });

  it("oferece copiar + abrir em nova aba com noopener/noreferrer", () => {
    expect(precision12ReissueDialogSource).toContain(
      'navigator.clipboard.writeText',
    );
    expect(precision12ReissueDialogSource).toContain(
      '"_blank", "noopener,noreferrer"',
    );
  });
});
