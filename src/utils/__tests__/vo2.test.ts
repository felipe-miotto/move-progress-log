import { describe, expect, it } from "vitest";
import {
  calcFcMaxPredicted,
  calcVo2Bike,
  calcPercentFcMax,
  classifyRecovery,
} from "../vo2";

describe("calcFcMaxPredicted (Tanaka 2001)", () => {
  it("calcula FCmáx pra idades típicas", () => {
    expect(calcFcMaxPredicted(20)).toBe(194); // 208 - 14 = 194
    expect(calcFcMaxPredicted(40)).toBe(180); // 208 - 28 = 180
    expect(calcFcMaxPredicted(58)).toBe(167); // 208 - 40.6 ≈ 167 (Roberto exemplo)
    expect(calcFcMaxPredicted(65)).toBe(163); // 208 - 45.5 = 162.5 → 163
  });

  it("rejeita idades inválidas", () => {
    expect(calcFcMaxPredicted(0)).toBe(0);
    expect(calcFcMaxPredicted(-10)).toBe(0);
    expect(calcFcMaxPredicted(Number.NaN)).toBe(0);
    expect(calcFcMaxPredicted(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("calcVo2Bike (ACSM 2018)", () => {
  it("calcula VO₂ pra carga e peso típicos", () => {
    // 200W / 80kg → (10.8 × 200 / 80) + 7 = 27 + 7 = 34
    expect(calcVo2Bike(200, 80)).toBe(34);

    // 100W / 70kg → (10.8 × 100 / 70) + 7 = 15.4286 + 7 = 22.43
    expect(calcVo2Bike(100, 70)).toBe(22.43);

    // 0W (idle) / 70kg → 7
    expect(calcVo2Bike(0, 70)).toBe(7);
  });

  it("rejeita watts negativos ou inválidos", () => {
    expect(calcVo2Bike(-50, 80)).toBe(0);
    expect(calcVo2Bike(Number.NaN, 80)).toBe(0);
  });

  it("rejeita pesos ≤ 0 ou inválidos", () => {
    expect(calcVo2Bike(200, 0)).toBe(0);
    expect(calcVo2Bike(200, -80)).toBe(0);
    expect(calcVo2Bike(200, Number.NaN)).toBe(0);
  });

  it("usa 2 casas decimais", () => {
    const result = calcVo2Bike(150, 75);
    // (10.8 × 150 / 75) + 7 = 21.6 + 7 = 28.6
    expect(result).toBe(28.6);
    expect(Number.isInteger(result * 100)).toBe(true);
  });
});

describe("calcPercentFcMax", () => {
  it("calcula razão correta", () => {
    expect(calcPercentFcMax(170, 200)).toBe(0.85); // 85%
    expect(calcPercentFcMax(180, 180)).toBe(1); // 100%
    expect(calcPercentFcMax(140, 200)).toBe(0.7); // 70%
  });

  it("permite valores acima de 100% (esforço acima da estimativa)", () => {
    expect(calcPercentFcMax(210, 200)).toBe(1.05);
  });

  it("retorna 0 pra inputs inválidos", () => {
    expect(calcPercentFcMax(0, 200)).toBe(0);
    expect(calcPercentFcMax(170, 0)).toBe(0);
    expect(calcPercentFcMax(-10, 200)).toBe(0);
    expect(calcPercentFcMax(Number.NaN, 200)).toBe(0);
  });
});

describe("classifyRecovery (Cole 1999 NEJM + ACSM Guidelines)", () => {
  it("classifica nas 4 faixas oficiais", () => {
    expect(classifyRecovery(35)).toBe("Excelente"); // ≥ 30
    expect(classifyRecovery(30)).toBe("Excelente"); // limite inferior
    expect(classifyRecovery(29)).toBe("Muito Boa"); // limite superior
    expect(classifyRecovery(25)).toBe("Muito Boa");
    expect(classifyRecovery(20)).toBe("Muito Boa"); // limite inferior
    expect(classifyRecovery(19)).toBe("Moderada"); // limite superior
    expect(classifyRecovery(15)).toBe("Moderada");
    expect(classifyRecovery(13)).toBe("Moderada"); // limite inferior Moderada
    expect(classifyRecovery(12)).toBe("Baixa"); // cutoff clínico Cole 1999 (≤12 anormal)
    expect(classifyRecovery(11)).toBe("Baixa");
    expect(classifyRecovery(5)).toBe("Baixa");
    expect(classifyRecovery(0)).toBe("Baixa");
  });

  it("retorna 'Indeterminada' pra valores não-numéricos ou infinitos", () => {
    expect(classifyRecovery(Number.NaN)).toBe("Indeterminada");
    // Drop infinito não tem sentido clínico — rejeita como inputs inválidos
    expect(classifyRecovery(Number.POSITIVE_INFINITY)).toBe("Indeterminada");
    expect(classifyRecovery(Number.NEGATIVE_INFINITY)).toBe("Indeterminada");
  });

  it("aceita drops negativos (FC subiu pós-teste) como Baixa", () => {
    // Caso clinicamente relevante: FC continuou subindo após parada (resposta autonômica ruim)
    expect(classifyRecovery(-5)).toBe("Baixa");
  });
});
