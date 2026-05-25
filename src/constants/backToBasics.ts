/**
 * Back to Basics - Constantes da metodologia de treino
 * Fabrik Performance - Body & Mind Fitness
 * 
 * ESTRUTURA DO MESOCICLO:
 * - 4 semanas com 3 treinos semanais (A/B/C)
 * - Treinos se repetem, ajustando apenas volume e intensidade
 * - A: Segunda e Quinta | B: Terça e Sexta | C: Quarta e Sábado
 */

// ============================================================================
// ESTRUTURA DO MESOCICLO (4 SEMANAS)
// ============================================================================

export const MESOCYCLE_STRUCTURE = {
  weeks: 4,
  workoutsPerWeek: 3,
  workoutSlots: {
    A: { name: "Treino A", days: ["Segunda", "Quinta"], color: "blue" },
    B: { name: "Treino B", days: ["Terça", "Sexta"], color: "green" },
    C: { name: "Treino C", days: ["Quarta", "Sábado"], color: "purple" },
  },
} as const;

export type WorkoutSlot = keyof typeof MESOCYCLE_STRUCTURE.workoutSlots;

// ============================================================================
// CATEGORIAS DE EXERCÍCIO (Nível 1 — filtro principal na UI)
// ============================================================================

export const EXERCISE_CATEGORIES = {
  respiracao: "Respiração",
  lmf: "Liberação Miofascial",
  mobilidade: "Mobilidade",
  core_ativacao: "Core & Ativação",
  potencia_pliometria: "Potência & Pliometria",
  forca_hipertrofia: "Força & Hipertrofia",
  condicionamento_metabolico: "Condicionamento Metabólico",
} as const;

export type ExerciseCategory = keyof typeof EXERCISE_CATEGORIES;

// ============================================================================
// PADRÕES DE MOVIMENTO (somente Força/Hipertrofia)
// Os 6 padrões reais. Demais categorias usam o campo `category` diretamente.
// ============================================================================

export const MOVEMENT_PATTERNS = {
  empurrar: "Empurrar",
  puxar: "Puxar",
  dominancia_joelho: "Dominância de Joelho",
  cadeia_posterior: "Cadeia Posterior",
  lunge: "Lunge",
  carregar: "Carregar",
} as const;

export type MovementPattern = keyof typeof MOVEMENT_PATTERNS;

// ============================================================================
// MAPEAMENTO PADRÃO DE MOVIMENTO → CATEGORIA
// Somente os 6 padrões de força mapeiam para forca_hipertrofia.
// ============================================================================

export const PATTERN_TO_CATEGORY: Record<string, ExerciseCategory> = {
  empurrar: "forca_hipertrofia",
  puxar: "forca_hipertrofia",
  dominancia_joelho: "forca_hipertrofia",
  cadeia_posterior: "forca_hipertrofia",
  lunge: "forca_hipertrofia",
  carregar: "forca_hipertrofia",
};

// ============================================================================
// AGRUPAMENTOS PARA IA MONTAR SESSÕES (somente força)
// Para Core, Mobilidade, LMF, Pliometria e Respiração, a IA filtra por `category`.
// ============================================================================

export const SESSION_PATTERN_GROUPS = {
  lower_knee: ["dominancia_joelho", "lunge"],
  lower_hip: ["cadeia_posterior"],
  upper_push: ["empurrar"],
  upper_pull: ["puxar"],
  carry: ["carregar"],
} as const;

export type SessionPatternGroup = keyof typeof SESSION_PATTERN_GROUPS;

// ============================================================================
// SUBCATEGORIAS POR CONTEXTO
// ============================================================================

/** Subcategorias para padrões de força que possuem subdivisão */
export const STRENGTH_SUBCATEGORIES: Record<string, Record<string, string>> = {
  empurrar: { horizontal: "Horizontal", vertical: "Vertical" },
  puxar: { horizontal: "Horizontal", vertical: "Vertical" },
  cadeia_posterior: { enfase_quadril: "Ênfase Quadril", enfase_joelho: "Ênfase Joelho" },
};

