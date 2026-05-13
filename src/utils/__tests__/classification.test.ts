import { describe, expect, it } from "vitest";
import {
  classifyVo2,
  classifyHandgrip,
  classifySitToStand,
  filterRangesBySexAge,
  filterSitToStandByAge,
  type Vo2ReferenceRange,
  type HandgripReferenceRange,
  type SitToStandReferenceRange,
} from "../classification";

// Fixtures mínimas (subset das faixas ACSM/Mathiowetz/Araújo)
const VO2_RANGES_M_50_59: Vo2ReferenceRange[] = [
  { sex: "M", age_min: 50, age_max: 59, classification: "Muito Fraco", vo2_min: 0, vo2_max: 25 },
  { sex: "M", age_min: 50, age_max: 59, classification: "Fraco", vo2_min: 25.01, vo2_max: 31 },
  { sex: "M", age_min: 50, age_max: 59, classification: "Regular", vo2_min: 31.01, vo2_max: 35 },
  { sex: "M", age_min: 50, age_max: 59, classification: "Bom", vo2_min: 35.01, vo2_max: 41 },
  { sex: "M", age_min: 50, age_max: 59, classification: "Excelente", vo2_min: 41.01, vo2_max: 49 },
  { sex: "M", age_min: 50, age_max: 59, classification: "Superior", vo2_min: 49.01, vo2_max: 100 },
];

const HANDGRIP_RANGES_F_30_39: HandgripReferenceRange[] = [
  { sex: "F", age_min: 30, age_max: 39, classification: "Muito Baixo", kg_min: 0, kg_max: 19 },
  { sex: "F", age_min: 30, age_max: 39, classification: "Baixo", kg_min: 19.01, kg_max: 24 },
  { sex: "F", age_min: 30, age_max: 39, classification: "Médio", kg_min: 24.01, kg_max: 30 },
  { sex: "F", age_min: 30, age_max: 39, classification: "Alto", kg_min: 30.01, kg_max: 36 },
  { sex: "F", age_min: 30, age_max: 39, classification: "Muito Alto", kg_min: 36.01, kg_max: 100 },
];

const SIT_TO_STAND_RANGES: SitToStandReferenceRange[] = [
  { age_min: 18, age_max: 99, classification: "Alerta", score_min: 0, score_max: 3.0 },
  { age_min: 18, age_max: 99, classification: "Atenção", score_min: 3.5, score_max: 5.5 },
  { age_min: 18, age_max: 99, classification: "Bom", score_min: 6.0, score_max: 7.5 },
  { age_min: 18, age_max: 99, classification: "Excelente", score_min: 8.0, score_max: 10.0 },
];

describe("classifyVo2", () => {
  it("classifica nas 6 faixas ACSM", () => {
    expect(classifyVo2(20, VO2_RANGES_M_50_59)).toBe("Muito Fraco");
    expect(classifyVo2(28, VO2_RANGES_M_50_59)).toBe("Fraco");
    expect(classifyVo2(33, VO2_RANGES_M_50_59)).toBe("Regular");
    expect(classifyVo2(40, VO2_RANGES_M_50_59)).toBe("Bom");
    expect(classifyVo2(45, VO2_RANGES_M_50_59)).toBe("Excelente");
    expect(classifyVo2(55, VO2_RANGES_M_50_59)).toBe("Superior");
  });

  it("retorna null pra ranges vazios (faixa etária não coberta)", () => {
    expect(classifyVo2(30, [])).toBeNull();
  });

  it("retorna null pra valor inválido", () => {
    expect(classifyVo2(Number.NaN, VO2_RANGES_M_50_59)).toBeNull();
    expect(classifyVo2(-5, VO2_RANGES_M_50_59)).toBeNull();
  });
});

