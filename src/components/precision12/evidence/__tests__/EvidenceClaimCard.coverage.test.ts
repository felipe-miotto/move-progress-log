/**
 * E5.4 — Source-based coverage tests para EvidenceClaimCard +
 * EvidenceClaimList (padrão do repo: leitura do source-of-truth via
 * `readFileSync`, sem montar DOM/testing-library).
 *
 * Cobrem invariantes de UI safety:
 *   • Card renderiza interpretation / evidenceSummary / coachAction /
 *     disclaimer / sources.
 *   • Card mostra observedValue quando presente.
 *   • Cada source vira <a> com target="_blank" + rel="noopener noreferrer".
 *   • Estado vazio do List exibe microcopy neutra.
 *   • Zero importação de mutation surface: useMutation, supabase,
 *     supabase.from, .insert/.update/.delete/.upsert, localStorage,
 *     sessionStorage.
 *   • Zero window.open automático (apenas <a target="_blank"> declarativo).
 *
 * Roda contra os ARQUIVOS REAIS — qualquer regressão futura no source quebra
 * a suite sem precisar de jsdom.
 */

import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const cardPath = resolve(__dirname, "../EvidenceClaimCard.tsx");
const cardSource = readFileSync(cardPath, "utf-8");

const listPath = resolve(__dirname, "../EvidenceClaimList.tsx");
const listSource = readFileSync(listPath, "utf-8");

const indexPath = resolve(__dirname, "../index.ts");
const indexSource = readFileSync(indexPath, "utf-8");

const previewPath = resolve(__dirname, "../Precision12EvidencePreview.tsx");
const previewSource = readFileSync(previewPath, "utf-8");

const consolePath = resolve(
  __dirname,
  "../../Precision12Console.tsx",
);
const consoleSource = readFileSync(consolePath, "utf-8");

// ── EvidenceClaimCard: campos renderizados ───────────────────────────────────

