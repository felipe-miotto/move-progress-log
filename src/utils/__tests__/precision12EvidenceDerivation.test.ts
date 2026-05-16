/**
 * E5.3 — Testes da camada de derivação de Evidence Claims.
 *
 * Cobertura:
 *   • Input vazio → []
 *   • Cada domínio isolado retorna a claim correta do catálogo.
 *   • `observedValue` é injetado na claim derivada SEM mutar o catálogo.
 *   • Classificação inexistente é ignorada silenciosamente.
 *   • PAR-Q true/false/null.
 *   • Adesão com 1 flag individual.
 *   • Adesão com ≥ 2 flags emite a claim agregada além das individuais.
 *   • DEXA com múltiplos marcadores retorna múltiplas claims.
 *   • Ordem final segue a sequência canônica dos 7 domínios.
 *   • Funções não mutam input nem catálogo (verificação por deep-equal).
 */

import { describe, expect, it } from "vitest";

import {
  EVIDENCE_CATALOG,
  getEvidenceClaim,
  type EvidenceClaim,
  type EvidenceDomain,
} from "../precision12Evidence";

import {
  deriveAdherenceEvidenceClaims,
  deriveDexaEvidenceClaims,
  deriveEvidenceClaims,
  deriveFcRecoveryEvidenceClaims,
  deriveHandgripEvidenceClaims,
  deriveParqEvidenceClaims,
  deriveSitToStandEvidenceClaims,
  deriveVo2EvidenceClaims,
  type Precision12EvidenceInput,
} from "../precision12EvidenceDerivation";

// Snapshot do catálogo pra verificar imutabilidade no fim dos testes.
const CATALOG_SNAPSHOT = EVIDENCE_CATALOG.map((c) => ({
  domain: c.domain,
  classification: c.classification,
  observedValue: c.observedValue,
}));

// ── 1. Input vazio ──────────────────────────────────────────────────────────

describe("deriveEvidenceClaims — input vazio", () => {
  it("input sem nenhum campo → []", () => {
    expect(deriveEvidenceClaims({})).toEqual([]);
  });

  it("input com domínios vazios → []", () => {
    expect(
      deriveEvidenceClaims({
        vo2: {},
        fcRecovery1Min: {},
        handgrip: {},
        sitToStand: {},
        dexa: {},
        parq: {},
        adherence: {},
      }),
    ).toEqual([]);
  });

  it("classification null → []", () => {
    expect(
      deriveEvidenceClaims({
        vo2: { classification: null },
        handgrip: { classification: null },
      }),
    ).toEqual([]);
  });

  it("classification em branco (só espaço) → []", () => {
    expect(deriveEvidenceClaims({ vo2: { classification: "   " } })).toEqual([]);
  });
});

// ── 2. Domínios isolados ────────────────────────────────────────────────────

describe("derivação por domínio isolado — bate o catálogo", () => {
  it("VO₂ 'Fraco'", () => {
    const out = deriveVo2EvidenceClaims({
      vo2: { classification: "Fraco" },
    });
    expect(out).toHaveLength(1);
    expect(out[0].domain).toBe("vo2_max");
    expect(out[0].classification).toBe("Fraco");
  });

  it("FC recovery 'Atenção'", () => {
    const out = deriveFcRecoveryEvidenceClaims({
      fcRecovery1Min: { classification: "Atenção" },
    });
    expect(out).toHaveLength(1);
    expect(out[0].domain).toBe("fc_recovery_1min");
  });

  it("Handgrip 'Médio'", () => {
    const out = deriveHandgripEvidenceClaims({
      handgrip: { classification: "Médio" },
    });
    expect(out).toHaveLength(1);
    expect(out[0].domain).toBe("handgrip");
    expect(out[0].classification).toBe("Médio");
  });

  it("Sit-to-Stand 'Excelente'", () => {
    const out = deriveSitToStandEvidenceClaims({
      sitToStand: { classification: "Excelente" },
    });
    expect(out).toHaveLength(1);
    expect(out[0].domain).toBe("sit_to_stand");
    expect(out[0].classification).toBe("Excelente");
  });
});

// ── 3. observedValue injetado + catálogo intocado ───────────────────────────

