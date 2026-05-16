/**
 * E5.1 — Testes de segurança do Evidence Layer.
 *
 * Verificam invariantes que o spec do E5.1 estabelece:
 *
 *   • Catálogo NÃO usa linguagem diagnóstica/causal proibida.
 *   • Cada claim tem ≥ 1 fonte + disclaimer.
 *   • Disclaimer contém keywords mínimas do domínio.
 *   • DEXA explicita "não substitui laudo".
 *   • PAR-Q blocked orienta revisão/encaminhamento (sem prescrever treino).
 *   • Os 4 princípios = true em toda claim publicada.
 *   • `hasProhibitedTerm` detecta termos básicos.
 *   • Helpers (`getEvidenceClaim`, `getClaimsByDomain`, `instantiateClaim`)
 *     se comportam como esperado.
 */

import { describe, expect, it } from "vitest";

import {
  EVIDENCE_CATALOG,
  EVIDENCE_DOMAINS,
  EVIDENCE_DOMAIN_DISCLAIMER_KEYWORDS,
  EVIDENCE_DOMAIN_LABEL,
  EVIDENCE_PROHIBITED_TERMS,
  EVIDENCE_RISK_LEVEL_LABEL,
  EVIDENCE_SOURCE_CATALOG,
  PARQ_BLOCKED_COACH_ACTION_KEYWORDS,
  getClaimsByDomain,
  getEvidenceClaim,
  hasProhibitedTerm,
  instantiateClaim,
  validateEvidenceClaim,
  validateEvidencePrinciples,
  type EvidenceClaim,
  type EvidenceDomain,
  type EvidencePrinciples,
} from "../precision12Evidence";

// ── 1. Termos proibidos ──────────────────────────────────────────────────────

describe("hasProhibitedTerm", () => {
  it("retorna vazio em texto associativo seguro", () => {
    const text =
      "Resultado pode estar associado a maior risco; sugere acompanhamento próximo.";
    expect(hasProhibitedTerm(text)).toEqual([]);
  });

  it("detecta termo diagnóstico", () => {
    expect(hasProhibitedTerm("diagnostica sarcopenia")).toContain("diagnostica");
  });

  it("detecta linguagem causal absoluta", () => {
    expect(hasProhibitedTerm("baixo VO₂ garante mortalidade")).toContain(
      "garante",
    );
  });

  it("detecta 'você tem' (case-insensitive)", () => {
    expect(hasProhibitedTerm("Você Tem Sarcopenia")).toContain("você tem");
  });

  it("detecta 'doença' (com cedilha) e 'doenca' (sem)", () => {
    expect(hasProhibitedTerm("doença cardiovascular")).toContain("doença");
    expect(hasProhibitedTerm("doenca cardiovascular")).toContain("doenca");
  });

  it("a lista de termos proibidos não está vazia", () => {
    expect(EVIDENCE_PROHIBITED_TERMS.length).toBeGreaterThanOrEqual(5);
  });
});

// ── 2. Princípios ────────────────────────────────────────────────────────────

describe("validateEvidencePrinciples", () => {
  const ALL_OK: EvidencePrinciples = {
    real_endpoint: true,
    is_associative: true,
    modifiability_explicit: true,
    multidimensional: true,
  };

  it("retorna vazio quando todos true", () => {
    expect(validateEvidencePrinciples(ALL_OK)).toEqual([]);
  });

  it("identifica flag faltante", () => {
    expect(
      validateEvidencePrinciples({ ...ALL_OK, modifiability_explicit: false }),
    ).toEqual(["modifiability_explicit"]);
  });

  it("identifica múltiplas flags faltantes", () => {
    expect(
      validateEvidencePrinciples({
        real_endpoint: false,
        is_associative: false,
        modifiability_explicit: false,
        multidimensional: false,
      }),
    ).toEqual([
      "real_endpoint",
      "is_associative",
      "modifiability_explicit",
      "multidimensional",
    ]);
  });
});

// ── 3. validateEvidenceClaim — happy + unsafe ────────────────────────────────