/** Subcategorias para Potência & Pliometria */
export const POTENCIA_SUBCATEGORIES = {
  potencia: "Potência",
  pliometria: "Pliometria",
  locomocao: "Locomoção",
} as const;

// Categorias elegíveis para condicionamento metabólico
export const CONDICIONAMENTO_ELIGIBLE_CATEGORIES: ExerciseCategory[] = [
  "core_ativacao",
  "potencia_pliometria",
  "forca_hipertrofia",
];

// ============================================================================
// NÍVEIS DE RISCO
// ============================================================================

export const RISK_LEVELS = {
  low: { label: "Baixo", color: "green" },
  medium: { label: "Médio", color: "yellow" },
  high: { label: "Alto", color: "red" },
} as const;

export type RiskLevel = keyof typeof RISK_LEVELS;

// ============================================================================
// LATERALIDADE
// ============================================================================

export const LATERALITY_OPTIONS = {
  bilateral: "Bilateral",
  unilateral: "Unilateral",
  alternada: "Alternada",
  contralateral: "Contralateral",
  ipsilateral: "Ipsilateral",
} as const;

// ============================================================================
// ESCALA FABRIK (1-5) — armazenada em boyle_score por compatibilidade
// ============================================================================

export const BOYLE_SCORE_SCALE = {
  1: { label: "Nível 1", category: "Iniciante", description: "Exercícios básicos de aprendizado" },
  2: { label: "Nível 2", category: "Iniciante/Intermediário", description: "Progressão inicial e fundamentos" },
  3: { label: "Nível 3", category: "Intermediário", description: "Padrões compostos com carga" },
  4: { label: "Nível 4", category: "Intermediário/Avançado", description: "Alta complexidade e carga" },
  5: { label: "Nível 5", category: "Avançado", description: "Performance e potência" },
} as const;

export type BoyleScore = keyof typeof BOYLE_SCORE_SCALE;

/** @deprecated Use BOYLE_SCORE_SCALE instead */
export const NUMERIC_LEVEL_SCALE = BOYLE_SCORE_SCALE;
export type NumericLevel = BoyleScore;

// ============================================================================
// DIMENSÕES DE CLASSIFICAÇÃO (scores 0-5)
// ============================================================================

export const EXERCISE_DIMENSIONS = {
  axial_load: { label: "Carga Axial", abbrev: "AX", description: "Carga compressiva na coluna vertebral" },
  lumbar_demand: { label: "Exigência Lombar", abbrev: "LOM", description: "Demanda sobre a região lombar" },
  technical_complexity: { label: "Complexidade Técnica", abbrev: "TEC", description: "Dificuldade de execução técnica" },
  metabolic_potential: { label: "Potencial Metabólico", abbrev: "MET", description: "Capacidade de gerar demanda metabólica" },
  knee_dominance: { label: "Dominância Joelho", abbrev: "JOE", description: "Envolvimento da cadeia anterior (joelho)" },
  hip_dominance: { label: "Dominância Quadril", abbrev: "QUA", description: "Envolvimento da cadeia posterior (quadril)" },
} as const;

export type ExerciseDimension = keyof typeof EXERCISE_DIMENSIONS;

// ============================================================================
// POSIÇÕES DE EXERCÍCIO
// ============================================================================

export const STABILITY_POSITION_OPTIONS = {
  decubito_dorsal: "Decúbito Dorsal (DD)",
  decubito_ventral: "Decúbito Ventral (DV)",
  decubito_lateral: "Decúbito Lateral (DL)",
  ponte: "Ponte (Bridge)",
  quadrupede: "Quadrúpede",
  prancha: "Prancha",
  ajoelhado: "Ajoelhado",
  semi_ajoelhado: "Semi-ajoelhado",
  sentado: "Sentado",
  em_pe_bilateral: "Em pé (Bilateral)",
  em_pe_assimetrica: "Em pé (Assimétrica)",
  em_pe_split: "Em pé (Split/Passada)",
  em_pe_unilateral: "Em pé (Unilateral)",
  suspenso: "Suspenso (Barra)",
} as const;

export type StabilityPosition = keyof typeof STABILITY_POSITION_OPTIONS;