describe("observedValue → instantiateClaim, catálogo permanece com null", () => {
  it("injeta observedValue na claim derivada", () => {
    const out = deriveVo2EvidenceClaims({
      vo2: { classification: "Fraco", observedValue: "27 ml/kg/min" },
    });
    expect(out[0].observedValue).toBe("27 ml/kg/min");
  });

  it("não muta a entry do catálogo (observedValue lá continua null)", () => {
    deriveVo2EvidenceClaims({
      vo2: { classification: "Fraco", observedValue: "27 ml/kg/min" },
    });
    const catalogClaim = getEvidenceClaim("vo2_max", "Fraco");
    expect(catalogClaim?.observedValue).toBeNull();
  });

  it("observedValue vazio NÃO chama instantiateClaim (devolve a claim do catálogo)", () => {
    const out = deriveVo2EvidenceClaims({
      vo2: { classification: "Fraco", observedValue: "" },
    });
    expect(out[0].observedValue).toBeNull();
  });
});

// ── 3.b Trim em classification + observedValue ──────────────────────────────

describe("tryDerive — trim resilience", () => {
  it("classification com espaços no entorno resolve como classificação trimada", () => {
    const out = deriveVo2EvidenceClaims({
      vo2: { classification: " Fraco " },
    });
    expect(out).toHaveLength(1);
    expect(out[0].classification).toBe("Fraco");
  });

  it("classification com tabs/newlines no entorno resolve normalmente", () => {
    const out = deriveHandgripEvidenceClaims({
      handgrip: { classification: "\t Médio \n" },
    });
    expect(out).toHaveLength(1);
    expect(out[0].classification).toBe("Médio");
  });

  it("observedValue com espaços no entorno é injetado trimado", () => {
    const out = deriveVo2EvidenceClaims({
      vo2: { classification: "Fraco", observedValue: " 27 ml/kg/min " },
    });
    expect(out[0].observedValue).toBe("27 ml/kg/min");
  });

  it("observedValue só com espaços/tab/newline → tratado como ausente (null)", () => {
    const out = deriveVo2EvidenceClaims({
      vo2: { classification: "Fraco", observedValue: "   \t\n  " },
    });
    expect(out[0].observedValue).toBeNull();
  });

  it("classification só com espaços → ignora silenciosamente ([])", () => {
    const out = deriveVo2EvidenceClaims({
      vo2: { classification: "   ", observedValue: "27 ml/kg/min" },
    });
    expect(out).toEqual([]);
  });

  it("trim em DEXA preserva múltiplos marcadores com observedValues normalizados", () => {
    const out = deriveDexaEvidenceClaims({
      dexa: {
        bodyFatClassification: "  % gordura elevada para faixa etária  ",
        bodyFatObservedValue: " 32% ",
        visceralFatClassification: "Gordura visceral elevada",
        visceralFatObservedValue: "  ",
      },
    });
    expect(out).toHaveLength(2);
    expect(out[0].classification).toBe("% gordura elevada para faixa etária");
    expect(out[0].observedValue).toBe("32%");
    expect(out[1].observedValue).toBeNull();
  });
});

// ── 4. Classificação inexistente → ignora silenciosamente ───────────────────

describe("classificação inexistente é ignorada silenciosamente", () => {
  it("VO₂ 'Inexistente' → []", () => {
    expect(
      deriveVo2EvidenceClaims({ vo2: { classification: "Inexistente" } }),
    ).toEqual([]);
  });

  it("Handgrip 'Muito Baixo' (não está no catálogo E5.2) → []", () => {
    // E5.2 cobre Baixo/Médio/Alto — Muito Baixo/Muito Alto ficaram pra
    // ampliação futura. Derivação não deve quebrar.
    expect(
      deriveHandgripEvidenceClaims({
        handgrip: { classification: "Muito Baixo" },
      }),
    ).toEqual([]);
  });

  it("Sit-to-Stand 'Atenção' (não cobre no catálogo) → []", () => {
    expect(
      deriveSitToStandEvidenceClaims({
        sitToStand: { classification: "Atenção" },
      }),
    ).toEqual([]);
  });

  it("não lança erro para classificação totalmente diferente", () => {
    expect(() =>
      deriveEvidenceClaims({
        vo2: { classification: "🤷" },
        handgrip: { classification: "" },
      }),
    ).not.toThrow();
  });
});

// ── 5. PAR-Q ─────────────────────────────────────────────────────────────────

