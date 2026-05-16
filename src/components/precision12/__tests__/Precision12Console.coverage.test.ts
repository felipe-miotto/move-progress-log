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

const precision12RevokeDialogPath = resolve(
  __dirname,
  "../Precision12RevokeLinkDialog.tsx",
);
const precision12RevokeDialogSource = readFileSync(
  precision12RevokeDialogPath,
  "utf-8",
);

const revokeEdgePath = resolve(
  __dirname,
  "../../../../supabase/functions/revoke-precision12-questionnaire-link/index.ts",
);
const revokeEdgeSource = readFileSync(revokeEdgePath, "utf-8");

// E5.6b — também referenciamos o preview pra validar heading hierarchy.
const precision12EvidencePreviewPath = resolve(
  __dirname,
  "../evidence/Precision12EvidencePreview.tsx",
);
const precision12EvidencePreviewSource = readFileSync(
  precision12EvidencePreviewPath,
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

  it("renderiza botão Gerar novo link condicionado por canReissueQuestionnaireLink (E5.6b/N-1)", () => {
    expect(precision12ActionQueueSource).toMatch(
      /canReissueQuestionnaireLink\(item\)/,
    );
    // E5.6b/N-1: microcopy alinhada ao dialog (era "Reemitir link", agora
    // "Gerar novo link" — mesma string visível tanto na fila quanto no
    // título do dialog confirmação).
    expect(precision12ActionQueueSource).toMatch(
      />\s*\n\s*Gerar novo link\s*\n\s*</,
    );
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
    // E5.6b/N-1: aria-label alinhado à microcopy nova ("Gerar novo link"
    // em vez de "Reemitir link" / "Reemissão").
    expect(precision12ReissueDialogSource).toContain(
      'aria-label="Confirmar geração do novo link"',
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
    // O texto do erro server-side em si é contrato com a edge function e
    // NÃO muda (continua "reemissão"). Apenas a tradução para o coach
    // foi alinhada à microcopy E5.6b/N-1 ("gerar novo link").
    expect(precision12ReissueDialogSource).toContain(
      "Apenas avaliações 'in_progress' permitem reemissão.",
    );
    expect(precision12ReissueDialogSource).toContain(
      "Este questionário não permite gerar novo link.",
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

describe("E4.5 Precision12ActionQueue — revoke UI integration", () => {
  it("importa canRevokeQuestionnaireLink + Precision12RevokeLinkDialog", () => {
    expect(precision12ActionQueueSource).toContain(
      "canRevokeQuestionnaireLink",
    );
    expect(precision12ActionQueueSource).toContain(
      'from "./Precision12RevokeLinkDialog"',
    );
  });

  it("renderiza botão Revogar condicionado por canRevoke + assessmentId (E5.6b/F-2)", () => {
    expect(precision12ActionQueueSource).toMatch(
      /canRevokeQuestionnaireLink\(\s*item\s*,\s*activeLinkAssessmentIds\s*,?\s*\)/,
    );
    // E5.6b/F-2: label simplificado pra "Revogar" (sem "link") — a coluna
    // Ações precisa caber em w-[340px] sem quebrar; e visualmente o caráter
    // destrutivo agora é sinalizado pelas classes (border-destructive/text-
    // destructive), não pelo texto.
    expect(precision12ActionQueueSource).toMatch(/>\s*\n\s*Revogar\s*\n\s*</);
    expect(precision12ActionQueueSource).toMatch(
      /canRevoke\s*&&\s*item\.assessmentId\s*!==\s*null/,
    );
  });

  it("o click do botão NÃO chama edge — só abre o dialog (setRevokeTarget)", () => {
    expect(precision12ActionQueueSource).toMatch(
      /onClick=\{\s*\(\)\s*=>\s*\n?\s*setRevokeTarget\(/,
    );
    expect(precision12ActionQueueSource).not.toContain(
      "supabase.functions.invoke",
    );
  });

  it("o dialog só monta quando há um target — close limpa o target", () => {
    expect(precision12ActionQueueSource).toMatch(
      /revokeTarget\s*&&\s*\(\s*\n?\s*<Precision12RevokeLinkDialog/,
    );
    expect(precision12ActionQueueSource).toMatch(
      /if\s*\(!open\)\s*setRevokeTarget\(null\)/,
    );
  });

  it("aceita prop activeLinkAssessmentIds (default vazio)", () => {
    expect(precision12ActionQueueSource).toContain(
      "activeLinkAssessmentIds",
    );
    expect(precision12ActionQueueSource).toContain(
      "EMPTY_ACTIVE_LINK_IDS",
    );
  });
});

describe("E4.5 Precision12RevokeLinkDialog — controlled mutation", () => {
  it("chama exclusivamente a edge function revoke-precision12-questionnaire-link", () => {
    expect(precision12RevokeDialogSource).toContain(
      'supabase.functions.invoke<RevokeLinkResponse>(\n        "revoke-precision12-questionnaire-link"',
    );
    expect(precision12RevokeDialogSource).not.toMatch(/supabase\.from\(/);
    expect(precision12RevokeDialogSource).not.toMatch(
      /supabase\.[a-z]+\.(insert|update|delete|upsert)/,
    );
    expect(precision12RevokeDialogSource).not.toMatch(/supabase\.rpc\(/);
  });

  it("envia exatamente { student_id, assessment_id } no body — sem extras", () => {
    expect(precision12RevokeDialogSource).toContain(
      "student_id: studentId,",
    );
    expect(precision12RevokeDialogSource).toContain(
      "assessment_id: assessmentId,",
    );
    // Sem invite_url, sem token, sem frontend_origin (revoke não precisa de URL):
    expect(precision12RevokeDialogSource).not.toContain(
      "frontend_origin",
    );
  });

  it("usa TanStack useMutation e invalida o cache do Coach Console no onSuccess", () => {
    expect(precision12RevokeDialogSource).toContain("useMutation");
    expect(precision12RevokeDialogSource).toMatch(
      /queryKey:\s*\[\s*["']precision12["']\s*,\s*["']coach-console["']\s*\]/,
    );
    expect(precision12RevokeDialogSource).toMatch(
      /queryKey:\s*\[\s*["']assessments["']\s*,\s*["']by-student["']\s*,\s*studentId\s*\]/,
    );
  });

  it("exige confirmação explícita antes de chamar a edge", () => {
    expect(precision12RevokeDialogSource).toMatch(
      /const handleConfirm = \(\)\s*=>\s*\{[\s\S]*?mutation\.mutate\(/,
    );
    expect(precision12RevokeDialogSource).toContain(
      "Revogar este link impedirá que o aluno responda por ele. Deseja continuar?",
    );
    expect(precision12RevokeDialogSource).toContain(
      'aria-label="Confirmar revogação do link"',
    );
  });

  it("cancelar / fechar o dialog NÃO dispara a mutação (mutation.mutate aparece 1 vez)", () => {
    expect(precision12RevokeDialogSource).toMatch(
      /const handleClose = \(\)\s*=>\s*\{[\s\S]*?onOpenChange\(false\)/,
    );
    const mutateCalls = (
      precision12RevokeDialogSource.match(/mutation\.mutate\(/g) ?? []
    ).length;
    expect(mutateCalls).toBe(1);
  });

  it("traduz erro server-side 'Nenhum link ativo para revogar.'", () => {
    expect(precision12RevokeDialogSource).toContain(
      "Nenhum link ativo para revogar.",
    );
    expect(precision12RevokeDialogSource).toContain(
      "Nenhum link ativo encontrado",
    );
  });

  it("não persiste em localStorage/sessionStorage", () => {
    expect(precision12RevokeDialogSource).not.toMatch(
      /\blocalStorage\s*\.\s*(setItem|getItem|removeItem)\b/,
    );
    expect(precision12RevokeDialogSource).not.toMatch(
      /\bsessionStorage\s*\.\s*(setItem|getItem|removeItem)\b/,
    );
    expect(precision12RevokeDialogSource).not.toMatch(
      /\b(localStorage|sessionStorage)\s*\[/,
    );
  });

  it("não loga token/link em console", () => {
    expect(precision12RevokeDialogSource).not.toMatch(/console\.log\(/);
    expect(precision12RevokeDialogSource).not.toMatch(
      /console\.(info|warn|error|debug)\([^)]*\b(invite|token|invite_url|inviteUrl)\b/,
    );
  });

  it("não introduz mutation direta de tabela / RPC", () => {
    expect(precision12RevokeDialogSource).not.toMatch(/supabase\.from\(/);
    expect(precision12RevokeDialogSource).not.toMatch(/supabase\.rpc\(/);
  });

  it("não expõe link/URL — revoke response não contém invite_url", () => {
    // O contract da edge é { ok, revoked_at }; o dialog não deve referenciar
    // navegação ou abrir link após revoke.
    expect(precision12RevokeDialogSource).not.toContain("window.open");
    expect(precision12RevokeDialogSource).not.toContain("navigator.clipboard");
    expect(precision12RevokeDialogSource).not.toContain("invite_url");
  });
});

describe("E4.5 revoke-precision12-questionnaire-link edge fn — security invariants", () => {
  it("valida JWT antes de qualquer escrita (Authorization Bearer + auth.getUser)", () => {
    expect(revokeEdgeSource).toContain('req.headers.get("Authorization")');
    expect(revokeEdgeSource).toContain("Bearer ");
    expect(revokeEdgeSource).toContain("userClient.auth.getUser()");
    // Resposta 401 explícita caso falte JWT ou getUser falhe.
    expect(revokeEdgeSource).toMatch(/jsonResponse\(\{\s*error:\s*"Unauthorized"\s*\}\s*,\s*401\)/);
  });

  it("checa role admin via user_roles antes de operar como service role", () => {
    expect(revokeEdgeSource).toContain('"user_roles"');
    expect(revokeEdgeSource).toMatch(/\.eq\(\s*"role"\s*,\s*"admin"\s*\)/);
    expect(revokeEdgeSource).toContain("isAdmin");
  });

  it("valida ownership (admin OU trainer dono) antes do UPDATE", () => {
    expect(revokeEdgeSource).toMatch(
      /if\s*\(\s*!isAdmin\s*&&\s*student\.trainer_id\s*!==\s*user\.id\s*\)/,
    );
    expect(revokeEdgeSource).toMatch(/jsonResponse\([^,]*,\s*403\)/);
  });

  it("valida assessment_type === questionnaire_precision12", () => {
    expect(revokeEdgeSource).toContain('"questionnaire_precision12"');
    expect(revokeEdgeSource).toMatch(
      /assessment\.assessment_type\s*!==\s*ASSESSMENT_TYPE/,
    );
  });

  it("permite revogar APENAS quando status === in_progress (allowlist)", () => {
    expect(revokeEdgeSource).toContain("REVOCABLE_ASSESSMENT_STATUSES");
    expect(revokeEdgeSource).toMatch(
      /new Set\(\s*\[\s*"in_progress"\s*\]\s*\)/,
    );
    expect(revokeEdgeSource).toMatch(
      /!REVOCABLE_ASSESSMENT_STATUSES\.has\(assessment\.status\)/,
    );
  });

  it("UPDATE só toca rows ATIVAS (assessment_id + student_id + used_at IS NULL + revoked_at IS NULL)", () => {
    expect(revokeEdgeSource).toMatch(
      /\.update\(\{\s*revoked_at:\s*nowIso\s*\}\)/,
    );
    expect(revokeEdgeSource).toMatch(
      /\.eq\(\s*"assessment_id"\s*,\s*assessmentId\s*\)/,
    );
    // Defesa em profundidade — o spec da auditoria E4.5 exige filtro
    // explícito por student_id no UPDATE, além da validação prévia de
    // `assessment.student_id === studentId`.
    expect(revokeEdgeSource).toMatch(
      /\.eq\(\s*"student_id"\s*,\s*studentId\s*\)/,
    );
    expect(revokeEdgeSource).toMatch(/\.is\(\s*"used_at"\s*,\s*null\s*\)/);
    expect(revokeEdgeSource).toMatch(/\.is\(\s*"revoked_at"\s*,\s*null\s*\)/);
  });

  it("retorna 404 quando affectedCount === 0 (sem link ativo)", () => {
    expect(revokeEdgeSource).toMatch(/affectedCount\s*===\s*0/);
    expect(revokeEdgeSource).toContain("Nenhum link ativo para revogar.");
  });

  it("não cria assessment, não toca questionnaire_responses, não emite link novo", () => {
    // Asserções strictly checam acessos a tabela / chamadas reais; comentários
    // explicativos podem mencionar nomes (e.g. "Não toca questionnaire_responses").
    expect(revokeEdgeSource).not.toContain(".insert(");
    expect(revokeEdgeSource).not.toMatch(
      /\.from\(\s*["']questionnaire_responses["']\s*\)/,
    );
    expect(revokeEdgeSource).not.toContain("invite_url");
    expect(revokeEdgeSource).not.toContain("generateToken");
    expect(revokeEdgeSource).not.toContain("token_hash");
  });

  it("retorna shape { ok: true, revoked_at }", () => {
    expect(revokeEdgeSource).toMatch(/ok:\s*true/);
    expect(revokeEdgeSource).toContain("revoked_at: nowIso");
  });
});

describe("E4.6 Precision12 — DEXA alert wiring", () => {
  it("Filtros: ALERT_TYPE_OPTIONS inclui dexa_pending com label 'DEXA pendente'", () => {
    expect(precision12FiltersSource).toContain(
      'value: "dexa_pending", label: "DEXA pendente"',
    );
  });

  it("ActionQueue: ALERT_LABEL.dexa_pending = 'DEXA pendente'", () => {
    expect(precision12ActionQueueSource).toMatch(
      /dexa_pending:\s*["']DEXA pendente["']/,
    );
  });

  it("ActionQueue: tem variant pra dexa_pending (qualquer um dos válidos)", () => {
    // Garantia que o Record<ActionQueueAlertType, ...> está completo.
    expect(precision12ActionQueueSource).toMatch(
      /dexa_pending:\s*["'](?:default|secondary|destructive|outline)["']/,
    );
  });

  it("ActionQueue: DEXA_REASON_LABEL mapeia as 3 razões da spec", () => {
    expect(precision12ActionQueueSource).toContain("awaiting_pdf_and_data");
    expect(precision12ActionQueueSource).toContain("missing_pdf");
    expect(precision12ActionQueueSource).toContain("incomplete_data");
    expect(precision12ActionQueueSource).toContain("DEXA aguardando laudo");
    expect(precision12ActionQueueSource).toContain("DEXA sem PDF anexado");
    expect(precision12ActionQueueSource).toContain("DEXA incompleto");
  });

  it("ActionQueue: subLabel usa DEXA_REASON_LABEL quando alertType === 'dexa_pending'", () => {
    expect(precision12ActionQueueSource).toMatch(
      /alertType\s*===\s*["']dexa_pending["']\s*&&\s*item\.dexaPendingReason/,
    );
    expect(precision12ActionQueueSource).toContain("DEXA_REASON_LABEL");
  });

  it("ActionQueue: continua sem mutation/insert/update/delete/upsert (alerta é read-only)", () => {
    expect(precision12ActionQueueSource).not.toMatch(
      /supabase\.[a-z]+\.(insert|update|delete|upsert)/,
    );
    expect(precision12ActionQueueSource).not.toMatch(/supabase\.rpc\(/);
  });
});

// ── E5.6b — UI/UX hardening (auditoria pós-E5.6a) ───────────────────────────

describe("E5.6b — fila: F-1 altura estável + F-3 ordem + F-2 destrutivo diferenciado", () => {
  it("F-1: coluna 'Ações' tem w-[380px] pra comportar os 3 botões sem flex-wrap (corrigido na auditoria)", () => {
    // Auditoria mediu botões reais: Abrir ~80px + Gerar novo link ~140px +
    // Revogar ~88px + 2 gaps = ~316px. w-[340px] (interno 308px) NÃO cabia
    // — gerava overflow horizontal. w-[380px] (interno 348px) dá folga.
    expect(precision12ActionQueueSource).toContain('w-[380px] text-right');
    // Defesa: tamanhos antigos não podem reaparecer (regressão).
    expect(precision12ActionQueueSource).not.toContain('w-[260px]');
    expect(precision12ActionQueueSource).not.toContain('w-[340px] text-right');
  });

  it("F-1: container de ações NÃO usa flex-wrap (era o gerador da altura inconsistente 77→101px)", () => {
    // Strip comentários JS/JSX antes de matchear — os comentários explicativos
    // mencionam "flex-wrap" / "sem flex-wrap" no histórico do hardening e
    // gerariam falsa positiva.
    const stripComments = (src: string) =>
      src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/[^\n]*\n/g, "")
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    const codeOnly = stripComments(precision12ActionQueueSource);
    const actionsBlock = codeOnly.match(
      /<TableCell className="text-right">[\s\S]*?<\/TableCell>/,
    )?.[0] ?? "";
    expect(actionsBlock).toContain("flex items-center justify-end gap-1");
    expect(actionsBlock).not.toContain("flex-wrap");
  });

  it("F-3: ordem dos botões = Abrir → Gerar novo link → Revogar (CTA navegacional primeiro)", () => {
    // Procura ocorrências do TEXTO do botão em contexto JSX (entre > e <).
    const queueSrc = precision12ActionQueueSource;
    const abrirJsxIdx = queueSrc.search(/>\s*\n\s*Abrir\s*\n/);
    const gerarJsxIdx = queueSrc.search(/>\s*\n\s*Gerar novo link\s*\n/);
    const revogarJsxIdx = queueSrc.search(/>\s*\n\s*Revogar\s*\n/);
    expect(abrirJsxIdx).toBeGreaterThan(-1);
    expect(gerarJsxIdx).toBeGreaterThan(abrirJsxIdx);
    expect(revogarJsxIdx).toBeGreaterThan(gerarJsxIdx);
  });

  it("F-2: botão Revogar usa cores rose explícitas (LEGÍVEIS em dark, vs token destructive)", () => {
    // Auditoria revelou que `text-destructive` em dark = rgb(158,46,46)
    // sobre bg-card rgb(35,32,31) = contraste 2.22 (FALHA WCAG AA).
    // Trocado por cores rose explícitas (rose-300 ~8.56 sobre bg-card).
    // Sem variant=destructive cheio (vermelho gritante), mas com
    // sinalização visual clara e legível.
    expect(precision12ActionQueueSource).toMatch(
      /border-rose-500\/50/,
    );
    expect(precision12ActionQueueSource).toMatch(/text-rose-300/);
    expect(precision12ActionQueueSource).toMatch(/hover:bg-rose-500\/10/);
    // Defesa: não pode regredir pro token destructive (FALHA WCAG em dark).
    expect(precision12ActionQueueSource).not.toMatch(
      /className=["'][^"']*text-destructive[^"']*["']/,
    );
  });
});

describe("E5.6b — dialog Reissue: N-1 microcopy alinhada + N-2 destrutividade sinalizada", () => {
  it("N-1: DialogTitle = 'Gerar novo link do questionário' (alinhado com botão da fila)", () => {
    expect(precision12ReissueDialogSource).toContain(
      "<DialogTitle>Gerar novo link do questionário</DialogTitle>",
    );
    // Defesa: o título antigo 'Reemitir link do questionário' não pode
    // reaparecer (regressão de microcopy).
    expect(precision12ReissueDialogSource).not.toContain(
      "<DialogTitle>Reemitir link do questionário</DialogTitle>",
    );
  });

  it("N-2: CTA de confirmação usa variant=destructive (a ação revoga o link anterior)", () => {
    // O bloco da CTA principal "Gerar novo link" (não as CTAs do
    // GeneratedLinkView que ficam dentro do success state).
    const ctaBlock = precision12ReissueDialogSource.match(
      /aria-label="Confirmar geração do novo link"[\s\S]{0,300}/,
    )?.[0];
    expect(ctaBlock).toBeTruthy();
    // O Button que contém esse aria-label deve ter variant="destructive".
    // Procura o Button imediatamente antes do aria-label.
    expect(precision12ReissueDialogSource).toMatch(
      /variant="destructive"[\s\S]*?aria-label="Confirmar geração do novo link"/,
    );
  });
});

describe("E5.6b — heading hierarchy: N-5 sem H1→H3 órfão + sem H3 duplicado no preview", () => {
  it("Console adiciona H2 sr-only 'Precision 12 — Coach' (restaura hierarquia WCAG 1.3.1)", () => {
    expect(precision12ConsoleSource).toMatch(
      /<h2 className="sr-only">Precision 12 — Coach<\/h2>/,
    );
  });

  it("Preview NÃO usa <CardTitle> (que renderiza H3, duplicando o H3 da seção pai)", () => {
    // Strip comentários — o comentário do hardening menciona "Removido o
    // CardTitle" e ia gerar falsa positiva.
    const stripComments = (src: string) =>
      src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/[^\n]*\n/g, "")
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    const codeOnly = stripComments(precision12EvidencePreviewSource);
    // Sem JSX <CardTitle e sem import nomeado de CardTitle.
    expect(codeOnly).not.toMatch(/<CardTitle\b/);
    expect(codeOnly).not.toMatch(/import\s*\{[^}]*\bCardTitle\b[^}]*\}/);
    // Em vez disso, o Card é rotulado por aria-labelledby ao H3 da seção
    // (id="precision12-evidence-preview-heading" definido no Console).
    expect(precision12EvidencePreviewSource).toContain(
      'aria-labelledby="precision12-evidence-preview-heading"',
    );
  });
});