describe("E5.4 EvidenceClaimCard — campos renderizados", () => {
  it("renderiza interpretation", () => {
    expect(cardSource).toContain("{claim.interpretation}");
  });

  it("renderiza evidenceSummary", () => {
    expect(cardSource).toContain("{claim.evidenceSummary}");
  });

  it("renderiza coachAction", () => {
    expect(cardSource).toContain("{claim.coachAction}");
  });

  it("renderiza disclaimer com label 'Aviso clínico' dentro de <Alert>", () => {
    expect(cardSource).toContain("Aviso clínico");
    expect(cardSource).toContain("{claim.disclaimer}");
    // Endurecido: disclaimer agora usa Alert do shadcn (visualmente mais
    // forte que <p role="note">), com ícone Info, mantendo tom sóbrio.
    expect(cardSource).toContain(
      'from "@/components/ui/alert"',
    );
    expect(cardSource).toMatch(/<Alert\b/);
    expect(cardSource).toContain("AlertDescription");
    expect(cardSource).toMatch(/import\s*\{\s*Info\s*\}\s*from\s*"lucide-react"/);
    expect(cardSource).toMatch(/<Info\b/);
    // Garante que o <p role="note"> fraco NÃO voltou.
    expect(cardSource).not.toMatch(/<p[^>]*role="note"/);
  });

  it("renderiza classification como título do card", () => {
    expect(cardSource).toContain("{claim.classification}");
  });

  it("renderiza domain via EVIDENCE_DOMAIN_LABEL importado do util (sem hard-code interno)", () => {
    expect(cardSource).toContain("EVIDENCE_DOMAIN_LABEL[claim.domain]");
    expect(cardSource).toMatch(
      /import\s*\{[\s\S]*?EVIDENCE_DOMAIN_LABEL[\s\S]*?\}\s*from\s*"@\/utils\/precision12Evidence"/,
    );
    // Endurecido: NÃO existe mais const local DOMAIN_LABEL no card.
    expect(cardSource).not.toMatch(/const\s+DOMAIN_LABEL\s*[:=]/);
    // Cobertura dos 7 domínios continua via lookup do util (testado em
    // precision12Evidence.test.ts). O card só precisa importar.
  });

  it("renderiza observedValue condicionalmente (só quando presente)", () => {
    // condicional inline `{claim.observedValue && (...)}` — defesa contra
    // mostrar "null" / "undefined" como string.
    expect(cardSource).toMatch(/\{claim\.observedValue\s*&&/);
    expect(cardSource).toContain("{claim.observedValue}");
  });

  it("renderiza metric ID (campo técnico) próximo ao topo", () => {
    expect(cardSource).toContain("{claim.metric}");
  });
});

// ── EvidenceClaimCard: fontes ────────────────────────────────────────────────

describe("E5.4 EvidenceClaimCard — fontes", () => {
  it("itera sobre claim.sources", () => {
    expect(cardSource).toMatch(/claim\.sources\.map/);
  });

  it("cada fonte vira <a> com target=\"_blank\" + rel=\"noopener noreferrer\"", () => {
    expect(cardSource).toContain('target="_blank"');
    expect(cardSource).toContain('rel="noopener noreferrer"');
  });

  it("usa href={source.url}", () => {
    expect(cardSource).toMatch(/href=\{source\.url\}/);
  });

  it("renderiza title + citation + population (quando há)", () => {
    expect(cardSource).toContain("{source.title}");
    expect(cardSource).toContain("{source.citation}");
    expect(cardSource).toContain("{source.population}");
  });
});

// ── EvidenceClaimCard: tom de risco visual ──────────────────────────────────

describe("E5.4 EvidenceClaimCard — riskLanguageLevel não-alarmista", () => {
  it("mapeia os 4 níveis de risco via EVIDENCE_RISK_LEVEL_LABEL importado do util", () => {
    expect(cardSource).toContain("EVIDENCE_RISK_LEVEL_LABEL[claim.riskLanguageLevel]");
    expect(cardSource).toMatch(
      /import\s*\{[\s\S]*?EVIDENCE_RISK_LEVEL_LABEL[\s\S]*?\}\s*from\s*"@\/utils\/precision12Evidence"/,
    );
    // Endurecido: NÃO existe mais const local RISK_LEVEL_LABEL no card.
    expect(cardSource).not.toMatch(/const\s+RISK_LEVEL_LABEL\s*[:=]/);
  });

  it("'actionable' usa label 'Próximo passo' via util (positive assertion)", () => {
    // Label literal exata vive em EVIDENCE_RISK_LEVEL_LABEL no util.
    // Asserção indireta: o card importa essa const e nenhum mapa de label
    // duplicado existe.
    expect(cardSource).toContain("EVIDENCE_RISK_LEVEL_LABEL");
    expect(cardSource).not.toMatch(/actionable:\s*"[^"]*emergência/i);
  });

  it("badge variant é 'destructive' apenas para actionable; cores sóbrias", () => {
    expect(cardSource).toMatch(/actionable:\s*"destructive"/);
    expect(cardSource).toMatch(/reassuring:\s*"secondary"/);
  });
});

// ── EvidenceClaimCard: princípios são opcionais ─────────────────────────────

describe("E5.4 EvidenceClaimCard — princípios", () => {
  it("os 4 princípios ficam atrás de prop showPrinciples (default false)", () => {
    expect(cardSource).toContain("showPrinciples = false");
    expect(cardSource).toContain("{showPrinciples &&");
    // Quando exibidos, listam os 4 flags.
    expect(cardSource).toContain("real_endpoint");
    expect(cardSource).toContain("is_associative");
    expect(cardSource).toContain("modifiability_explicit");
    expect(cardSource).toContain("multidimensional");
  });
});

// ── EvidenceClaimList ───────────────────────────────────────────────────────