// ============================================================================
// MODIFICADORES DE SUPERFÍCIE / APOIO
// ============================================================================

export const SURFACE_MODIFIER_OPTIONS = {
  nenhum: "Nenhum",
  pe_parede: "Pé de trás na parede",
  pe_elevado: "Pé da frente elevado",
  pes_elevados: "Pés elevados",
  deficit: "Déficit",
  slide: "Slide / Deslizante",
  suspenso_trx: "Suspenso (TRX/Anéis)",
} as const;

export type SurfaceModifier = keyof typeof SURFACE_MODIFIER_OPTIONS;

/** @deprecated Use STABILITY_POSITION_OPTIONS instead */
export const POSITION_OPTIONS = STABILITY_POSITION_OPTIONS;
export type ExercisePosition = StabilityPosition;

// ============================================================================
// PLANOS DE MOVIMENTO
// ============================================================================

export const MOVEMENT_PLANES = {
  sagittal: "Sagital",
  frontal: "Frontal",
  transverse: "Transverso",
} as const;

// ============================================================================
// TIPOS DE CONTRAÇÃO
// ============================================================================

export const CONTRACTION_TYPES = {
  "Concêntrica": "Concêntrica",
  "Excêntrica": "Excêntrica",
  "Isométrica": "Isométrica",
  "Pliométrica / Potência": "Pliométrica / Potência",
  "Mista": "Mista",
} as const;

// ============================================================================
// NÍVEIS DE DIFICULDADE / ALUNOS
// ============================================================================

export const LEVEL_OPTIONS = {
  "Iniciante": "Iniciante",
  "Iniciante/Intermediário": "Iniciante/Intermediário",
  "Intermediário": "Intermediário",
  "Intermediário/Avançado": "Intermediário/Avançado",
  "Avançado": "Avançado",
  "Todos os níveis": "Todos os níveis",
} as const;

export const STUDENT_LEVELS = {
  iniciante: {
    name: "Iniciante",
    monthsTraining: { min: 0, max: 6 },
    plyometricsAllowed: false,
    maxRiskLevel: "medium" as RiskLevel,
  },
  intermediario: {
    name: "Intermediário",
    monthsTraining: { min: 6, max: 24 },
    plyometricsAllowed: true,
    maxRiskLevel: "medium" as RiskLevel,
  },
  avancado: {
    name: "Avançado",
    monthsTraining: { min: 24, max: Infinity },
    plyometricsAllowed: true,
    maxRiskLevel: "high" as RiskLevel,
  },
} as const;

export type StudentLevel = keyof typeof STUDENT_LEVELS;

// ============================================================================
// CICLOS DE PERIODIZAÇÃO (S1-S4) - NOVA ESTRUTURA
// ============================================================================

/**
 * Progressão do Mesociclo:
 * - S1 (Adaptação): Menor volume E menor intensidade
 * - S2 (Desenvolvimento): Volume aumenta até ideal, leve aumento de intensidade
 * - S3 (Choque 1): Mantém volume, aumenta intensidade (cargas)
 * - S4 (Choque 2): Mantém volume, pico de intensidade (cargas máximas)
 * 
 * Para treinos metabólicos: diminuir intervalo OU aumentar carga
 */