describe("classifyHandgrip", () => {
  it("classifica nas 5 faixas Mathiowetz", () => {
    expect(classifyHandgrip(15, HANDGRIP_RANGES_F_30_39)).toBe("Muito Baixo");
    expect(classifyHandgrip(22, HANDGRIP_RANGES_F_30_39)).toBe("Baixo");
    expect(classifyHandgrip(27, HANDGRIP_RANGES_F_30_39)).toBe("Médio");
    expect(classifyHandgrip(33, HANDGRIP_RANGES_F_30_39)).toBe("Alto");
    expect(classifyHandgrip(40, HANDGRIP_RANGES_F_30_39)).toBe("Muito Alto");
  });

  it("retorna null pra ranges vazios", () => {
    expect(classifyHandgrip(30, [])).toBeNull();
  });
});

describe("classifySitToStand", () => {
  it("classifica nas 4 faixas Araújo 2012", () => {
    expect(classifySitToStand(0, SIT_TO_STAND_RANGES)).toBe("Alerta");
    expect(classifySitToStand(3, SIT_TO_STAND_RANGES)).toBe("Alerta");
    expect(classifySitToStand(4, SIT_TO_STAND_RANGES)).toBe("Atenção");
    expect(classifySitToStand(5.5, SIT_TO_STAND_RANGES)).toBe("Atenção");
    expect(classifySitToStand(6, SIT_TO_STAND_RANGES)).toBe("Bom");
    expect(classifySitToStand(7.5, SIT_TO_STAND_RANGES)).toBe("Bom");
    expect(classifySitToStand(8, SIT_TO_STAND_RANGES)).toBe("Excelente");
    expect(classifySitToStand(10, SIT_TO_STAND_RANGES)).toBe("Excelente");
  });

  it("retorna null pra score fora de 0-10", () => {
    expect(classifySitToStand(-1, SIT_TO_STAND_RANGES)).toBeNull();
    expect(classifySitToStand(11, SIT_TO_STAND_RANGES)).toBeNull();
    expect(classifySitToStand(Number.NaN, SIT_TO_STAND_RANGES)).toBeNull();
  });

  it("score 3.25 (gap entre Alerta e Atenção) retorna null — gap intencional", () => {
    // Note: faixas Araújo têm gap entre 3 (Alerta max) e 3.5 (Atenção min)
    // — score 3.25 cai num "limbo". Mantemos null por enquanto, coach decide
    // se classifica como Alerta ou Atenção manualmente.
    expect(classifySitToStand(3.25, SIT_TO_STAND_RANGES)).toBeNull();
  });
});

describe("filterRangesBySexAge", () => {
  const ALL_RANGES: Vo2ReferenceRange[] = [
    ...VO2_RANGES_M_50_59,
    { sex: "F", age_min: 50, age_max: 59, classification: "Bom", vo2_min: 28, vo2_max: 33 },
    { sex: "M", age_min: 30, age_max: 39, classification: "Bom", vo2_min: 38, vo2_max: 45 },
  ];

  it("filtra por sexo + idade", () => {
    const filtered = filterRangesBySexAge(ALL_RANGES, "M", 55);
    expect(filtered).toHaveLength(6);
    expect(filtered.every((r) => r.sex === "M" && 55 >= r.age_min && 55 <= r.age_max)).toBe(true);
  });

  it("retorna vazio quando faixa etária não coberta", () => {
    expect(filterRangesBySexAge(ALL_RANGES, "M", 80)).toHaveLength(0);
  });

  it("retorna vazio quando sex/age nulos", () => {
    expect(filterRangesBySexAge(ALL_RANGES, null, 55)).toHaveLength(0);
    expect(filterRangesBySexAge(ALL_RANGES, "M", null)).toHaveLength(0);
  });
});

describe("filterSitToStandByAge", () => {
  it("filtra pela idade (não tem sexo nas faixas)", () => {
    const filtered = filterSitToStandByAge(SIT_TO_STAND_RANGES, 45);
    expect(filtered).toHaveLength(4); // todas as 4 categorias cobrem 18-99
  });

  it("retorna vazio quando idade fora", () => {
    expect(filterSitToStandByAge(SIT_TO_STAND_RANGES, 15)).toHaveLength(0);
  });
});