describe("E5.4 EvidenceClaimList", () => {
  it("recebe claims: readonly EvidenceClaim[]", () => {
    expect(listSource).toMatch(/claims:\s*readonly EvidenceClaim\[\]/);
  });

  it("estado vazio mostra microcopy neutra", () => {
    expect(listSource).toContain(
      "Nenhuma evidência clínica-operacional disponível para os dados atuais.",
    );
    expect(listSource).toMatch(/claims\.length\s*===\s*0/);
  });

  it("renderiza N EvidenceClaimCard com key estável (sem index)", () => {
    expect(listSource).toContain("EvidenceClaimCard");
    // Key é tripleta domain-metric-classification (cada tripleta é única
    // no catálogo — verificado em precision12Evidence.test.ts). Não usa
    // index para que filtragem/reordenação futuras (E5.5) não re-mount.
    expect(listSource).toMatch(
      /key=\{`\$\{claim\.domain\}-\$\{claim\.metric\}-\$\{claim\.classification\}`\}/,
    );
    // Endurecido: NÃO inclui index na key.
    expect(listSource).not.toMatch(/key=\{`[^`]*\$\{index\}/);
  });

  it("repassa showPrinciples pra cada card", () => {
    expect(listSource).toContain("showPrinciples={showPrinciples}");
  });
});

// ── index ───────────────────────────────────────────────────────────────────

describe("E5.4 evidence/index — public surface", () => {
  it("re-exporta EvidenceClaimCard e EvidenceClaimList", () => {
    expect(indexSource).toContain(
      'export { EvidenceClaimCard } from "./EvidenceClaimCard"',
    );
    expect(indexSource).toContain(
      'export { EvidenceClaimList } from "./EvidenceClaimList"',
    );
  });
});

// ── Invariantes de segurança (zero mutation / storage / window.open) ────────

