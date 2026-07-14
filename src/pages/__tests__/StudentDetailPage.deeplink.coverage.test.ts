/**
 * E4.3b — Sanity tests source-based pro deep-link read-only do Coach
 * Console Precision 12. Sem DOM/testing-library — só invariantes textuais
 * verificáveis pela leitura do código-fonte (padrão Precision12Console
 * coverage test).
 *
 * Cobre:
 *   • CTAs da fila e da tabela Precision 12 usam `buildPrecision12StudentDeepLink`.
 *   • StudentDetailPage lê `?tab=` da URL no init.
 *   • AssessmentsTab lê `?assessmentId=` após assessments carregarem.
 */

import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const actionQueuePath = resolve(
  __dirname,
  "../../components/precision12/Precision12ActionQueue.tsx",
);
const actionQueueSource = readFileSync(actionQueuePath, "utf-8");

const progressTablePath = resolve(
  __dirname,
  "../../components/precision12/Precision12StudentProgressTable.tsx",
);
const progressTableSource = readFileSync(progressTablePath, "utf-8");

const studentDetailPath = resolve(__dirname, "../StudentDetailPage.tsx");
const studentDetailSource = readFileSync(studentDetailPath, "utf-8");

const assessmentsTabPath = resolve(
  __dirname,
  "../../components/assessments/AssessmentsTab.tsx",
);
const assessmentsTabSource = readFileSync(assessmentsTabPath, "utf-8");

describe("E4.3b Precision12ActionQueue CTA — deep link", () => {
  it("importa buildPrecision12StudentDeepLink", () => {
    expect(actionQueueSource).toContain("buildPrecision12StudentDeepLink");
    expect(actionQueueSource).toContain(
      'from "@/utils/precision12CoachConsole"',
    );
  });

  it("CTA usa o helper com (studentId, assessmentId)", () => {
    expect(actionQueueSource).toMatch(
      /buildPrecision12StudentDeepLink\(\s*item\.studentId\s*,\s*item\.assessmentId\s*,?\s*\)/,
    );
  });

  it("não monta mais a URL crua `/alunos/${item.studentId}` sem query string", () => {
    expect(actionQueueSource).not.toMatch(
      /to=\{`\/alunos\/\$\{item\.studentId\}`\}/,
    );
  });
});

describe("E4.3b Precision12StudentProgressTable CTA — deep link", () => {
  it("importa buildPrecision12StudentDeepLink", () => {
    expect(progressTableSource).toContain("buildPrecision12StudentDeepLink");
  });

  it("CTA usa o helper com apenas o studentId (sem assessmentId)", () => {
    expect(progressTableSource).toMatch(
      /buildPrecision12StudentDeepLink\(\s*student\.id\s*\)/,
    );
  });

  it("não monta mais a URL crua `/alunos/${student.id}` sem query string", () => {
    expect(progressTableSource).not.toMatch(
      /to=\{`\/alunos\/\$\{student\.id\}`\}/,
    );
  });
});

describe("E4.3b StudentDetailPage — tab=assessments deep link", () => {
  it("importa useSearchParams do react-router-dom", () => {
    expect(studentDetailSource).toContain("useSearchParams");
    expect(studentDetailSource).toMatch(
      /from\s+["']react-router-dom["']/,
    );
  });

  it("declara whitelist de tabs válidas", () => {
    expect(studentDetailSource).toContain("VALID_STUDENT_DETAIL_TABS");
    expect(studentDetailSource).toContain('"assessments"');
  });

  it("inicializa activeTab lendo ?tab= via useState initializer", () => {
    // useState(() => resolveInitialTab(searchParams.get("tab"))) — leitura no
    // primeiro render só (expression ou block body), sem efeito recorrente.
    expect(studentDetailSource).toMatch(
      /useState<string>\(\(\)\s*=>[\s\S]*?searchParams\.get\(["']tab["']\)/,
    );
  });

  it("usa whitelist pra ignorar valor inválido (fallback training)", () => {
    expect(studentDetailSource).toContain('"training"');
    expect(studentDetailSource).toContain("VALID_STUDENT_DETAIL_TABS.has");
  });

  it("Op 2: aba unificada `recuperacao` na whitelist; oura/whoop viram alias", () => {
    // As antigas abas `oura`/`whoop` foram fundidas numa aba agnóstica de
    // dispositivo. Deep-links legados resolvem pra `recuperacao` SEM reescrever
    // a URL (o teste de read-only acima cobre a ausência de setSearchParams).
    expect(studentDetailSource).toContain('"recuperacao"');
    expect(studentDetailSource).toContain("LEGACY_TAB_ALIAS");
    expect(studentDetailSource).toMatch(
      /oura:\s*["']recuperacao["']/,
    );
    expect(studentDetailSource).toMatch(
      /whoop:\s*["']recuperacao["']/,
    );
    // a aba `oura` como valor de whitelist não existe mais (virou alias)
    expect(studentDetailSource).not.toMatch(/VALID_STUDENT_DETAIL_TABS[\s\S]*?["']oura["']/);
  });

  it("não introduz mutation (deep-link é read-only)", () => {
    // Não adicionamos useMutation novo neste arquivo — qualquer
    // useMutation pré-existente seria de outras features, não deste PR.
    // O que garantimos: o setSearchParams (write) NÃO é importado.
    expect(studentDetailSource).not.toMatch(/setSearchParams/);
  });
});

describe("E4.3b AssessmentsTab — assessmentId deep link", () => {
  it("importa useSearchParams do react-router-dom", () => {
    expect(assessmentsTabSource).toContain("useSearchParams");
    expect(assessmentsTabSource).toMatch(
      /from\s+["']react-router-dom["']/,
    );
  });

  it("aplica o deep-link via useEffect quando assessments carregam", () => {
    expect(assessmentsTabSource).toContain("deepLinkApplied");
    expect(assessmentsTabSource).toContain("useRef");
    expect(assessmentsTabSource).toMatch(/searchParams\.get\(["']assessmentId["']\)/);
  });

  it("valida assessmentId contra a lista carregada (defensivo)", () => {
    // O assessment precisa existir entre os assessments do aluno antes do
    // sheet abrir — protege contra UUID errado na URL.
    expect(assessmentsTabSource).toMatch(
      /assessments\.some\(\s*\(\s*a\s*\)\s*=>\s*a\.id\s*===\s*requested\s*\)/,
    );
  });

  it("guarda aplicação única (ref-guard) pra não reabrir o sheet", () => {
    expect(assessmentsTabSource).toMatch(/deepLinkApplied\.current\s*=\s*true/);
    expect(assessmentsTabSource).toMatch(/if\s*\(\s*deepLinkApplied\.current\s*\)\s*return/);
  });

  it("não introduz mutation (deep-link é read-only)", () => {
    expect(assessmentsTabSource).not.toContain("useMutation");
  });
});