const BASE_PRINCIPLES: EvidencePrinciples = {
  real_endpoint: true,
  is_associative: true,
  modifiability_explicit: true,
  multidimensional: true,
};

function makeSafeVo2Claim(): EvidenceClaim {
  return {
    domain: "vo2_max",
    metric: "vo2_max",
    observedValue: null,
    classification: "Fraco",
    interpretation:
      "VO₂ máx na faixa Fraco pode estar associado a maior risco; sugere acompanhamento.",
    evidenceSummary: "Evidência associativa em coortes grandes.",
    coachAction:
      "Considerar progressão estruturada; integrar com contexto de treino.",
    riskLanguageLevel: "watchful",
    sources: [
      {
        title: "Stub",
        citation: "Stub 2020",
        url: "https://example.com",
      },
    ],
    disclaimer:
      "Resultado individual deve ser integrado ao contexto de treino e acompanhamento clínico.",
    principles: BASE_PRINCIPLES,
  };
}

describe("validateEvidenceClaim", () => {
  it("aceita claim saudável", () => {
    expect(validateEvidenceClaim(makeSafeVo2Claim())).toEqual([]);
  });

  it("rejeita claim com linguagem diagnóstica em interpretation", () => {
    const claim = makeSafeVo2Claim();
    claim.interpretation =
      "Resultado diagnostica doença cardiovascular do aluno.";
    const issues = validateEvidenceClaim(claim);
    expect(issues.find((i) => i.field === "interpretation")).toBeTruthy();
  });

  it("rejeita claim sem fontes", () => {
    const claim = makeSafeVo2Claim();
    claim.sources = [];
    expect(
      validateEvidenceClaim(claim).find((i) => i.field === "sources"),
    ).toBeTruthy();
  });

  it("rejeita claim sem disclaimer", () => {
    const claim = makeSafeVo2Claim();
    claim.disclaimer = "";
    expect(
      validateEvidenceClaim(claim).find((i) => i.field === "disclaimer"),
    ).toBeTruthy();
  });

  it("rejeita disclaimer DEXA sem palavras-chave 'laudo' / 'não substitui'", () => {
    const claim = makeSafeVo2Claim();
    claim.domain = "dexa";
    claim.disclaimer = "Resultado deve ser interpretado com cuidado.";
    expect(
      validateEvidenceClaim(claim).find(
        (i) => i.field === "disclaimerKeywords",
      ),
    ).toBeTruthy();
  });

  it("rejeita claim com flag de princípio faltando", () => {
    const claim = makeSafeVo2Claim();
    claim.principles = { ...BASE_PRINCIPLES, is_associative: false };
    expect(
      validateEvidenceClaim(claim).find((i) => i.field === "principles"),
    ).toBeTruthy();
  });

  it("rejeita PAR-Q blocked cuja coachAction não orienta revisão/encaminhamento", () => {
    const claim: EvidenceClaim = {
      ...makeSafeVo2Claim(),
      domain: "questionnaire_parq",
      classification: "PAR-Q positivo (blocked)",
      coachAction:
        "Prescrever treino vigoroso e progressão imediata.",
      disclaimer:
        "PAR-Q é triagem operacional; não substitui avaliação clínica.",
    };
    expect(
      validateEvidenceClaim(claim).find(
        (i) => i.field === "parqBlockedCoachAction",
      ),
    ).toBeTruthy();
  });

  it("aceita PAR-Q blocked com coachAction orientando revisão", () => {
    const claim: EvidenceClaim = {
      ...makeSafeVo2Claim(),
      domain: "questionnaire_parq",
      classification: "PAR-Q positivo (blocked)",
      coachAction:
        "Revisar respostas e encaminhar para acompanhamento clínico antes de prescrever treino.",
      disclaimer:
        "PAR-Q é triagem operacional; não substitui avaliação clínica nem laudo médico.",
    };
    expect(validateEvidenceClaim(claim)).toEqual([]);
  });
});

// ── 4. Catálogo: invariantes globais ─────────────────────────────────────────