export const PERIODIZATION_CYCLES = {
  s1: {
    name: "Adaptação",
    weekNumber: 1,
    volumeMultiplier: 0.7,
    intensityMultiplier: 0.7,
    pseRange: { min: 5, max: 6 },
    description: "Menor volume e menor intensidade para adaptação neuromuscular",
    strategies: ["Reduzir séries", "Cargas leves", "Intervalos maiores"],
    methods: ["tradicional", "circuito"],
    plyometrics: "none" as const,
  },
  s2: {
    name: "Desenvolvimento",
    weekNumber: 2,
    volumeMultiplier: 1.0,
    intensityMultiplier: 0.85,
    pseRange: { min: 6, max: 7 },
    description: "Volume ideal atingido, leve aumento de intensidade",
    strategies: ["Volume prescrito", "Aumento gradual de carga"],
    methods: ["tradicional", "superset"],
    plyometrics: "low" as const,
  },
  s3: {
    name: "Choque 1",
    weekNumber: 3,
    volumeMultiplier: 1.0,
    intensityMultiplier: 0.95,
    pseRange: { min: 7, max: 8 },
    description: "Aumento de intensidade via cargas",
    strategies: ["Aumentar cargas", "Manter volume", "Reduzir intervalo (metcon)"],
    methods: ["tradicional", "superset", "triset", "emom", "cluster"],
    plyometrics: "full" as const,
  },
  s4: {
    name: "Choque 2",
    weekNumber: 4,
    volumeMultiplier: 1.0,
    intensityMultiplier: 1.0,
    pseRange: { min: 8, max: 9 },
    description: "Pico de intensidade do mesociclo",
    strategies: ["Cargas máximas do ciclo", "Manter volume", "Menor intervalo (metcon)"],
    methods: ["tradicional", "superset", "triset", "emom", "amrap", "for_time", "cluster"],
    plyometrics: "full" as const,
  },
} as const;

export type PeriodizationCycle = keyof typeof PERIODIZATION_CYCLES;

// ============================================================================
// ESTRATÉGIAS DE PROGRESSÃO PARA TREINOS METABÓLICOS
// ============================================================================

export const METCON_PROGRESSION_STRATEGIES = {
  reduceRest: {
    name: "Reduzir Intervalo",
    description: "Diminuir tempo de descanso entre séries/estações",
    applicableCycles: ["s3", "s4"] as PeriodizationCycle[],
  },
  increaseLoad: {
    name: "Aumentar Carga",
    description: "Aumentar peso nos exercícios",
    applicableCycles: ["s2", "s3", "s4"] as PeriodizationCycle[],
  },
  increaseReps: {
    name: "Aumentar Repetições",
    description: "Adicionar repetições mantendo carga",
    applicableCycles: ["s2"] as PeriodizationCycle[],
  },
  increaseDensity: {
    name: "Aumentar Densidade",
    description: "Mais trabalho no mesmo tempo",
    applicableCycles: ["s3", "s4"] as PeriodizationCycle[],
  },
} as const;

// ============================================================================
// VALÊNCIAS DE TREINO (4 valências - sem resistência muscular)
// ============================================================================

export const TRAINING_VALENCES = {
  potencia: "Potência",
  forca: "Força",
  hipertrofia: "Hipertrofia",
  condicionamento: "Condicionamento Metabólico",
} as const;

export type TrainingValence = keyof typeof TRAINING_VALENCES;

// Combinações válidas de valências (máx 2 por sessão)
export const VALID_VALENCE_COMBINATIONS: TrainingValence[][] = [
  ["potencia"],
  ["forca"],
  ["hipertrofia"],
  ["condicionamento"],
  ["potencia", "forca"],
  ["potencia", "hipertrofia"],
  ["potencia", "condicionamento"],
  ["forca", "hipertrofia"],
  ["forca", "condicionamento"],
  ["hipertrofia", "condicionamento"],
];

// ============================================================================
// FORMATOS DE SESSÃO
// ============================================================================

export const SESSION_FORMATS = {
  tradicional: {
    name: "Tradicional",
    duration: 55,
    phases: {
      preparacao: { min: 8, max: 10 },
      ativacao_core: { min: 5, max: 8 },
      principal: { min: 25, max: 30 },
      cooldown: { min: 5, max: 8 },
    },
    maxValences: 2,
    includeLMF: true,
  },
  time_efficient: {
    name: "Time Efficient",
    duration: 30,
    phases: {
      preparacao: { min: 4, max: 5 },
      principal: { min: 20, max: 22 },
      mindfulness: { min: 2, max: 3 },
    },
    maxValences: 2,
    reducedVolume: true,
    includeLMF: true,
    lmfRegions: 1,
  },
} as const;

export type SessionFormat = keyof typeof SESSION_FORMATS;

// ============================================================================
// FASES DE AQUECIMENTO (6 ETAPAS)
// ============================================================================

