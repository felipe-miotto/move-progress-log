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

  it("renderiza disclaimer com label 'Aviso clínico'", () => {
    expect(cardSource).toContain("Aviso clínico");
    expect(cardSource).toContain("{claim.disclaimer}");
  });

  it("renderiza classification como título do card", () => {
    expect(cardSource).toContain("{claim.classification}");
  });

  it("renderiza domain via DOMAIN_LABEL", () => {
    expect(cardSource).toContain("DOMAIN_LABEL[claim.domain]");
    // Cobre os 7 domínios
    for (const domain of [
      "vo2_max",
      "fc_recovery_1min",
      "handgrip",
      "sit_to_stand",
      "dexa",
      "questionnaire_parq",
      "sleep_stress_energy_adherence",
    ]) {
      expect(cardSource).toContain(domain);
    }
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
  it("mapeia os 4 níveis de risco em labels", () => {
    expect(cardSource).toContain("RISK_LEVEL_LABEL");
    expect(cardSource).toContain('"Favorável"');
    expect(cardSource).toContain('"Informativo"');
    expect(cardSource).toContain('"Atenção"');
    expect(cardSource).toContain('"Próximo passo"');
  });

  it("'actionable' usa label 'Próximo passo' (positive assertion)", () => {
    // Label literal exata — não tentamos detectar comentários documentais
    // proibindo termos (já vimos `not.toMatch(/emerg/i)` quebrar em
    // comentários que dizem "NUNCA emergência"). Aqui basta garantir que
    // a label final pro usuário é "Próximo passo".
    expect(cardSource).toMatch(/actionable:\s*"Próximo passo"/);
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

  it("renderiza N EvidenceClaimCard com key estável", () => {
    expect(listSource).toContain("EvidenceClaimCard");
    expect(listSource).toMatch(/key=\{`\$\{claim\.domain\}-/);
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