describe("EVIDENCE_CATALOG", () => {
  it("não está vazio", () => {
    expect(EVIDENCE_CATALOG.length).toBeGreaterThan(0);
  });

  it("E5.2 publica catálogo ampliado com pelo menos 25 claims", () => {
    expect(EVIDENCE_CATALOG.length).toBeGreaterThanOrEqual(25);
  });

  it("toda claim passa em validateEvidenceClaim", () => {
    for (const claim of EVIDENCE_CATALOG) {
      const issues = validateEvidenceClaim(claim);
      expect(
        issues,
        `claim ${claim.domain}/${claim.classification} falhou: ${JSON.stringify(
          issues,
        )}`,
      ).toEqual([]);
    }
  });

  it("nenhuma claim contém termo proibido em interpretation+evidenceSummary+coachAction", () => {
    for (const claim of EVIDENCE_CATALOG) {
      for (const field of [
        "interpretation",
        "evidenceSummary",
        "coachAction",
      ] as const) {
        const hits = hasProhibitedTerm(claim[field]);
        expect(
          hits,
          `${claim.domain}/${claim.classification}/${field} contém: ${hits.join(", ")}`,
        ).toEqual([]);
      }
    }
  });

  it("toda claim tem >= 1 fonte primária", () => {
    for (const claim of EVIDENCE_CATALOG) {
      expect(claim.sources.length).toBeGreaterThanOrEqual(1);
      for (const source of claim.sources) {
        expect(source.title.length).toBeGreaterThan(0);
        expect(source.citation.length).toBeGreaterThan(0);
        expect(source.url).toMatch(/^https?:\/\//);
      }
    }
  });

  it("toda claim publicada tem >= 2 fontes robustas", () => {
    for (const claim of EVIDENCE_CATALOG) {
      expect(
        claim.sources.length,
        `${claim.domain}/${claim.classification} precisa de pelo menos 2 fontes`,
      ).toBeGreaterThanOrEqual(2);
    }
  });

  it("nenhuma claim publicada usa URL genérica de homepage como fonte", () => {
    const forbiddenUrls = new Set([
      "https://www.acsm.org/",
      "https://example.com",
    ]);

    for (const claim of EVIDENCE_CATALOG) {
      for (const source of claim.sources) {
        expect(
          forbiddenUrls.has(source.url),
          `${claim.domain}/${claim.classification} usa fonte genérica: ${source.url}`,
        ).toBe(false);
      }
    }
  });

  it("toda claim tem disclaimer não vazio", () => {
    for (const claim of EVIDENCE_CATALOG) {
      expect(claim.disclaimer.trim().length).toBeGreaterThan(0);
    }
  });

  it("toda claim tem os 4 princípios = true", () => {
    for (const claim of EVIDENCE_CATALOG) {
      expect(validateEvidencePrinciples(claim.principles)).toEqual([]);
    }
  });

  it("toda claim do catálogo tem observedValue=null (estrutura sem dado)", () => {
    for (const claim of EVIDENCE_CATALOG) {
      expect(claim.observedValue).toBeNull();
    }
  });

  it("EVIDENCE_DOMAINS cobre todos os domínios usados no catálogo", () => {
    const usedDomains = new Set(EVIDENCE_CATALOG.map((c) => c.domain));
    for (const d of usedDomains) {
      expect(EVIDENCE_DOMAINS).toContain(d);
    }
  });

  it("não duplica classification dentro do mesmo domínio", () => {
    const keys = EVIDENCE_CATALOG.map(
      (claim) => `${claim.domain}:${claim.classification}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("cada domínio listado tem >= 1 claim no catálogo (cobertura mínima E5.1)", () => {
    for (const domain of EVIDENCE_DOMAINS) {
      const claims = getClaimsByDomain(domain);
      expect(
        claims.length,
        `domínio ${domain} sem claim populada`,
      ).toBeGreaterThan(0);
    }
  });
});

// ── 4b. E5.2 — cobertura de classificações por domínio ─────────────────────

describe("E5.2 cobertura ampliada — classificações publicadas", () => {
  const expectedClassifications: Record<EvidenceDomain, string[]> = {
    vo2_max: ["Muito fraco", "Fraco", "Regular", "Bom", "Excelente"],
    fc_recovery_1min: ["Atenção", "Adequada"],
    handgrip: ["Baixo", "Médio", "Alto"],
    sit_to_stand: ["Alerta", "Intermediário", "Excelente"],
    dexa: [
      "% gordura elevada para faixa etária",
      "% gordura dentro da referência",
      "Gordura visceral elevada",
      "Relação androide/ginoide elevada",
      "ALM/altura² abaixo do corte populacional",
      "ALM/altura² dentro da referência",
    ],
    questionnaire_parq: ["PAR-Q positivo (blocked)", "PAR-Q sem sinalizações"],
    sleep_stress_energy_adherence: [
      "Sono insuficiente",
      "Estresse alto",
      "Baixa energia",
      "Barreira de adesão relevante",
      "Risco de adesão (≥ 2 flags)",
    ],
  };

  for (const [domain, classifications] of Object.entries(
    expectedClassifications,
  ) as [EvidenceDomain, string[]][]) {
    it(`${domain} tem todas as classificações esperadas`, () => {
      const published = getClaimsByDomain(domain).map(
        (claim) => claim.classification,
      );

      for (const classification of classifications) {
        expect(published).toContain(classification);
      }
    });
  }

  it("cada classificação esperada resolve via getEvidenceClaim", () => {
    for (const [domain, classifications] of Object.entries(
      expectedClassifications,
    ) as [EvidenceDomain, string[]][]) {
      for (const classification of classifications) {
        expect(getEvidenceClaim(domain, classification)).not.toBeNull();
      }
    }
  });
});

// ── 5. Catálogo DEXA: invariante específica ─────────────────────────────────

describe("DEXA — invariantes específicas (não substitui laudo)", () => {
  const dexaClaims = getClaimsByDomain("dexa");

  it("há pelo menos 1 claim DEXA no catálogo", () => {
    expect(dexaClaims.length).toBeGreaterThan(0);
  });

  it("disclaimer de cada claim DEXA contém 'laudo' E 'não substitui'", () => {
    for (const claim of dexaClaims) {
      const lower = claim.disclaimer.toLowerCase();
      expect(lower).toContain("laudo");
      expect(lower).toContain("não substitui");
    }
  });

  it("interpretation DEXA não usa linguagem diagnóstica", () => {
    for (const claim of dexaClaims) {
      expect(hasProhibitedTerm(claim.interpretation)).toEqual([]);
    }
  });

  it("EVIDENCE_DOMAIN_DISCLAIMER_KEYWORDS exige 'laudo' e 'não substitui' pra DEXA", () => {
    const keywords = EVIDENCE_DOMAIN_DISCLAIMER_KEYWORDS.dexa;
    expect(keywords).toContain("laudo");
    expect(keywords).toContain("não substitui");
  });
});

// ── 6. Catálogo PAR-Q: invariante específica ─────────────────────────────────

describe("PAR-Q blocked — orienta revisão/encaminhamento (não prescrição)", () => {
  it("a claim de PAR-Q positivo (blocked) existe no catálogo", () => {
    const claim = getEvidenceClaim(
      "questionnaire_parq",
      "PAR-Q positivo (blocked)",
    );
    expect(claim).not.toBeNull();
  });

  it("coachAction da claim PAR-Q blocked contém keyword de revisão/encaminhamento", () => {
    const claim = getEvidenceClaim(
      "questionnaire_parq",
      "PAR-Q positivo (blocked)",
    );
    expect(claim).not.toBeNull();
    const action = claim!.coachAction.toLowerCase();
    const hasGuidance = PARQ_BLOCKED_COACH_ACTION_KEYWORDS.some((kw) =>
      action.includes(kw),
    );
    expect(hasGuidance).toBe(true);
  });

  it("riskLanguageLevel da PAR-Q blocked é actionable (next step claro, sem alarmismo)", () => {
    const claim = getEvidenceClaim(
      "questionnaire_parq",
      "PAR-Q positivo (blocked)",
    );
    expect(claim?.riskLanguageLevel).toBe("actionable");
  });
});

// ── 7. Helpers de lookup ────────────────────────────────────────────────────

describe("lookup helpers", () => {
  it("getEvidenceClaim retorna claim quando existe", () => {
    const claim = getEvidenceClaim("vo2_max", "Fraco");
    expect(claim).not.toBeNull();
    expect(claim?.domain).toBe("vo2_max");
    expect(claim?.classification).toBe("Fraco");
  });

  it("getEvidenceClaim retorna null quando classification não existe", () => {
    expect(getEvidenceClaim("vo2_max", "Inexistente")).toBeNull();
  });

  it("getClaimsByDomain filtra corretamente", () => {
    const vo2 = getClaimsByDomain("vo2_max");
    expect(vo2.length).toBeGreaterThan(0);
    for (const c of vo2) expect(c.domain).toBe("vo2_max");
  });
});

// ── 8. instantiateClaim ─────────────────────────────────────────────────────

describe("instantiateClaim", () => {
  it("injeta observedValue sem mutar a claim original", () => {
    const original = getEvidenceClaim("vo2_max", "Fraco")!;
    const instantiated = instantiateClaim(original, "27 ml/kg/min");
    expect(instantiated.observedValue).toBe("27 ml/kg/min");
    expect(original.observedValue).toBeNull();
  });

  it("preserva todos os outros campos da claim", () => {
    const original = getEvidenceClaim("vo2_max", "Fraco")!;
    const instantiated = instantiateClaim(original, "X");
    expect(instantiated.domain).toBe(original.domain);
    expect(instantiated.metric).toBe(original.metric);
    expect(instantiated.classification).toBe(original.classification);
    expect(instantiated.interpretation).toBe(original.interpretation);
    expect(instantiated.sources).toEqual(original.sources);
    expect(instantiated.disclaimer).toBe(original.disclaimer);
    expect(instantiated.principles).toEqual(original.principles);
  });
});

// ── 9. Cobertura mínima exigida pela spec do E5.1 ───────────────────────────

describe("E5.1 cobertura mínima — domínios obrigatórios", () => {
  const MINIMUM_DOMAINS: EvidenceDomain[] = [
    "vo2_max",
    "fc_recovery_1min",
    "handgrip",
    "sit_to_stand",
    "dexa",
    "questionnaire_parq",
    "sleep_stress_energy_adherence",
  ];

  for (const domain of MINIMUM_DOMAINS) {
    it(`domínio ${domain} tem >= 1 claim publicada`, () => {
      expect(getClaimsByDomain(domain).length).toBeGreaterThan(0);
    });
  }
});

// ── 10. Catálogo de fontes — robustez bibliográfica ─────────────────────────

describe("EVIDENCE_SOURCE_CATALOG — referências robustas por teste", () => {
  const sourceEntries = Object.entries(EVIDENCE_SOURCE_CATALOG);

  it("catálogo de fontes canônicas não está vazio", () => {
    expect(sourceEntries.length).toBeGreaterThanOrEqual(20);
  });

  it("toda fonte canônica tem título, citação, URL pública e população/contexto", () => {
    for (const [sourceId, source] of sourceEntries) {
      expect(source.title, sourceId).toMatch(/\S/);
      expect(source.citation, sourceId).toMatch(/\S/);
      expect(source.population, sourceId).toMatch(/\S/);
      expect(source.url, sourceId).toMatch(/^https?:\/\//);
    }
  });

  it("nenhuma fonte canônica aponta para homepage genérica", () => {
    const genericUrls = new Set([
      "https://www.acsm.org/",
      "https://example.com",
    ]);

    for (const [sourceId, source] of sourceEntries) {
      expect(genericUrls.has(source.url), sourceId).toBe(false);
    }
  });

  it("VO₂ combina referência populacional, desfecho real e diretriz de prescrição", () => {
    const titles = getClaimsByDomain("vo2_max")
      .flatMap((claim) => claim.sources.map((source) => source.title))
      .join(" | ");

    expect(titles).toContain("FRIEND");
    expect(titles).toContain("All-Cause Mortality");
    expect(titles).toContain("Quantity and Quality of Exercise");
  });

  it("FC recovery combina Cole, Nishime e Vivekananthan", () => {
    const citations = getClaimsByDomain("fc_recovery_1min")
      .flatMap((claim) => claim.sources.map((source) => source.citation))
      .join(" | ");

    expect(citations).toContain("Cole");
    expect(citations).toContain("Nishime");
    expect(citations).toContain("Vivekananthan");
  });

  it("handgrip combina norma populacional, desfecho e consenso clínico", () => {
    const citations = getClaimsByDomain("handgrip")
      .flatMap((claim) => claim.sources.map((source) => source.citation))
      .join(" | ");

    expect(citations).toContain("Mathiowetz");
    expect(citations).toContain("Dodds");
    expect(citations).toContain("Leong");
  });

  it("sit-to-stand combina estudo de mortalidade e scores de referência", () => {
    const titles = getClaimsByDomain("sit_to_stand")
      .flatMap((claim) => claim.sources.map((source) => source.title))
      .join(" | ");

    expect(titles).toContain("predictor of all-cause mortality");
    expect(titles).toContain("Sex- and age-reference scores");
  });

  it("DEXA combina NHANES, composição corporal e posição ISCD", () => {
    const citations = getClaimsByDomain("dexa")
      .flatMap((claim) => claim.sources.map((source) => source.citation))
      .join(" | ");

    expect(citations).toContain("Kelly");
    expect(citations).toContain("Gallagher");
    expect(citations).toContain("Baumgartner");
    expect(citations).toContain("International Society for Clinical Densitometry");
  });

  it("PAR-Q usa Warburton/Jamnik/Bredin e ACSM, não fonte genérica/mal nomeada", () => {
    const citations = getClaimsByDomain("questionnaire_parq")
      .flatMap((claim) => claim.sources.map((source) => source.citation))
      .join(" | ");

    expect(citations).toContain("Warburton");
    expect(citations).toContain("Bredin");
    expect(citations).toContain("Thompson");
    expect(JSON.stringify(EVIDENCE_SOURCE_CATALOG)).not.toContain(
      "PARQ_SHEPHARD_2015",
    );
  });

  it("sono/estresse/energia/adesão tem uma fonte por construto", () => {
    const citations = getClaimsByDomain("sleep_stress_energy_adherence")
      .flatMap((claim) => claim.sources.map((source) => source.citation))
      .join(" | ");

    expect(citations).toContain("Watson");
    expect(citations).toContain("Cohen");
    expect(citations).toContain("Ryan");
    expect(citations).toContain("Eynon");
  });
});

// ── 10. Labels exportados pra UI (E5.4 endurecido) ──────────────────────────

describe("EVIDENCE_DOMAIN_LABEL + EVIDENCE_RISK_LEVEL_LABEL", () => {
  it("EVIDENCE_DOMAIN_LABEL cobre os 7 domínios da spec", () => {
    for (const domain of EVIDENCE_DOMAINS) {
      const label = EVIDENCE_DOMAIN_LABEL[domain];
      expect(label, `${domain} sem label`).toBeTruthy();
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("EVIDENCE_RISK_LEVEL_LABEL mapeia os 4 níveis com tom não-alarmista", () => {
    expect(EVIDENCE_RISK_LEVEL_LABEL.reassuring).toBe("Favorável");
    expect(EVIDENCE_RISK_LEVEL_LABEL.informational).toBe("Informativo");
    expect(EVIDENCE_RISK_LEVEL_LABEL.watchful).toBe("Atenção");
    expect(EVIDENCE_RISK_LEVEL_LABEL.actionable).toBe("Próximo passo");
    // Tom não-alarmista: nenhuma label contém palavras de pânico.
    const labels: string[] = Object.values(EVIDENCE_RISK_LEVEL_LABEL);
    for (const label of labels) {
      expect(label.toLowerCase()).not.toMatch(
        /emerg(ência|encia)|alarme|perigo|urgência|urgencia|crítico|critico/,
      );
    }
  });
});