export const WARMUP_PHASES = [
  { order: 1, name: "LMF", description: "Liberação Miofascial", duration: "2-3 min" },
  { order: 2, name: "Mobilidade Articular", description: "Tornozelo, quadril, coluna", duration: "2 min" },
  { order: 3, name: "Ativação Muscular", description: "Glúteos, escapular, core", duration: "2 min" },
  { order: 4, name: "Movimento Integrado", description: "Padrões básicos de movimento", duration: "2 min" },
  { order: 5, name: "Potencialização SNC", description: "Movimentos explosivos leves", duration: "1 min" },
  { order: 6, name: "Específico", description: "Preparação para exercício principal", duration: "1-2 min" },
] as const;

// ============================================================================
// FASES DE PLIOMETRIA (19 PROGRESSÕES)
// ============================================================================

export const PLYOMETRIC_PHASES = [
  // Bilateral Linear (1-5)
  { phase: 1, type: "bilateral_linear", name: "Salto no lugar", prerequisites: [] },
  { phase: 2, type: "bilateral_linear", name: "Pogo jump", prerequisites: [1] },
  { phase: 3, type: "bilateral_linear", name: "Box jump baixo", prerequisites: [2] },
  { phase: 4, type: "bilateral_linear", name: "Box jump médio", prerequisites: [3] },
  { phase: 5, type: "bilateral_linear", name: "Depth jump", prerequisites: [4] },
  
  // Unilateral Linear (6-11)
  { phase: 6, type: "unilateral_linear", name: "Single leg hop no lugar", prerequisites: [3] },
  { phase: 7, type: "unilateral_linear", name: "Single leg hop para frente", prerequisites: [6] },
  { phase: 8, type: "unilateral_linear", name: "Single leg bound", prerequisites: [7] },
  { phase: 9, type: "unilateral_linear", name: "Single leg box jump baixo", prerequisites: [8] },
  { phase: 10, type: "unilateral_linear", name: "Single leg box jump médio", prerequisites: [9] },
  { phase: 11, type: "unilateral_linear", name: "Single leg depth jump", prerequisites: [10] },
  
  // Unilateral Lateral (12-15)
  { phase: 12, type: "unilateral_lateral", name: "Lateral hop no lugar", prerequisites: [6] },
  { phase: 13, type: "unilateral_lateral", name: "Lateral bound", prerequisites: [12] },
  { phase: 14, type: "unilateral_lateral", name: "Skater jump", prerequisites: [13] },
  { phase: 15, type: "unilateral_lateral", name: "Lateral box jump", prerequisites: [14] },
  
  // Unilateral Lateral/Medial (16-19)
  { phase: 16, type: "unilateral_lateral_medial", name: "Hop lateral para medial", prerequisites: [12] },
  { phase: 17, type: "unilateral_lateral_medial", name: "Crossover hop", prerequisites: [16] },
  { phase: 18, type: "unilateral_lateral_medial", name: "Diagonal bound", prerequisites: [17] },
  { phase: 19, type: "unilateral_lateral_medial", name: "Reactive agility", prerequisites: [18] },
] as const;

// ============================================================================
// CORE TRIPLANAR - CATEGORIAS
// ============================================================================

export const CORE_TRIPLANAR = {
  anti_extensao: {
    name: "Anti-extensão",
    description: "Resiste à extensão lombar",
    examples: ["Prancha frontal", "Dead bug", "Rollout", "Body saw"],
  },
  anti_flexao_lateral: {
    name: "Anti-flexão Lateral",
    description: "Resiste à inclinação lateral",
    examples: ["Prancha lateral", "Farmer's carry unilateral", "Side plank row"],
  },
  anti_rotacao: {
    name: "Anti-rotação",
    description: "Resiste à rotação do tronco",
    examples: ["Pallof press", "Bird dog", "Renegade row", "Single arm press"],
  },
} as const;

export type CoreTriplanarType = keyof typeof CORE_TRIPLANAR;

// PATTERN_TO_CATEGORY is defined above (direct pattern → category mapping)

// ============================================================================
// PIRÂMIDE MOBILIDADE/ESTABILIDADE
// ============================================================================

