/**
 * Protocolos fixos da bike Technogym usados pela Fabrik.
 *
 * Cravados em código (não em DB) porque são definidos pelo equipamento +
 * método Fabrik, não personalizáveis por aluno. Espelha as planilhas
 * `Fabrik_Bike_Ride_Technogym_Teste_Maximo_FIXO.xlsx` e
 * `Fabrik_Bike_Ride_Technogym_Teste_Submaximo_FIXO.xlsx`.
 *
 * Esteira: protocolo NÃO é cravado aqui — coach informa `protocol_name`
 * como texto livre em `vo2_assessment_details` (esquema flexível).
 */

import type { BikeStagePhase } from "@/types/assessment";

export interface BikeProtocolStage {
  /** Ordem do estágio (1-based). */
  stageOrder: number;
  /** Rótulo de tempo, ex. "0-2", "2-4". */
  timeLabel: string;
  /** Fase do teste. */
  phase: BikeStagePhase;
  /** Carga fixa do protocolo (escala Technogym, 1-15). */
  loadValue: number;
  /** Cadência alvo (RPM). Faixa apresentada como texto. */
  rpmTarget: string;
}

export interface BikeProtocol {
  id: "bike_max" | "bike_submax";
  label: string;
  warmupLoad: number;
  cadenceTargetRange: string;
  /** Critério de parada (apresentação textual). */
  stopCriterion: string;
  stages: BikeProtocolStage[];
}

// ────────────────────────────────────────────────────────────────────────────
// Bike Máximo
// Aquecimento carga 2 (0-2 min) · cadência 80-90 RPM
// Critério de parada: PSE 10 OU falha de cadência
// ────────────────────────────────────────────────────────────────────────────

export const BIKE_MAX_PROTOCOL: BikeProtocol = {
  id: "bike_max",
  label: "Bike Máximo (Technogym)",
  warmupLoad: 2,
  cadenceTargetRange: "80-90 RPM",
  stopCriterion: "PSE 10 ou falha de cadência",
  stages: [
    { stageOrder: 1, timeLabel: "0-2",   phase: "warmup",   loadValue: 2,  rpmTarget: "80-90" },
    { stageOrder: 2, timeLabel: "2-4",   phase: "test",     loadValue: 3,  rpmTarget: "80-90" },
    { stageOrder: 3, timeLabel: "4-6",   phase: "test",     loadValue: 4,  rpmTarget: "80-90" },
    { stageOrder: 4, timeLabel: "6-8",   phase: "test",     loadValue: 5,  rpmTarget: "80-90" },
    { stageOrder: 5, timeLabel: "8-10",  phase: "test",     loadValue: 7,  rpmTarget: "80-90" },
    { stageOrder: 6, timeLabel: "10-12", phase: "test",     loadValue: 9,  rpmTarget: "80-90" },
    { stageOrder: 7, timeLabel: "12-14", phase: "test",     loadValue: 11, rpmTarget: "80-90" },
    { stageOrder: 8, timeLabel: "14-16", phase: "test",     loadValue: 13, rpmTarget: "80-90" },
    { stageOrder: 9, timeLabel: "+1",    phase: "recovery", loadValue: 2,  rpmTarget: "livre" },
  ],
};

// ────────────────────────────────────────────────────────────────────────────
// Bike Submáximo
// Aquecimento carga 2 (0-2 min) · cadência 70-80 RPM
// Critério de parada: PSE ≥ 9 OU FC ≥ 90% FCmáx (alerta 90-95%, parar em 95%)
// ────────────────────────────────────────────────────────────────────────────

export const BIKE_SUBMAX_PROTOCOL: BikeProtocol = {
  id: "bike_submax",
  label: "Bike Submáximo (Technogym)",
  warmupLoad: 2,
  cadenceTargetRange: "70-80 RPM",
  stopCriterion: "PSE ≥ 9 ou FC ≥ 90% FCmáx",
  stages: [
    { stageOrder: 1, timeLabel: "0-2",   phase: "warmup",   loadValue: 2, rpmTarget: "70-80" },
    { stageOrder: 2, timeLabel: "2-4",   phase: "test",     loadValue: 3, rpmTarget: "70-80" },
    { stageOrder: 3, timeLabel: "4-6",   phase: "test",     loadValue: 4, rpmTarget: "70-80" },
    { stageOrder: 4, timeLabel: "6-8",   phase: "test",     loadValue: 5, rpmTarget: "70-80" },
    { stageOrder: 5, timeLabel: "8-10",  phase: "test",     loadValue: 6, rpmTarget: "70-80" },
    { stageOrder: 6, timeLabel: "10-12", phase: "test",     loadValue: 7, rpmTarget: "70-80" },
    { stageOrder: 7, timeLabel: "12-14", phase: "test",     loadValue: 8, rpmTarget: "70-80" },
    { stageOrder: 8, timeLabel: "14-16", phase: "test",     loadValue: 9, rpmTarget: "70-80" },
    { stageOrder: 9, timeLabel: "+1",    phase: "recovery", loadValue: 2, rpmTarget: "livre" },
  ],
};

/** Lookup auxiliar. */
export const BIKE_PROTOCOLS: Record<BikeProtocol["id"], BikeProtocol> = {
  bike_max: BIKE_MAX_PROTOCOL,
  bike_submax: BIKE_SUBMAX_PROTOCOL,
};

// ────────────────────────────────────────────────────────────────────────────
// Metadados dos 9 tipos de avaliação (label, categoria, descrição curta)
// Usado em UI de seleção (NewAssessmentDialog na E2).
// ────────────────────────────────────────────────────────────────────────────

export const ASSESSMENT_TYPE_METADATA = {
  vo2_bike_max: {
    label: "VO₂ Bike Máximo",
    category: "VO₂",
    short: "Bike Technogym até esforço máximo",
    application: "coach_administered",
  },
  vo2_bike_submax: {
    label: "VO₂ Bike Submáximo",
    category: "VO₂",
    short: "Bike Technogym até 90% FCmáx",
    application: "coach_administered",
  },
  vo2_treadmill_walk_submax: {
    label: "VO₂ Esteira Caminhada Submáxima",
    category: "VO₂",
    short: "Caminhada submáxima na esteira",
    application: "coach_administered",
  },
  vo2_treadmill_run_submax: {
    label: "VO₂ Esteira Corrida Submáxima",
    category: "VO₂",
    short: "Corrida submáxima na esteira",
    application: "coach_administered",
  },
  vo2_treadmill_run_max: {
    label: "VO₂ Esteira Corrida Máxima",
    category: "VO₂",
    short: "Corrida máxima na esteira",
    application: "coach_administered",
  },
  handgrip: {
    label: "Força de Preensão (Handgrip)",
    category: "Força",
    short: "Dinamometria — 3 tentativas/mão",
    application: "coach_administered",
  },
  dexa: {
    label: "DEXA (Composição Corporal)",
    category: "Composição",
    short: "Laudo externo de clínica parceira",
    application: "external_lab",
  },
  sit_to_stand: {
    label: "Sentar e Levantar",
    category: "Funcional",
    short: "Teste Claudio Gil Araújo",
    application: "coach_administered",
  },
  questionnaire_precision12: {
    label: "Questionário Precision 12",
    category: "Anamnese",
    short: "54 perguntas em 11 blocos",
    application: "self_administered",
  },
} as const satisfies Record<
  import("@/types/assessment").AssessmentType,
  { label: string; category: string; short: string; application: string }
>;