describe("E5.4 evidence/* — invariantes de segurança", () => {
  const allEvidenceSource = `${cardSource}\n${listSource}\n${indexSource}`;

  it("zero useMutation", () => {
    expect(allEvidenceSource).not.toMatch(/\buseMutation\b/);
  });

  it("zero supabase / supabase.from / supabase.rpc", () => {
    expect(allEvidenceSource).not.toMatch(/\bsupabase\b/);
  });

  it("zero functions.invoke", () => {
    expect(allEvidenceSource).not.toMatch(/functions\.invoke/);
  });

  it("zero mutation de tabela (.insert/.update/.delete/.upsert)", () => {
    expect(allEvidenceSource).not.toMatch(
      /\.(insert|update|delete|upsert)\(/,
    );
  });

  it("zero acesso real a localStorage / sessionStorage", () => {
    expect(allEvidenceSource).not.toMatch(
      /\b(localStorage|sessionStorage)\s*[.[]/,
    );
  });

  it("zero window.open automático", () => {
    expect(allEvidenceSource).not.toMatch(/\bwindow\.open\(/);
  });

  it("zero console.log de invite/token/url", () => {
    expect(allEvidenceSource).not.toMatch(
      /console\.(log|info|warn|error|debug)\([^)]*\b(invite|token|invite_url|inviteUrl|url)\b/i,
    );
  });

  it("zero useNavigate / history.push (sem redirect implícito)", () => {
    expect(allEvidenceSource).not.toMatch(/\buseNavigate\b/);
    expect(allEvidenceSource).not.toMatch(/history\.push/);
  });

  it("zero botão type=submit ou form (não deve disparar nada)", () => {
    expect(allEvidenceSource).not.toMatch(/type=["']submit["']/);
    expect(allEvidenceSource).not.toMatch(/<form\b/);
  });
});

// ── Wording / safety ────────────────────────────────────────────────────────

describe("E5.4 evidence/* — nenhum termo clínico proibido no chassi", () => {
  // O conteúdo clínico vem 100% do catálogo (EvidenceClaim). O chassi só
  // expõe os campos. Reforçamos aqui que NENHUM termo proibido foi
  // hard-coded acidentalmente no source dos componentes (labels, microcopy
  // do estado vazio, etc.).
  const allEvidenceSource = `${cardSource}\n${listSource}\n${indexSource}`;
  const FORBIDDEN_IN_CHASSIS = [
    "diagnostica",
    "diagnóstico",
    "diagnostico",
    "garante",
    "garantido",
    "causa direta",
    "você tem",
    "voce tem",
    "doença",
    "doenca",
    "patologia",
    "transtorno",
  ];

  for (const term of FORBIDDEN_IN_CHASSIS) {
    it(`não usa "${term}" no chassi`, () => {
      expect(allEvidenceSource.toLowerCase()).not.toContain(term);
    });
  }
});

// ── E5.5 Precision12EvidencePreview ─────────────────────────────────────────

describe("E5.5 Precision12EvidencePreview", () => {
  it("é exportado do barrel index", () => {
    expect(indexSource).toContain(
      'export { Precision12EvidencePreview } from "./Precision12EvidencePreview"',
    );
  });

  it("consome students + assessments + responses (todos do hook E4.1), sem nova query", () => {
    expect(previewSource).toContain("students: readonly CoachConsoleStudent[]");
    expect(previewSource).toContain(
      "assessments: readonly CoachConsoleAssessment[]",
    );
    expect(previewSource).toContain(
      "responses: readonly CoachConsoleQuestionnaire[]",
    );
    // Defesa: nenhum hook próprio.
    expect(previewSource).not.toMatch(/\buseQuery\b/);
    expect(previewSource).not.toMatch(/\buseMutation\b/);
    expect(previewSource).not.toMatch(/\bsupabase\b/);
    expect(previewSource).not.toMatch(/functions\.invoke/);
  });

  it("usa deriveEvidenceGroups (E5.5) — que por dentro chama derivation E5.3 + mapping", () => {
    // O preview agora delega cross-join + derivação à função pura no
    // utils. Isso preserva fast-refresh do componente e mantém os
    // testes funcionais da lógica isolados em arquivo próprio.
    expect(previewSource).toContain("deriveEvidenceGroups");
  });

  it("usa deriveEvidenceGroups importado do utils (cross-join puro fora do componente)", () => {
    // Endurecido: a função de cross-join vive em
    // src/utils/precision12EvidenceMapping.ts (testes funcionais próprios),
    // pra não quebrar fast-refresh do componente. O preview apenas
    // importa e consome.
    expect(previewSource).toContain("deriveEvidenceGroups");
    expect(previewSource).toMatch(
      /import[\s\S]*deriveEvidenceGroups[\s\S]*from\s*"@\/utils\/precision12EvidenceMapping"/,
    );
    // Não pode declarar a função localmente.
    expect(previewSource).not.toMatch(
      /function\s+deriveEvidenceGroups\s*\(/,
    );
  });

  it("renderiza EvidenceClaimList por grupo (de aluno)", () => {
    expect(previewSource).toContain("<EvidenceClaimList");
  });

  it("expõe limitações conhecidas via <details> read-only", () => {
    expect(previewSource).toContain("LIMITATIONS_NOT_COVERED_YET");
    expect(previewSource).toMatch(/<details\b/);
    expect(previewSource).toContain("Limitações conhecidas");
  });

  it("não introduz mutation / storage / window.open / navigate", () => {
    expect(previewSource).not.toMatch(
      /\.(insert|update|delete|upsert|rpc)\(/,
    );
    expect(previewSource).not.toMatch(/\b(localStorage|sessionStorage)\s*[.[]/);
    expect(previewSource).not.toMatch(/\bwindow\.open\(/);
    expect(previewSource).not.toMatch(/\buseNavigate\b/);
  });

  // ── Endurecido: feedback da auditoria PR #150 ────────────────────────────

  it("usa nome do aluno na UI, não UUID técnico", () => {
    // Cross-join real preenche studentName.
    expect(previewSource).toContain("studentName");
    expect(previewSource).toContain("{group.studentName}");
    // O assessmentId não pode mais ser TEXTO visível no card. Permitido só
    // como data-attribute técnico ou dentro de aria-label (não pra usuário).
    expect(previewSource).not.toContain("{group.assessmentId}");
    // Microcopy explícita "Aluno:" no header do grupo.
    expect(previewSource).toContain("Aluno:");
  });

  it("não tem dead code / fake usage (void no body)", () => {
    // Endurecido: spec da auditoria proibe `void students` e qualquer
    // import sem uso real (ex.: indexResponsesByAssessmentId só usado como
    // void). Preview deve consumir TUDO que importa, sem disfarce.
    expect(previewSource).not.toMatch(/\bvoid\s+students\b/);
    expect(previewSource).not.toMatch(/\bvoid\s+assessments\b/);
    expect(previewSource).not.toMatch(/\bvoid\s+responses\b/);
    expect(previewSource).not.toContain("indexResponsesByAssessmentId");
  });

  it("key da seção por grupo é studentId (estável, sem index)", () => {
    expect(previewSource).toMatch(/key=\{group\.studentId\}/);
  });
});

describe("E5.5 Precision12Console — integra Preview no fim do layout", () => {
  it("importa Precision12EvidencePreview do barrel evidence", () => {
    expect(consoleSource).toContain(
      'import { Precision12EvidencePreview } from "./evidence"',
    );
  });

  // E5.6a / M-2: o Console agora passa ARRAYS FILTRADOS pro preview,
  // pra respeitar os mesmos filtros operacionais que a fila e a tabela.
  it("renderiza <Precision12EvidencePreview> passando arrays filtrados (M-2)", () => {
    expect(consoleSource).toMatch(/<Precision12EvidencePreview\b/);
    // Antes do M-2: students={data.students}. Agora: students={filteredStudents}.
    expect(consoleSource).toMatch(/students=\{filteredStudents\}/);
    expect(consoleSource).toMatch(
      /assessments=\{filteredAssessmentsForEvidence\}/,
    );
    expect(consoleSource).toMatch(
      /responses=\{filteredResponsesForEvidence\}/,
    );
    // Defesa: não pode mais passar arrays crus diretos do hook.
    expect(consoleSource).not.toMatch(/<Precision12EvidencePreview[^>]*students=\{data\.students\}/);
  });

  it("deriva filteredAssessmentsForEvidence e filteredResponsesForEvidence em cascata (M-2)", () => {
    // Cascata: students filtrados → assessments daqueles alunos → responses
    // daquelas assessments. Os 3 useMemo devem existir.
    expect(consoleSource).toContain("filteredStudentIdsForEvidence");
    expect(consoleSource).toContain("filteredAssessmentsForEvidence");
    expect(consoleSource).toContain("filteredResponsesForEvidence");
    // Source-based check: o filtro de assessments usa filteredStudentIdsForEvidence.
    expect(consoleSource).toMatch(
      /filteredStudentIdsForEvidence\.has\(a\.student_id\)/,
    );
    // E o filtro de responses usa filteredAssessmentIdsForEvidence.
    expect(consoleSource).toMatch(
      /filteredAssessmentIdsForEvidence\.has\(r\.assessment_id\)/,
    );
  });

  it("mostra FilteredEmpty na seção do preview quando filtros zeram alunos (M-2)", () => {
    // Mesma microcopy/pattern usado pelas seções de fila e tabela.
    expect(consoleSource).toContain(
      "Nenhuma evidência corresponde aos filtros atuais.",
    );
  });

  it("o bloco da preview tem heading com label 'Evidência clínica-operacional (preview)'", () => {
    expect(consoleSource).toContain("Evidência clínica-operacional (preview)");
    expect(consoleSource).toContain(
      'aria-labelledby="precision12-evidence-preview-heading"',
    );
  });
});

// ── E5.6a / M-7: preview lista também QUESTIONNAIRE_FIELDS_NOT_MAPPED_YET ──

describe("E5.6a / M-7 Precision12EvidencePreview — campos não-mapeados", () => {
  it("importa QUESTIONNAIRE_FIELDS_NOT_MAPPED_YET do mapping", () => {
    expect(previewSource).toMatch(
      /import[\s\S]*QUESTIONNAIRE_FIELDS_NOT_MAPPED_YET[\s\S]*from\s*"@\/utils\/precision12EvidenceMapping"/,
    );
  });

  it("renderiza as duas listas dentro do <details> (domínios + campos)", () => {
    expect(previewSource).toContain(
      'data-testid="evidence-preview-limitations-domains"',
    );
    expect(previewSource).toContain(
      'data-testid="evidence-preview-limitations-fields"',
    );
  });

  it("summary do <details> mostra contagem combinada (domínios + campos)", () => {
    expect(previewSource).toContain("domínios");
    expect(previewSource).toContain("campos do questionário");
  });
});