export const MOBILITY_STABILITY_PYRAMID = [
  { joint: "Pé", requirement: "Estável" },
  { joint: "Tornozelo", requirement: "Móvel" },
  { joint: "Joelho", requirement: "Estável" },
  { joint: "Quadril", requirement: "Móvel" },
  { joint: "Lombar", requirement: "Estável" },
  { joint: "Torácica", requirement: "Móvel" },
  { joint: "Escapular", requirement: "Estável" },
  { joint: "Ombro", requirement: "Móvel" },
] as const;

// ============================================================================
// ESTAÇÕES DE TREINO (Small Groups)
// ============================================================================

export const TRAINING_STATIONS = {
  a: {
    name: "Estação A",
    focus: "Membros Inferiores",
    patterns: [...SESSION_PATTERN_GROUPS.lower_knee, ...SESSION_PATTERN_GROUPS.lower_hip],
    description: "Agachamento, lunge, hip hinge, ponte - foco em força, potência ou hipertrofia",
  },
  b: {
    name: "Estação B",
    focus: "Membros Superiores",
    patterns: [...SESSION_PATTERN_GROUPS.upper_push, ...SESSION_PATTERN_GROUPS.upper_pull],
    description: "Empurrar/puxar - complementar à estação A",
  },
  c: {
    name: "Estação C",
    focus: "Core/Carry/Breath",
    patterns: [...SESSION_PATTERN_GROUPS.carry],
    description: "Core triplanar (filtrado por category), carregamentos e respiração guiada",
    optional: true,
  },
} as const;

// ============================================================================
// MÉTODOS DE TREINO
// ============================================================================

export const TRAINING_METHODS = {
  tradicional: { name: "Tradicional", description: "Séries x repetições com descanso fixo" },
  superset: { name: "Superset", description: "2 exercícios alternados sem descanso" },
  triset: { name: "Triset", description: "3 exercícios alternados sem descanso" },
  circuito: { name: "Circuito", description: "Múltiplos exercícios em sequência" },
  emom: { name: "EMOM", description: "Every Minute On the Minute" },
  amrap: { name: "AMRAP", description: "As Many Rounds As Possible" },
  for_time: { name: "For Time", description: "Completar tarefas no menor tempo" },
  cluster: { name: "Cluster", description: "Mini-séries com micro-descansos" },
  complexo: { name: "Complexo", description: "Mesma barra, múltiplos movimentos" },
  rest_pause: { name: "Rest-Pause", description: "Pausas curtas para estender série" },
  drop_set: { name: "Drop Set", description: "Redução de carga sem descanso" },
} as const;

export type TrainingMethod = keyof typeof TRAINING_METHODS;

// ============================================================================
// HELPERS
// ============================================================================

export const getVolumeForCycle = (baseVolume: number, cycle: PeriodizationCycle): number => {
  return Math.round(baseVolume * PERIODIZATION_CYCLES[cycle].volumeMultiplier);
};

export const getIntensityForCycle = (baseIntensity: number, cycle: PeriodizationCycle): number => {
  return Math.round(baseIntensity * PERIODIZATION_CYCLES[cycle].intensityMultiplier);
};

export const isValidValenceCombination = (valences: TrainingValence[]): boolean => {
  if (valences.length === 0 || valences.length > 2) return false;
  
  return VALID_VALENCE_COMBINATIONS.some(
    (combo) =>
      combo.length === valences.length &&
      combo.every((v) => valences.includes(v))
  );
};

export const canUsePlyometrics = (level: StudentLevel, cycle: PeriodizationCycle): boolean => {
  const levelConfig = STUDENT_LEVELS[level];
  const plyoLevel = PERIODIZATION_CYCLES[cycle].plyometrics;
  
  return levelConfig.plyometricsAllowed && plyoLevel !== "none";
};

export type PlyometricsLevel = "none" | "low" | "full";

export const getMethodsForCycle = (cycle: PeriodizationCycle): TrainingMethod[] => {
  const cycleMethods = PERIODIZATION_CYCLES[cycle].methods;
  return [...cycleMethods] as TrainingMethod[];
};