describe("PAR-Q", () => {
  it("blocked === true → 'PAR-Q positivo (blocked)'", () => {
    const out = deriveParqEvidenceClaims({ parq: { blocked: true } });
    expect(out).toHaveLength(1);
    expect(out[0].classification).toBe("PAR-Q positivo (blocked)");
  });

  it("blocked === false → 'PAR-Q sem sinalizações'", () => {
    const out = deriveParqEvidenceClaims({ parq: { blocked: false } });
    expect(out).toHaveLength(1);
    expect(out[0].classification).toBe("PAR-Q sem sinalizações");
  });

  it("blocked === null → []", () => {
    expect(deriveParqEvidenceClaims({ parq: { blocked: null } })).toEqual([]);
  });

  it("blocked === undefined → []", () => {
    expect(deriveParqEvidenceClaims({ parq: {} })).toEqual([]);
  });

  it("sem objeto parq → []", () => {
    expect(deriveParqEvidenceClaims({})).toEqual([]);
  });
});

// ── 6. Adesão ───────────────────────────────────────────────────────────────

describe("Adesão / sono / estresse / energia", () => {
  it("flag individual de sono", () => {
    const out = deriveAdherenceEvidenceClaims({
      adherence: { sleepFlag: true },
    });
    expect(out).toHaveLength(1);
    expect(out[0].classification).toBe("Sono insuficiente");
  });

  it("flag individual de estresse", () => {
    const out = deriveAdherenceEvidenceClaims({
      adherence: { stressFlag: true },
    });
    expect(out).toHaveLength(1);
    expect(out[0].classification).toBe("Estresse alto");
  });

  it("flag individual de energia", () => {
    const out = deriveAdherenceEvidenceClaims({
      adherence: { energyFlag: true },
    });
    expect(out).toHaveLength(1);
    expect(out[0].classification).toBe("Baixa energia");
  });

  it("flag individual de barreira", () => {
    const out = deriveAdherenceEvidenceClaims({
      adherence: { barrierFlag: true },
    });
    expect(out).toHaveLength(1);
    expect(out[0].classification).toBe("Barreira de adesão relevante");
  });

  it("flags false não geram claim", () => {
    expect(
      deriveAdherenceEvidenceClaims({
        adherence: {
          sleepFlag: false,
          stressFlag: false,
          energyFlag: false,
          barrierFlag: false,
        },
      }),
    ).toEqual([]);
  });

  it("riskFlagCount >= 2 adiciona claim agregada APÓS as individuais", () => {
    const out = deriveAdherenceEvidenceClaims({
      adherence: {
        sleepFlag: true,
        stressFlag: true,
        riskFlagCount: 2,
      },
    });
    expect(out).toHaveLength(3);
    expect(out.map((c) => c.classification)).toEqual([
      "Sono insuficiente",
      "Estresse alto",
      "Risco de adesão (≥ 2 flags)",
    ]);
  });

  it("riskFlagCount = 1 NÃO emite claim agregada", () => {
    const out = deriveAdherenceEvidenceClaims({
      adherence: { sleepFlag: true, riskFlagCount: 1 },
    });
    expect(out.map((c) => c.classification)).toEqual(["Sono insuficiente"]);
  });

  it("riskFlagCount alto sem flags individuais ainda emite agregada", () => {
    const out = deriveAdherenceEvidenceClaims({
      adherence: { riskFlagCount: 3 },
    });
    expect(out.map((c) => c.classification)).toEqual([
      "Risco de adesão (≥ 2 flags)",
    ]);
  });
});

// ── 7. DEXA múltiplos marcadores ────────────────────────────────────────────

describe("DEXA com múltiplos marcadores", () => {
  it("4 marcadores diferentes → 4 claims na ordem canônica", () => {
    const out = deriveDexaEvidenceClaims({
      dexa: {
        bodyFatClassification: "% gordura elevada para faixa etária",
        bodyFatObservedValue: "32%",
        visceralFatClassification: "Gordura visceral elevada",
        androidGynoidClassification: "Relação androide/ginoide elevada",
        almHeightClassification: "ALM/altura² abaixo do corte populacional",
      },
    });
    expect(out).toHaveLength(4);
    expect(out.map((c) => c.metric)).toEqual([
      "body_fat_pct",
      "visceral_fat_g",
      "android_gynoid_ratio",
      "appendicular_lean_mass_kg",
    ]);
  });

  it("marcador sem classificação é ignorado", () => {
    const out = deriveDexaEvidenceClaims({
      dexa: {
        bodyFatClassification: "% gordura elevada para faixa etária",
        // outros 3 ausentes
      },
    });
    expect(out).toHaveLength(1);
    expect(out[0].metric).toBe("body_fat_pct");
  });

  it("classification DEXA não existente é ignorada (não quebra os outros)", () => {
    const out = deriveDexaEvidenceClaims({
      dexa: {
        bodyFatClassification: "classificação que não existe",
        visceralFatClassification: "Gordura visceral elevada",
      },
    });
    expect(out).toHaveLength(1);
    expect(out[0].metric).toBe("visceral_fat_g");
  });

  it("DEXA observedValue injetado por marcador", () => {
    const out = deriveDexaEvidenceClaims({
      dexa: {
        bodyFatClassification: "% gordura dentro da referência",
        bodyFatObservedValue: "18%",
      },
    });
    expect(out[0].observedValue).toBe("18%");
  });
});

// ── 8. Ordem canônica do orquestrador ───────────────────────────────────────

describe("deriveEvidenceClaims — ordem canônica dos 7 domínios", () => {
  it("input completo emite na ordem vo2 → fc → handgrip → s2s → dexa → parq → adherence", () => {
    const input: Precision12EvidenceInput = {
      vo2: { classification: "Fraco" },
      fcRecovery1Min: { classification: "Atenção" },
      handgrip: { classification: "Baixo" },
      sitToStand: { classification: "Alerta" },
      dexa: {
        bodyFatClassification: "% gordura elevada para faixa etária",
      },
      parq: { blocked: true },
      adherence: { sleepFlag: true, riskFlagCount: 2 },
    };
    const out = deriveEvidenceClaims(input);
    const domains: EvidenceDomain[] = out.map((c) => c.domain);
    // VO₂ primeiro, depois FC, handgrip, s2s, dexa, parq, e os 2 últimos
    // são sleep_stress_energy_adherence (individual + agregada).
    expect(domains.slice(0, 6)).toEqual([
      "vo2_max",
      "fc_recovery_1min",
      "handgrip",
      "sit_to_stand",
      "dexa",
      "questionnaire_parq",
    ]);
    expect(domains.slice(6)).toEqual([
      "sleep_stress_energy_adherence",
      "sleep_stress_energy_adherence",
    ]);
  });

  it("input parcial não quebra a ordem (domínios ausentes simplesmente somem)", () => {
    const out = deriveEvidenceClaims({
      handgrip: { classification: "Baixo" },
      parq: { blocked: true },
    });
    expect(out.map((c) => c.domain)).toEqual([
      "handgrip",
      "questionnaire_parq",
    ]);
  });
});

// ── 9. Imutabilidade ────────────────────────────────────────────────────────

describe("imutabilidade", () => {
  it("não muta o input", () => {
    const input: Precision12EvidenceInput = {
      vo2: { classification: "Fraco", observedValue: "27" },
      adherence: { sleepFlag: true, riskFlagCount: 2 },
    };
    const before = JSON.stringify(input);
    deriveEvidenceClaims(input);
    expect(JSON.stringify(input)).toBe(before);
  });

  it("não muta o EVIDENCE_CATALOG (snapshot domain/classification/observedValue)", () => {
    deriveEvidenceClaims({
      vo2: { classification: "Bom", observedValue: "42 ml/kg/min" },
      dexa: {
        bodyFatClassification: "% gordura elevada para faixa etária",
        bodyFatObservedValue: "33%",
      },
    });
    const after = EVIDENCE_CATALOG.map((c) => ({
      domain: c.domain,
      classification: c.classification,
      observedValue: c.observedValue,
    }));
    expect(after).toEqual(CATALOG_SNAPSHOT);
  });
});

// ── 10. Sanity: tipo do retorno ─────────────────────────────────────────────

describe("Sanity — claims derivadas são instâncias válidas", () => {
  it("toda claim derivada continua satisfazendo o shape EvidenceClaim", () => {
    const out = deriveEvidenceClaims({
      vo2: { classification: "Excelente", observedValue: "55 ml/kg/min" },
      handgrip: { classification: "Alto", observedValue: "48 kg" },
      parq: { blocked: false },
    });
    for (const claim of out) {
      const c: EvidenceClaim = claim; // type assertion compile-time
      expect(c.domain).toBeTruthy();
      expect(c.classification).toBeTruthy();
      expect(c.principles.real_endpoint).toBe(true);
      expect(c.principles.is_associative).toBe(true);
      expect(c.principles.modifiability_explicit).toBe(true);
      expect(c.principles.multidimensional).toBe(true);
      expect(c.sources.length).toBeGreaterThanOrEqual(1);
      expect(c.disclaimer.length).toBeGreaterThan(0);
    }
  });
});
