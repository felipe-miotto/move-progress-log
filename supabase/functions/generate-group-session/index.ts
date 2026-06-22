/**
 * Edge Function: Geração de Mesociclo com IA — Back to Basics v14.5
 * Fabrik Performance
 *
 * Estrutura v14.5:
 *   1. Abertura (Resp + LMF — 2 regiões, trilhos distintos)
 *   2. Mobilidade específica ao BP1
 *   3. Core biplanar (2 ex, 2 planos distintos, cobertura semanal)
 *   4. BP1 (valência primária)
 *   5. Respiração inter-bloco (nasal 3:6 ~30s)
 *   6. BP2 (valência secundária)
 *   7. [BP3 opcional]
 *   8. Finalizador (Carry — superset ou finalizador)
 *   9. Encerramento (protocolo por valência)
 *
 * Filtros de segurança:
 *   F1: Max 2 exercícios LOM>=4/sessão, max 1 hinge pesado
 *   F3: TEC<=2 em bloco metcon
 *   All-out: PSE 9-10 só se AX<=2 E LOM<=2
 *   Anti-Metcon: PSE<=8 em blocos não-metcon
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" };

// ============================================================================
// TIPOS
// ============================================================================

interface WorkoutSlotConfig {
  slot: "A" | "B" | "C";
  valences: string[];
}

interface MesocycleInput {
  groupLevel: "iniciante" | "intermediario" | "avancado";
  workouts: WorkoutSlotConfig[];
  excludeExercises?: string[];
  groupReadiness?: number;
  // Phase 4
  weekCount?: number; // 3-8, default 4
  audiencePreset?: "adulto" | "senior_70" | "adolescente";
  rotationMode?: "A" | "B"; // A=full rotation, B=selective
  retainExerciseIds?: string[]; // Mode B: exercises to keep
}

const VALID_GROUP_LEVELS = new Set(["iniciante", "intermediario", "avancado"]);
const VALID_SLOTS = new Set(["A", "B", "C"]);

function isValidMesocycleInput(input: unknown): input is MesocycleInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const payload = input as Record<string, unknown>;
  if (typeof payload.groupLevel !== "string" || !VALID_GROUP_LEVELS.has(payload.groupLevel)) return false;
  if (!Array.isArray(payload.workouts) || payload.workouts.length !== 3) return false;

  return payload.workouts.every((workout) => {
    if (!workout || typeof workout !== "object" || Array.isArray(workout)) return false;
    const item = workout as Record<string, unknown>;
    return typeof item.slot === "string"
      && VALID_SLOTS.has(item.slot)
      && Array.isArray(item.valences)
      && item.valences.length > 0;
  });
}

interface Exercise {
  id: string;
  name: string;
  movement_pattern: string | null;
  risk_level: string | null;
  level: string | null;
  category: string | null;
  subcategory: string | null;
  movement_plane: string | null;
  equipment_required: string[] | null;
  default_sets: string | null;
  default_reps: string | null;
  numeric_level: number | null;
  // v14.5 dimensions
  axial_load: number | null;
  lumbar_demand: number | null;
  technical_complexity: number | null;
  metabolic_potential: number | null;
  knee_dominance: number | null;
  hip_dominance: number | null;
}

interface BreathingProtocol {
  id: string;
  name: string;
  technique: string;
  rhythm: string | null;
  duration_seconds: number;
  instructions: string;
  category: string;
  when_to_use: string[] | null;
}

interface GeneratedExercise {
  id: string;
  exerciseLibraryId: string;
  name: string;
  movementPattern: string;
  subcategory?: string;
  sets: string;
  reps: string;
  interval: number;
  pse?: string;
  executionCues?: string;
  riskLevel: string;
  equipment?: string[];
}

interface ExerciseBlock {
  id: string;
  name: string;
  method: string;
  exercises: GeneratedExercise[];
  restBetweenSets: number;
  notes?: string;
}

interface SessionPhase {
  id: string;
  name: string;
  order: number;
  duration: number;
  blocks: ExerciseBlock[];
  notes?: string;
}

interface GeneratedWorkout {
  id: string;
  slot: "A" | "B" | "C";
  name: string;
  valences: string[];
  totalDuration: number;
  phases: SessionPhase[];
  coveredPatterns: string[];
  coreTriplanarCheck: {
    anti_extensao: boolean;
    anti_flexao_lateral: boolean;
    anti_rotacao: boolean;
  };
  mindfulnessScript?: string;
  motivationalPhrase?: string;
}

// ============================================================================
// CONSTANTES v14.5
// ============================================================================

const SESSION_PATTERN_GROUPS: Record<string, string[]> = {
  lower_knee: ["dominancia_joelho", "lunge"],
  lower_hip: ["cadeia_posterior"],
  upper_push: ["empurrar"],
  upper_pull: ["puxar"],
  carry: ["carregar"],
};

const VALENCE_CONFIG: Record<string, { sets: string; reps: string; interval: number; pse: string; restBetweenRounds?: number }> = {
  potencia: { sets: "3-4", reps: "3-5", interval: 120, pse: "7-8" },
  forca: { sets: "4-5", reps: "4-6", interval: 90, pse: "8-9" },
  hipertrofia: { sets: "3-4", reps: "8-12", interval: 60, pse: "7-8" },
  // G-08: interval 45s (was 30s — too low for metcon PSE 6-7), restBetweenRounds for EMOM/AMRAP
  condicionamento: { sets: "3", reps: "12-15", interval: 45, pse: "6-7", restBetweenRounds: 90 },
};

// v14.5: Durations
const SESSION_STRUCTURE = {
  totalDuration: 55,
  phases: {
    abertura: { duration: 3, name: "Abertura" },
    mobilidade: { duration: 4, name: "Mobilidade Específica" },
    core: { duration: 5, name: "Core Biplanar" },
    bp1: { duration: 10, name: "Bloco Principal 1" },
    interBloco1: { duration: 0.5, name: "Respiração Inter-bloco" },
    bp2: { duration: 10, name: "Bloco Principal 2" },
    interBloco2: { duration: 0.5, name: "Respiração Inter-bloco" },
    bp3: { duration: 7, name: "Bloco Complementar" },
    finalizador: { duration: 4, name: "Finalizador" },
    encerramento: { duration: 4, name: "Encerramento" },
  },
};

// v14.5: Core — 2 planos por slot, cobertura semanal dos 3 planos
const CORE_PLANE_DISTRIBUTION: Record<string, string[]> = {
  A: ["anti_extensao", "anti_rotacao"],
  B: ["anti_flexao_lateral", "anti_extensao"],
  C: ["anti_rotacao", "anti_flexao_lateral"],
};

// v14.5: Mapa de padrão BP1 → tipos de mobilidade relevantes
const BP1_MOBILITY_SUBCATEGORIES: Record<string, string[]> = {
  dominancia_joelho: ["quadril", "tornozelo", "joelho"],
  cadeia_posterior: ["quadril", "isquiotibiais", "coluna"],
  lunge: ["quadril", "tornozelo", "joelho"],
  empurrar: ["ombro", "toracica", "escapular"],
  puxar: ["ombro", "toracica", "escapular"],
  carregar: ["ombro", "quadril", "coluna"],
};

// v14.5: LMF — regiões por foco (lower vs upper dominant)
const LMF_REGIONS_LOWER = ["gluteos", "quadriceps", "isquiotibiais", "panturrilha", "adutores"];
const LMF_REGIONS_UPPER = ["ombro", "coluna", "pe"];

// v14.5: Valência → tipo de protocolo de encerramento
const CLOSING_PROTOCOL_MAP: Record<string, string[]> = {
  potencia: ["post_workout", "ativacao_parasimpatica"],
  forca: ["post_workout", "recuperacao"],
  hipertrofia: ["post_workout", "recuperacao"],
  condicionamento: ["post_workout", "cool_down"],
};

// Métodos por ciclo para condicionamento
const METCON_METHODS_BY_CYCLE: Record<string, string[]> = {
  s1: ["circuito"],
  s2: ["circuito"],
  s3: ["emom", "circuito"],
  s4: ["amrap", "for_time", "emom"],
};

// Periodização S1-S4 (cycles beyond S4 repeat: S5=S1, S6=S2, etc.)
const PERIODIZATION: Record<string, { volumeMultiplier: number; intensityMultiplier: number; pse: string; plyometrics: string }> = {
  s1: { volumeMultiplier: 0.7, intensityMultiplier: 0.7, pse: "5-6", plyometrics: "none" },
  s2: { volumeMultiplier: 1.0, intensityMultiplier: 0.85, pse: "6-7", plyometrics: "low" },
  s3: { volumeMultiplier: 1.0, intensityMultiplier: 0.95, pse: "7-8", plyometrics: "full" },
  s4: { volumeMultiplier: 1.0, intensityMultiplier: 1.0, pse: "8-9", plyometrics: "full" },
};

// Phase 4: Audience preset restrictions
const AUDIENCE_PRESETS: Record<string, {
  maxPse: number;
  maxAxialLoad: number;
  maxLumbarDemand: number;
  maxTechnicalComplexity: number;
  excludeCategories: string[];
  maxEffectiveSets: number;
  volumeMultiplierCap: number;
  restrictions: string[];
}> = {
  adulto: {
    maxPse: 10, maxAxialLoad: 5, maxLumbarDemand: 5, maxTechnicalComplexity: 5,
    excludeCategories: [], maxEffectiveSets: 20, volumeMultiplierCap: 1.1,
    restrictions: [],
  },
  senior_70: {
    maxPse: 7, maxAxialLoad: 2, maxLumbarDemand: 3, maxTechnicalComplexity: 2,
    excludeCategories: ["potencia_pliometria"],
    maxEffectiveSets: 14, volumeMultiplierCap: 0.8,
    restrictions: [
      "PSE máximo 7 (sem all-out)",
      "Proibido carga axial alta (AX>2)",
      "Sem pliometria",
      "Complexidade técnica máxima 2",
      "Volume reduzido (max 14 sets efetivos)",
      "Foco em estabilidade e mobilidade",
      "Priorizar exercícios em superfície estável",
    ],
  },
  adolescente: {
    maxPse: 8, maxAxialLoad: 3, maxLumbarDemand: 3, maxTechnicalComplexity: 3,
    excludeCategories: [],
    maxEffectiveSets: 16, volumeMultiplierCap: 0.9,
    restrictions: [
      "PSE máximo 8",
      "Carga axial moderada (AX<=3)",
      "Foco na aprendizagem motora",
      "Priorizar padrões fundamentais antes de cargas pesadas",
    ],
  },
};

/** Phase 4: F4 — Teachable progression: prefer exercises with regressions available
 * G-06: Uses filteredPool (not allExercises) to find regressions within the same filtered universe
 */
function applyF4TeachableProgression(pool: Exercise[], filteredPool: Exercise[]): Exercise[] {
  if (pool.length <= 5) return pool;
  
  const withRegressions = pool.filter((ex) => {
    if (!ex.movement_pattern || ex.numeric_level == null) return true;
    // G-06: Search regressions only within the already-filtered pool
    const regressions = filteredPool.filter(
      (alt) => alt.movement_pattern === ex.movement_pattern &&
        alt.id !== ex.id &&
        alt.numeric_level != null &&
        alt.numeric_level < ex.numeric_level!
    );
    return regressions.length >= 1;
  });

  return withRegressions.length >= Math.min(5, pool.length * 0.5) ? withRegressions : pool;
}

/** Phase 4: Apply audience preset filters to exercise pool */
function applyAudienceFilters(exercises: Exercise[], preset: string): Exercise[] {
  const config = AUDIENCE_PRESETS[preset];
  if (!config || preset === "adulto") return exercises;

  return exercises.filter((ex) => {
    if (config.excludeCategories.includes(ex.category || "")) return false;
    if ((ex.axial_load || 0) > config.maxAxialLoad) return false;
    if ((ex.lumbar_demand || 0) > config.maxLumbarDemand) return false;
    if ((ex.technical_complexity || 0) > config.maxTechnicalComplexity) return false;
    return true;
  });
}

/** Phase 4: Generate periodization for configurable week count */
function buildProgressionForWeeks(weekCount: number, volumeMultiplier: number, hasMetcon: boolean): Record<string, {
  volumeMultiplier: number;
  intensityMultiplier: number;
  pse: string;
  metconMethod?: string;
}> {
  const progression: Record<string, { volumeMultiplier: number; intensityMultiplier: number; pse: string; metconMethod?: string }> = {};
  const cycleKeys = ["s1", "s2", "s3", "s4"];

  for (let i = 1; i <= weekCount; i++) {
    const cycleIndex = (i - 1) % 4;
    const cycleKey = cycleKeys[cycleIndex];
    const config = PERIODIZATION[cycleKey];
    const metconMethods = METCON_METHODS_BY_CYCLE[cycleKey];

    progression[`s${i}`] = {
      volumeMultiplier: config.volumeMultiplier * volumeMultiplier,
      intensityMultiplier: config.intensityMultiplier,
      pse: config.pse,
      ...(hasMetcon && metconMethods ? { metconMethod: metconMethods[0] } : {}),
    };
  }
  return progression;
}

// ============================================================================
// HELPERS
// ============================================================================

function generateUUID(): string {
  return crypto.randomUUID();
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/** G-07: Optional seed for reproducible selection (Mulberry32 PRNG).
 * If no seed, falls back to Math.random() (current behavior). */
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function weightedSelect(exercises: Exercise[], count: number, seed?: number): Exercise[] {
  if (exercises.length <= count) return exercises;
  const rng = seed != null ? mulberry32(seed) : Math.random;
  const scored = exercises.map((ex) => {
    let score = typeof rng === 'function' ? (seed != null ? (rng as () => number)() : Math.random()) : Math.random();
    if (ex.equipment_required && ex.equipment_required.length > 0) score += 0.1;
    if (ex.movement_plane && ex.movement_plane !== "sagital") score += 0.15;
    return { ex, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, count).map((s) => s.ex);
}

function calcVolumeMultiplier(groupReadiness?: number): number {
  if (!groupReadiness || groupReadiness <= 0) return 1.0;
  if (groupReadiness >= 85) return 1.1;
  if (groupReadiness >= 65) return 1.0;
  if (groupReadiness >= 45) return 0.8;
  if (groupReadiness >= 25) return 0.6;
  return 0.5;
}

function applyVolumeMultiplier(sets: string, multiplier: number): string {
  if (multiplier === 1.0) return sets;
  const parts = sets.split("-").map(Number);
  if (parts.some(isNaN)) return sets;
  const adjusted = parts.map((v) => Math.max(1, Math.round(v * multiplier)));
  return adjusted.length > 1 ? `${adjusted[0]}-${adjusted[1]}` : `${adjusted[0]}`;
}

function filterByLevel(exercises: Exercise[], groupLevel: string): Exercise[] {
  const levelOrder: Record<string, number> = { iniciante: 1, intermediario: 2, avancado: 3 };
  const groupLevelValue = levelOrder[groupLevel] || 2;
  return exercises.filter((ex) => {
    // Boyle score (1-5): hierarchical filtering
    if (ex.numeric_level != null) {
      const maxBoyle = groupLevel === "iniciante" ? 2 
                     : groupLevel === "intermediario" ? 3 
                     : 5;
      return ex.numeric_level <= maxBoyle;
    }
    // Fallback: text level field
    if (!ex.level) return true;
    const levelMap: Record<string, number> = {
      Iniciante: 1, "Iniciante/Intermediário": 1.5, Intermediário: 2,
      "Intermediário/Avançado": 2.5, Avançado: 3, "Todos os níveis": 0,
    };
    const exLevelValue = levelMap[ex.level] || 2;
    return exLevelValue === 0 || exLevelValue <= groupLevelValue;
  });
}

function filterByRisk(exercises: Exercise[], groupLevel: string): Exercise[] {
  return exercises.filter((ex) => {
    if (ex.risk_level === "high" || ex.risk_level === "Alto") return groupLevel === "avancado";
    if (ex.risk_level === "medium" || ex.risk_level === "Médio") return groupLevel !== "iniciante";
    return true;
  });
}

function filterByAvailableEquipment(exercises: Exercise[], availableEquipment: Set<string>): Exercise[] {
  if (availableEquipment.size === 0) return exercises;
  return exercises.filter((ex) => {
    if (!ex.equipment_required || ex.equipment_required.length === 0) return true;
    return ex.equipment_required.every((eq) => availableEquipment.has(eq.toLowerCase()));
  });
}

function selectExercisesByPattern(
  exercises: Exercise[], patterns: string[], count: number, excludeIds: Set<string>
): Exercise[] {
  const matching = exercises.filter(
    (ex) => ex.movement_pattern && patterns.includes(ex.movement_pattern) && !excludeIds.has(ex.id)
  );
  return weightedSelect(matching, count);
}

function selectExercisesByCategory(
  exercises: Exercise[], category: string, count: number, excludeIds: Set<string>
): Exercise[] {
  const matching = exercises.filter(
    (ex) => ex.category === category && !excludeIds.has(ex.id)
  );
  return weightedSelect(matching, count);
}

function mapToGeneratedExercise(
  exercise: Exercise, overrides: Partial<GeneratedExercise> = {}
): GeneratedExercise {
  return {
    id: generateUUID(),
    exerciseLibraryId: exercise.id,
    name: exercise.name,
    movementPattern: exercise.movement_pattern || exercise.category || "unknown",
    subcategory: exercise.subcategory || undefined,
    sets: exercise.default_sets || "3",
    reps: exercise.default_reps || "10",
    interval: 60,
    riskLevel: exercise.risk_level || "low",
    equipment: exercise.equipment_required || [],
    ...overrides,
  };
}

// ============================================================================
// FILTROS DE SEGURANÇA v14.5
// ============================================================================

/** F1: Limita exercícios com alta demanda lombar por sessão */
function applyLumbarFilter(pool: Exercise[], sessionExercises: Exercise[]): Exercise[] {
  const highLomCount = sessionExercises.filter((ex) => (ex.lumbar_demand || 0) >= 4).length;
  if (highLomCount >= 2) {
    return pool.filter((ex) => (ex.lumbar_demand || 0) < 4);
  }
  return pool;
}

/** F3: Em blocos metcon, complexidade técnica deve ser baixa */
function filterForMetcon(exercises: Exercise[]): Exercise[] {
  return exercises.filter((ex) => (ex.technical_complexity || 0) <= 2);
}

/** All-out: PSE 9-10 só permitido se AX<=2 E LOM<=2 */
function canAllOut(exercise: Exercise): boolean {
  return (exercise.axial_load || 0) <= 2 && (exercise.lumbar_demand || 0) <= 2;
}

/** Anti-Metcon: Em blocos não-metcon, PSE máximo é 8 */
function clampPseForNonMetcon(pse: string, isMetcon: boolean): string {
  if (isMetcon) return pse;
  const parts = pse.split("-").map(Number);
  if (parts.some(isNaN)) return pse;
  const clamped = parts.map((v) => Math.min(v, 8));
  return clamped.length > 1 ? `${clamped[0]}-${clamped[1]}` : `${clamped[0]}`;
}

// ============================================================================
// FASES DE GERAÇÃO v14.5
// ============================================================================

/**
 * Fase 1: Abertura — Respiração nasal + LMF (2 regiões, trilhos distintos)
 * v14.5 G5, G11
 */
function buildOpeningPhase(
  exercises: Exercise[],
  excludeIds: Set<string>,
  valences: string[],
  breathingProtocols: BreathingProtocol[]
): SessionPhase {
  // Determine LMF focus based on primary valence
  const primaryValence = valences[0];
  const isLowerDominant = ["forca", "potencia"].includes(primaryValence);

  // Select 2 LMF regions from distinct anatomical tracks
  const primaryRegions = isLowerDominant ? LMF_REGIONS_LOWER : LMF_REGIONS_UPPER;
  const secondaryRegions = isLowerDominant ? LMF_REGIONS_UPPER : LMF_REGIONS_LOWER;

  const lmfPool = exercises.filter(
    (ex) => ex.category === "lmf" && !excludeIds.has(ex.id)
  );

  // Pick 1 from primary track
  const primaryCandidates = lmfPool.filter(
    (ex) => ex.subcategory && primaryRegions.includes(ex.subcategory)
  );
  const primary = weightedSelect(primaryCandidates, 1);
  primary.forEach((ex) => excludeIds.add(ex.id));

  // Pick 1 from secondary track (distinct anatomical track)
  const secondaryCandidates = lmfPool.filter(
    (ex) => ex.subcategory && secondaryRegions.includes(ex.subcategory) && !excludeIds.has(ex.id)
  );
  const secondary = weightedSelect(secondaryCandidates, 1);
  secondary.forEach((ex) => excludeIds.add(ex.id));

  const lmfExercises = [...primary, ...secondary];

  // Select an opening breathing protocol
  const preWorkout = breathingProtocols.filter(
    (p) => p.when_to_use && (p.when_to_use.includes("pre_workout") || p.when_to_use.includes("abertura"))
  );
  const breathPool = preWorkout.length > 0 ? preWorkout : breathingProtocols;
  const breathSelected = breathPool.length > 0 ? breathPool[Math.floor(Math.random() * breathPool.length)] : null;

  const breathNote = breathSelected
    ? `Respiração nasal: ${breathSelected.name} — ${breathSelected.rhythm || "3:6 (inspira:expira)"}. ~30s.`
    : "Respiração nasal cadenciada 3:6 (inspira 3s, expira 6s). ~30s.";

  const blocks: ExerciseBlock[] = [];

  // Breathing block
  blocks.push({
    id: generateUUID(),
    name: "Respiração de Abertura",
    method: "respiracao",
    exercises: [],
    restBetweenSets: 0,
    notes: breathNote,
  });

  // LMF block
  if (lmfExercises.length > 0) {
    blocks.push({
      id: generateUUID(),
      name: "Liberação Miofascial",
      method: "autoliberacao",
      exercises: lmfExercises.map((ex) =>
        mapToGeneratedExercise(ex, { sets: "1", reps: "30-60s", interval: 0 })
      ),
      restBetweenSets: 0,
      notes: "2 regiões — trilhos anatômicos distintos. Foam roller, bola ou stick.",
    });
  }

  return {
    id: generateUUID(),
    name: SESSION_STRUCTURE.phases.abertura.name,
    order: 1,
    duration: SESSION_STRUCTURE.phases.abertura.duration,
    blocks,
  };
}

/**
 * Fase 2: Mobilidade específica ao BP1
 * v14.5 G6 — ≥1 exercício simulando o padrão do BP1
 */
function buildMobilityPhase(
  exercises: Exercise[],
  excludeIds: Set<string>,
  bp1Pattern: string | null
): SessionPhase {
  const mobilityPool = exercises.filter(
    (ex) => ex.category === "mobilidade" && !excludeIds.has(ex.id)
  );

  const selected: Exercise[] = [];

  // Try to find mobility specific to BP1 pattern
  if (bp1Pattern) {
    const relevantSubcats = BP1_MOBILITY_SUBCATEGORIES[bp1Pattern] || [];
    const specificMobility = mobilityPool.filter((ex) => {
      if (!ex.subcategory) return false;
      return relevantSubcats.some((sub) =>
        ex.subcategory!.toLowerCase().includes(sub) || ex.name.toLowerCase().includes(sub)
      );
    });

    if (specificMobility.length > 0) {
      const picked = weightedSelect(specificMobility, 2);
      selected.push(...picked);
    }
  }

  // Fill remaining spots with general mobility (target: 3 total)
  const remaining = 3 - selected.length;
  if (remaining > 0) {
    const alreadySelected = new Set(selected.map((ex) => ex.id));
    const generalPool = mobilityPool.filter((ex) => !alreadySelected.has(ex.id) && !excludeIds.has(ex.id));
    const general = weightedSelect(generalPool, remaining);
    selected.push(...general);
  }

  selected.forEach((ex) => excludeIds.add(ex.id));

  return {
    id: generateUUID(),
    name: SESSION_STRUCTURE.phases.mobilidade.name,
    order: 2,
    duration: SESSION_STRUCTURE.phases.mobilidade.duration,
    blocks: [{
      id: generateUUID(),
      name: "Mobilidade Específica ao BP1",
      method: "circuito",
      exercises: selected.map((ex) =>
        mapToGeneratedExercise(ex, { sets: "1", reps: "8-10", interval: 15 })
      ),
      restBetweenSets: 15,
      notes: bp1Pattern
        ? `Foco na mobilidade para o padrão de abertura: ${bp1Pattern}`
        : "Mobilidade articular geral",
    }],
  };
}

/**
 * Fase 3: Core biplanar
 * v14.5 G7 — 2 exercícios, 2 planos distintos por sessão, cobertura semanal
 */
function buildCorePhase(
  exercises: Exercise[],
  excludeIds: Set<string>,
  slot: "A" | "B" | "C"
): SessionPhase {
  const targetPlanes = CORE_PLANE_DISTRIBUTION[slot];

  const corePool = exercises.filter(
    (ex) => ex.category === "core_ativacao" &&
      ex.subcategory &&
      ["anti_extensao", "anti_flexao_lateral", "anti_rotacao"].includes(ex.subcategory) &&
      !excludeIds.has(ex.id)
  );

  const coreExercises: Exercise[] = [];

  for (const plane of targetPlanes) {
    const candidates = corePool.filter(
      (ex) => ex.subcategory === plane && !excludeIds.has(ex.id)
    );
    if (candidates.length > 0) {
      const picked = candidates[Math.floor(Math.random() * candidates.length)];
      coreExercises.push(picked);
      excludeIds.add(picked.id);
    } else {
      const fallback = corePool.filter((ex) => !excludeIds.has(ex.id));
      if (fallback.length > 0) {
        const picked = fallback[Math.floor(Math.random() * fallback.length)];
        coreExercises.push(picked);
        excludeIds.add(picked.id);
      }
    }
  }

  const blocks: ExerciseBlock[] = [];
  if (coreExercises.length > 0) {
    blocks.push({
      id: generateUUID(),
      name: `Core Biplanar (${targetPlanes.join(" + ")})`,
      method: "superset",
      // G-09: Explicitly set subcategory from target plane so checkCoreTriplanar works correctly
      exercises: coreExercises.map((ex, i) =>
        mapToGeneratedExercise(ex, {
          sets: "2",
          reps: "10-12",
          interval: 30,
          ...(targetPlanes[i] ? { subcategory: targetPlanes[i] } : {}),
        })
      ),
      restBetweenSets: 30,
      notes: `2 planos distintos: ${targetPlanes.join(", ")}. Cobertura triplanar na semana.`,
    });
  }

  return {
    id: generateUUID(),
    name: SESSION_STRUCTURE.phases.core.name,
    order: 3,
    duration: SESSION_STRUCTURE.phases.core.duration,
    blocks,
  };
}

/**
 * Fase 4-6: Blocos Principais (BP1 + BP2 + BP3 opcional)
 * v14.5 G5 — cada BP tem 2 exercícios em superset
 * Aplica filtros F1 (lombar), F3 (metcon), All-out, Anti-Metcon
 */
function buildMainBlocks(
  exercises: Exercise[],
  valences: string[],
  groupLevel: string,
  excludeIds: Set<string>,
  volumeMultiplier: number,
  sessionSelectedExercises: Exercise[]
): { phases: SessionPhase[]; coveredPatterns: string[]; bp1Pattern: string | null } {
  const phases: SessionPhase[] = [];
  const coveredPatterns: string[] = [];
  let orderIndex = 4;

  const primaryValence = valences[0] as keyof typeof VALENCE_CONFIG;
  const secondaryValence = valences.length > 1 ? valences[1] as keyof typeof VALENCE_CONFIG : primaryValence;
  const isMetcon = valences.includes("condicionamento");

  // Determine BP composition:
  // BP1: primary valence — 1 lower + 1 upper (superset)
  // BP2: secondary valence — 1 lower (opposite) + 1 upper (opposite)
  // BP3 (optional): complementary / potência / carry-related

  // --- BP1: Primary valence ---
  const config1 = VALENCE_CONFIG[primaryValence] || VALENCE_CONFIG.forca;
  const adjustedSets1 = applyVolumeMultiplier(config1.sets, volumeMultiplier);
  const pse1 = clampPseForNonMetcon(config1.pse, isMetcon);

  let pool1 = [...exercises];
  pool1 = applyLumbarFilter(pool1, sessionSelectedExercises);
  if (isMetcon) pool1 = filterForMetcon(pool1);

  // BP1 lower (knee-dominant)
  const bp1Lower = selectExercisesByPattern(pool1, SESSION_PATTERN_GROUPS.lower_knee, 1, excludeIds);
  bp1Lower.forEach((ex) => { excludeIds.add(ex.id); sessionSelectedExercises.push(ex); if (ex.movement_pattern) coveredPatterns.push(ex.movement_pattern); });

  // BP1 upper (push)
  const bp1Pool2 = applyLumbarFilter(pool1, sessionSelectedExercises);
  const bp1Upper = selectExercisesByPattern(bp1Pool2, SESSION_PATTERN_GROUPS.upper_push, 1, excludeIds);
  bp1Upper.forEach((ex) => { excludeIds.add(ex.id); sessionSelectedExercises.push(ex); if (ex.movement_pattern) coveredPatterns.push(ex.movement_pattern); });

  const bp1Exercises = [...bp1Lower, ...bp1Upper];
  const bp1Pattern = bp1Lower.length > 0 ? bp1Lower[0].movement_pattern : null;

  if (bp1Exercises.length > 0) {
    // Plyometrics opener for potência sessions
    if (valences.includes("potencia") && groupLevel !== "iniciante") {
      const maxPlyoLevel = groupLevel === "avancado" ? 5 : 3;
      const plyoPool = exercises.filter(
        (ex) => ex.category === "potencia_pliometria" && !excludeIds.has(ex.id) &&
          (ex.numeric_level == null || ex.numeric_level <= maxPlyoLevel) &&
          (ex.technical_complexity || 0) <= 3
      );
      const plyoSelected = weightedSelect(plyoPool, 1);
      plyoSelected.forEach((ex) => { excludeIds.add(ex.id); sessionSelectedExercises.push(ex); });

      if (plyoSelected.length > 0) {
        bp1Exercises.unshift(plyoSelected[0]); // Potência abre o BP1
      }
    }

    phases.push({
      id: generateUUID(),
      name: SESSION_STRUCTURE.phases.bp1.name,
      order: orderIndex++,
      duration: SESSION_STRUCTURE.phases.bp1.duration,
      blocks: [{
        id: generateUUID(),
        name: `BP1 — ${primaryValence.charAt(0).toUpperCase() + primaryValence.slice(1)}`,
        method: bp1Exercises.length > 1 ? "superset" : "tradicional",
        exercises: bp1Exercises.map((ex) =>
          mapToGeneratedExercise(ex, { sets: adjustedSets1, reps: config1.reps, interval: config1.interval, pse: pse1 })
        ),
        restBetweenSets: config1.interval,
      }],
    });
  }

  // --- Inter-block breathing ---
  phases.push({
    id: generateUUID(),
    name: "Respiração Inter-bloco",
    order: orderIndex++,
    duration: 0.5,
    blocks: [{
      id: generateUUID(),
      name: "Pausa Respiratória",
      method: "respiracao",
      exercises: [],
      restBetweenSets: 0,
      notes: "Respiração nasal cadenciada 3:6 (inspira 3s, expira 6s). ~30 segundos. Reduzir FC antes do próximo bloco.",
    }],
  });

  // --- BP2: Secondary valence ---
  const config2 = VALENCE_CONFIG[secondaryValence] || VALENCE_CONFIG.forca;
  const adjustedSets2 = applyVolumeMultiplier(config2.sets, volumeMultiplier);
  const pse2 = clampPseForNonMetcon(config2.pse, isMetcon);

  let pool2 = [...exercises];
  pool2 = applyLumbarFilter(pool2, sessionSelectedExercises);
  if (isMetcon) pool2 = filterForMetcon(pool2);

  // BP2 lower (hip-dominant — opposite of BP1)
  const bp2Lower = selectExercisesByPattern(pool2, SESSION_PATTERN_GROUPS.lower_hip, 1, excludeIds);
  bp2Lower.forEach((ex) => { excludeIds.add(ex.id); sessionSelectedExercises.push(ex); if (ex.movement_pattern) coveredPatterns.push(ex.movement_pattern); });

  // BP2 upper (pull — opposite of BP1)
  const bp2Pool2 = applyLumbarFilter(pool2, sessionSelectedExercises);
  const bp2Upper = selectExercisesByPattern(bp2Pool2, SESSION_PATTERN_GROUPS.upper_pull, 1, excludeIds);
  bp2Upper.forEach((ex) => { excludeIds.add(ex.id); sessionSelectedExercises.push(ex); if (ex.movement_pattern) coveredPatterns.push(ex.movement_pattern); });

  const bp2Exercises = [...bp2Lower, ...bp2Upper];
  if (bp2Exercises.length > 0) {
    phases.push({
      id: generateUUID(),
      name: SESSION_STRUCTURE.phases.bp2.name,
      order: orderIndex++,
      duration: SESSION_STRUCTURE.phases.bp2.duration,
      blocks: [{
        id: generateUUID(),
        name: `BP2 — ${secondaryValence.charAt(0).toUpperCase() + secondaryValence.slice(1)}`,
        method: bp2Exercises.length > 1 ? "superset" : "tradicional",
        exercises: bp2Exercises.map((ex) =>
          mapToGeneratedExercise(ex, { sets: adjustedSets2, reps: config2.reps, interval: config2.interval, pse: pse2 })
        ),
        restBetweenSets: config2.interval,
      }],
    });
  }

  // --- BP3 (optional): Extra block for variety or metcon ---
  if (valences.length >= 2 || isMetcon) {
    // Inter-block breathing before BP3
    phases.push({
      id: generateUUID(),
      name: "Respiração Inter-bloco",
      order: orderIndex++,
      duration: 0.5,
      blocks: [{
        id: generateUUID(),
        name: "Pausa Respiratória",
        method: "respiracao",
        exercises: [],
        restBetweenSets: 0,
        notes: "Respiração nasal cadenciada 3:6. ~30 segundos.",
      }],
    });

    let bp3Pool = [...exercises];
    bp3Pool = applyLumbarFilter(bp3Pool, sessionSelectedExercises);
    if (isMetcon) bp3Pool = filterForMetcon(bp3Pool);

    // BP3: Lunge + supplementary pattern
    const bp3Lower = selectExercisesByPattern(bp3Pool, ["lunge"], 1, excludeIds);
    bp3Lower.forEach((ex) => { excludeIds.add(ex.id); sessionSelectedExercises.push(ex); if (ex.movement_pattern) coveredPatterns.push(ex.movement_pattern); });

    // Add a supplementary upper or carry
    const bp3Supplementary = selectExercisesByPattern(
      applyLumbarFilter(bp3Pool, sessionSelectedExercises),
      [...SESSION_PATTERN_GROUPS.upper_push, ...SESSION_PATTERN_GROUPS.upper_pull],
      1,
      excludeIds
    );
    bp3Supplementary.forEach((ex) => { excludeIds.add(ex.id); sessionSelectedExercises.push(ex); if (ex.movement_pattern) coveredPatterns.push(ex.movement_pattern); });

    const bp3Exercises = [...bp3Lower, ...bp3Supplementary];
    if (bp3Exercises.length > 0) {
      const bp3Config = isMetcon ? VALENCE_CONFIG.condicionamento : config2;
      phases.push({
        id: generateUUID(),
        name: SESSION_STRUCTURE.phases.bp3.name,
        order: orderIndex++,
        duration: SESSION_STRUCTURE.phases.bp3.duration,
        blocks: [{
          id: generateUUID(),
          name: isMetcon ? "BP3 — MetCon" : "BP3 — Complementar",
          method: isMetcon ? "circuito" : (bp3Exercises.length > 1 ? "superset" : "tradicional"),
          exercises: bp3Exercises.map((ex) =>
            mapToGeneratedExercise(ex, {
              sets: applyVolumeMultiplier(bp3Config.sets, volumeMultiplier),
              reps: bp3Config.reps,
              interval: bp3Config.interval,
              pse: clampPseForNonMetcon(bp3Config.pse, isMetcon),
            })
          ),
          restBetweenSets: bp3Config.interval,
        }],
      });
    }
  }

  return { phases, coveredPatterns, bp1Pattern };
}

/**
 * Fase 8: Finalizador — Carry
 * v14.5 G8 — Posição A (superset) ou B (finalizador), nunca isolado, mín 2/semana
 */
/** G-04: Returns null if no carry exercises available (caller should skip phase) */
function buildFinalizerPhase(
  exercises: Exercise[],
  excludeIds: Set<string>,
  volumeMultiplier: number,
  valences: string[],
  sessionSelectedExercises: Exercise[],
  warnings: string[]
): SessionPhase | null {
  let carryPool = exercises.filter(
    (ex) => ex.movement_pattern === "carregar" && !excludeIds.has(ex.id)
  );
  carryPool = applyLumbarFilter(carryPool, sessionSelectedExercises);

  const selected = weightedSelect(carryPool, 1);
  
  // G-04: If no carry exercises after filters, skip phase entirely
  if (selected.length === 0) {
    warnings.push('Fase Finalizador omitida: nenhum exercício de carry disponível após filtros. Considere adicionar exercícios de carry à biblioteca.');
    return null;
  }
  
  selected.forEach((ex) => { excludeIds.add(ex.id); sessionSelectedExercises.push(ex); });

  const config = VALENCE_CONFIG[valences[0] as keyof typeof VALENCE_CONFIG] || VALENCE_CONFIG.forca;

  return {
    id: generateUUID(),
    name: SESSION_STRUCTURE.phases.finalizador.name,
    order: 9,
    duration: SESSION_STRUCTURE.phases.finalizador.duration,
    blocks: [{
      id: generateUUID(),
      name: "Finalizador — Carry",
      method: "tradicional",
      exercises: selected.map((ex) =>
        mapToGeneratedExercise(ex, {
          sets: applyVolumeMultiplier("3", volumeMultiplier),
          reps: "20-30m",
          interval: 60,
          pse: clampPseForNonMetcon(config.pse, valences.includes("condicionamento")),
        })
      ),
      restBetweenSets: 60,
      notes: "Carry como finalizador. Postura ereta, core ativado, respiração controlada.",
    }],
  };
}

/**
 * Fase 9: Encerramento por valência
 * v14.5 G10 — protocolo específico alinhado à valência final
 */
function buildClosingPhase(
  valences: string[],
  breathingProtocols: BreathingProtocol[]
): SessionPhase {
  const lastValence = valences[valences.length - 1];
  const targetUses = CLOSING_PROTOCOL_MAP[lastValence] || ["post_workout"];

  // Try to find protocol matching the valence's closing type
  const candidates = breathingProtocols.filter(
    (p) => p.when_to_use && p.when_to_use.some((u) => targetUses.includes(u))
  );
  const pool = candidates.length > 0 ? candidates : breathingProtocols;
  const selected = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : null;

  const notes = selected
    ? `${selected.name}: ${selected.instructions}${selected.rhythm ? ` Ritmo: ${selected.rhythm}` : ""}. ${Math.round(selected.duration_seconds / 60)} min. Protocolo alinhado à valência: ${lastValence}.`
    : "Box Breathing: 4s inspira, 4s segura, 4s expira, 4s segura. 5 ciclos. Foco na recuperação parasimpática.";

  return {
    id: generateUUID(),
    name: SESSION_STRUCTURE.phases.encerramento.name,
    order: 10,
    duration: SESSION_STRUCTURE.phases.encerramento.duration,
    blocks: [{
      id: generateUUID(),
      name: `Encerramento — ${lastValence}`,
      method: "respiracao",
      exercises: [],
      restBetweenSets: 0,
      notes,
    }],
  };
}

// ============================================================================
// VERIFICAÇÕES
// ============================================================================

function checkCoreTriplanar(phases: SessionPhase[]) {
  const coreExercises = phases
    .flatMap((p) => p.blocks)
    .filter((b) => b.name.startsWith("Core"))
    .flatMap((b) => b.exercises);

  const subcategories = new Set(coreExercises.map((ex) => ex.subcategory).filter(Boolean));
  return {
    anti_extensao: subcategories.has("anti_extensao"),
    anti_flexao_lateral: subcategories.has("anti_flexao_lateral"),
    anti_rotacao: subcategories.has("anti_rotacao"),
  };
}

// G-10: Nomes em pt-BR para consistência com o restante do sistema
function generateWorkoutName(slot: string, valences: string[]): string {
  const slotNames: Record<string, string> = { A: "Potência", B: "Força", C: "Fluxo" };
  const valenceNames: Record<string, string> = {
    potencia: "Explosivo", forca: "Força", hipertrofia: "Hipertrofia", condicionamento: "MetCon",
  };
  const base = slotNames[slot] || slot;
  const suffix = valences.map((v) => valenceNames[v] || v).join(" + ");
  return `${base} ${suffix}`;
}

function calcPatternsBalance(workouts: GeneratedWorkout[]): Record<string, number> {
  const balance: Record<string, number> = {};
  for (const w of workouts) {
    for (const p of w.coveredPatterns) {
      balance[p] = (balance[p] || 0) + 1;
    }
  }
  return balance;
}

/** v14.5 G4: Count effective sets per session */
function countEffectiveSets(workout: GeneratedWorkout): number {
  let total = 0;
  for (const phase of workout.phases) {
    for (const block of phase.blocks) {
      if (block.method === "respiracao" || block.method === "autoliberacao") continue;
      for (const ex of block.exercises) {
        const parts = ex.sets.split("-").map(Number);
        if (parts.some(isNaN)) continue;
        total += parts[parts.length - 1]; // use upper bound
      }
    }
  }
  return total;
}

// ============================================================================
// VALIDAÇÃO CROSS-SESSION (Fase 3 v14.5)
// ============================================================================

interface CrossSessionStats {
  patternSets: Record<string, number>; // sets por padrão de movimento na semana
  hingeHeavyCount: number; // hinge pesados na semana
  lomHighPerSession: Record<string, number>; // exercícios LOM>=4 por sessão
  neuralProfile: Record<string, string>; // perfil neural por slot (alto/moderado/metcon)
  jointStress: Record<string, number>; // stress articular acumulado (joelho, ombro, lombar)
  primeMoversPerSession: Record<string, Set<string>>; // prime movers usados por sessão
}

/**
 * Coleta estatísticas cross-session para validação
 */
function collectCrossSessionStats(
  workouts: GeneratedWorkout[],
  allExercises: Exercise[]
): CrossSessionStats {
  const exerciseMap = new Map<string, Exercise>();
  for (const ex of allExercises) exerciseMap.set(ex.id, ex);

  const stats: CrossSessionStats = {
    patternSets: {},
    hingeHeavyCount: 0,
    lomHighPerSession: {},
    neuralProfile: {},
    jointStress: { joelho: 0, ombro: 0, lombar: 0 },
    primeMoversPerSession: {},
  };

  for (const workout of workouts) {
    const slot = workout.slot;
    stats.primeMoversPerSession[slot] = new Set<string>();
    let sessionLomHigh = 0;

    // Determine neural profile from valences
    if (workout.valences.includes("potencia")) {
      stats.neuralProfile[slot] = "alto";
    } else if (workout.valences.includes("forca")) {
      stats.neuralProfile[slot] = "moderado";
    } else if (workout.valences.includes("condicionamento")) {
      stats.neuralProfile[slot] = "metcon";
    } else {
      stats.neuralProfile[slot] = "moderado";
    }

    for (const phase of workout.phases) {
      for (const block of phase.blocks) {
        if (block.method === "respiracao" || block.method === "autoliberacao") continue;

        for (const genEx of block.exercises) {
          const libEx = exerciseMap.get(genEx.exerciseLibraryId);
          if (!libEx) continue;

          // Count sets per pattern
          const pattern = libEx.movement_pattern || "unknown";
          const setParts = genEx.sets.split("-").map(Number);
          const setCount = setParts.some(isNaN) ? 3 : setParts[setParts.length - 1];
          stats.patternSets[pattern] = (stats.patternSets[pattern] || 0) + setCount;

          // Track prime movers (via movement_pattern as proxy)
          stats.primeMoversPerSession[slot].add(pattern);

          // F1 extended: count hinge heavy (LOM>=4 + cadeia_posterior)
          if (pattern === "cadeia_posterior" && (libEx.lumbar_demand || 0) >= 4) {
            stats.hingeHeavyCount++;
          }

          // LOM high count per session
          if ((libEx.lumbar_demand || 0) >= 4) {
            sessionLomHigh++;
          }

          // Joint stress accumulation
          if ((libEx.knee_dominance || 0) >= 4) {
            stats.jointStress.joelho += setCount;
          }
          if (["empurrar", "puxar"].includes(pattern) && (libEx.axial_load || 0) >= 3) {
            stats.jointStress.ombro += setCount;
          }
          if ((libEx.lumbar_demand || 0) >= 3) {
            stats.jointStress.lombar += setCount;
          }
        }
      }
    }

    stats.lomHighPerSession[slot] = sessionLomHigh;
  }

  return stats;
}

/**
 * F2: Validação de dominância acumulada — verifica equilíbrio semanal
 * Regras:
 *   - Push/Pull/Knee/Hip devem ter mínimos semanais por frequência:
 *     - 2 treinos: mínimo 8 sets por padrão
 *     - 3 treinos: mínimo 12 sets por padrão
 *   - Pull deve ser no mínimo 25% > Push
 */
function validateDominanceBalance(
  stats: CrossSessionStats,
  weeklySessions: number,
  warnings: string[]
): void {
  const push = stats.patternSets["empurrar"] || 0;
  const pull = stats.patternSets["puxar"] || 0;
  const knee = (stats.patternSets["dominancia_joelho"] || 0) + (stats.patternSets["lunge"] || 0);
  const hip = stats.patternSets["cadeia_posterior"] || 0;

  // Minimum weekly sets per movement pattern
  const minSetsPerPattern =
    weeklySessions >= 3
      ? 12
      : weeklySessions === 2
        ? 8
        : Math.max(4, weeklySessions * 4);

  if (push < minSetsPerPattern) {
    warnings.push(`Volume semanal Push insuficiente: ${push} sets (mín. ${minSetsPerPattern}).`);
  }
  if (pull < minSetsPerPattern) {
    warnings.push(`Volume semanal Pull insuficiente: ${pull} sets (mín. ${minSetsPerPattern}).`);
  }
  if (knee < minSetsPerPattern) {
    warnings.push(`Volume semanal Knee insuficiente: ${knee} sets (mín. ${minSetsPerPattern}).`);
  }
  if (hip < minSetsPerPattern) {
    warnings.push(`Volume semanal Hip insuficiente: ${hip} sets (mín. ${minSetsPerPattern}).`);
  }

  // Pull must be at least 25% > Push
  if (push > 0) {
    const ratio = pull / push;
    if (ratio < 1.25) {
      warnings.push(`Pull/Push ratio: ${ratio.toFixed(2)}x (mín. 1.25x). Pull deve ser pelo menos 25% superior ao Push.`);
    }
  }
}

/**
 * F5: Sobreposição de prime movers — mesmos grupos não devem ser sobrecarregados
 */
function validatePrimeMoverOverlap(
  stats: CrossSessionStats,
  warnings: string[]
): void {
  // Check if same heavy patterns appear in all 3 sessions
  const slots = Object.keys(stats.primeMoversPerSession);
  if (slots.length < 3) return;

  const allPatterns = new Set<string>();
  for (const slot of slots) {
    for (const p of stats.primeMoversPerSession[slot]) {
      allPatterns.add(p);
    }
  }

  for (const pattern of allPatterns) {
    const sessionsWithPattern = slots.filter(
      (s) => stats.primeMoversPerSession[s].has(pattern)
    ).length;

    // Same pattern in all 3 sessions with high total volume is a concern
    if (sessionsWithPattern === 3) {
      const totalSets = stats.patternSets[pattern] || 0;
      if (totalSets > 15) {
        warnings.push(
          `Padrão "${pattern}" presente em todos os 3 treinos com ${totalSets} sets totais. Risco de sobreposição de prime movers.`
        );
      }
    }
  }
}

/**
 * G12: Controle neural e articular semanal
 * Regras:
 *   - Max 2 blocos pesados (alto neural) por semana
 *   - Max 1 hinge pesado por sessão (já garantido por F1)
 *   - Composição ideal: 1 Alto + 1 Moderado + 1 MetCon (ou similar)
 *   - Stress articular: joelho, ombro, lombar não devem exceder limites
 */
function validateNeuralAndJointControl(
  stats: CrossSessionStats,
  warnings: string[]
): void {
  // Neural: max 2 "alto" sessions per week
  const altoCount = Object.values(stats.neuralProfile).filter((p) => p === "alto").length;
  if (altoCount > 2) {
    warnings.push(
      `Controle neural: ${altoCount} sessões de alta demanda neural/semana (max recomendado: 2).`
    );
  }

  // Hinge heavy: max 2 per week across all sessions
  if (stats.hingeHeavyCount > 2) {
    warnings.push(
      `Hinge pesado: ${stats.hingeHeavyCount}x/semana (max recomendado: 2). Risco lombar acumulado.`
    );
  }

  // Joint stress thresholds (in weekly sets)
  const JOINT_LIMITS = { joelho: 25, ombro: 20, lombar: 15 };
  for (const [joint, limit] of Object.entries(JOINT_LIMITS)) {
    const stress = stats.jointStress[joint] || 0;
    if (stress > limit) {
      warnings.push(
        `Stress articular ${joint}: ${stress} sets com carga significativa/semana (limite: ${limit}).`
      );
    }
  }

  // Ideal weekly composition check
  const profiles = Object.values(stats.neuralProfile);
  const hasAlto = profiles.includes("alto");
  const hasModerado = profiles.includes("moderado");
  const hasMetcon = profiles.includes("metcon");

  if (!hasAlto && !hasModerado) {
    warnings.push("Composição semanal sem sessão de alta ou moderada intensidade neural.");
  }
  if (profiles.every((p) => p === "alto")) {
    warnings.push("Todas as sessões são de alta demanda neural. Risco de overreaching.");
  }
}

// ============================================================================
// LLM ENRICHMENT
// ============================================================================

async function enrichWithLLM(workouts: GeneratedWorkout[]): Promise<void> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return;

  try {
    const exerciseList = workouts.flatMap((w) =>
      w.phases.flatMap((p) =>
        p.blocks.flatMap((b) =>
          b.exercises.map((ex) => ({
            workoutSlot: w.slot,
            exerciseId: ex.id,
            name: ex.name,
            sets: ex.sets,
            reps: ex.reps,
            movementPattern: ex.movementPattern,
          }))
        )
      )
    );

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Você é um treinador funcional especialista da Fabrik Performance (Body & Mind Fitness).
Gere orientações de execução (execution cues) para cada exercício, um script de mindfulness para o encerramento de cada treino e uma frase motivacional.
Responda APENAS com JSON válido no formato especificado pela tool.
Cues: máximo 2 frases, linguagem profissional e acessível.
Mindfulness: 3-4 frases focando em respiração e consciência corporal.
Frases motivacionais: inspiradoras, alinhadas com a filosofia Body & Mind Fitness.`,
          },
          {
            role: "user",
            content: `Gere cues de execução para estes exercícios e scripts para cada treino:\n${JSON.stringify(exerciseList)}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "set_enrichment",
              description: "Define execution cues, mindfulness scripts and motivational phrases",
              parameters: {
                type: "object",
                properties: {
                  exerciseCues: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        exerciseId: { type: "string" },
                        cue: { type: "string" },
                      },
                      required: ["exerciseId", "cue"],
                      additionalProperties: false,
                    },
                  },
                  workoutEnrichments: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        slot: { type: "string", enum: ["A", "B", "C"] },
                        mindfulnessScript: { type: "string" },
                        motivationalPhrase: { type: "string" },
                      },
                      required: ["slot", "mindfulnessScript", "motivationalPhrase"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["exerciseCues", "workoutEnrichments"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "set_enrichment" } },
      }),
    });

    if (!response.ok) {
      console.error("LLM enrichment failed:", response.status);
      return;
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) return;

    const enrichment = JSON.parse(toolCall.function.arguments);

    const cueMap = new Map<string, string>();
    for (const c of enrichment.exerciseCues || []) {
      cueMap.set(c.exerciseId, c.cue);
    }

    for (const w of workouts) {
      const we = (enrichment.workoutEnrichments || []).find(
        (e: { slot: string }) => e.slot === w.slot
      );
      if (we) {
        w.mindfulnessScript = we.mindfulnessScript;
        w.motivationalPhrase = we.motivationalPhrase;
      }

      for (const phase of w.phases) {
        for (const block of phase.blocks) {
          for (const ex of block.exercises) {
            const cue = cueMap.get(ex.id);
            if (cue) ex.executionCues = cue;
          }
        }
      }
    }
  } catch (err) {
    console.error("LLM enrichment error:", err);
  }
}

// ============================================================================
// GERAÇÃO DO WORKOUT v14.5
// ============================================================================

function generateSingleWorkout(
  exercises: Exercise[],
  config: WorkoutSlotConfig,
  groupLevel: string,
  volumeMultiplier: number,
  breathingProtocols: BreathingProtocol[],
  globalExcludeIds: Set<string>
): GeneratedWorkout {
  const excludeIds = new Set(globalExcludeIds);
  const sessionSelectedExercises: Exercise[] = [];

  // Step 1: Build main blocks first (to determine BP1 pattern for mobility)
  // We need to peek at what BP1 will select to inform mobility
  // Determine likely BP1 pattern based on available exercises
  const kneePool = exercises.filter(
    (ex) => ex.movement_pattern && SESSION_PATTERN_GROUPS.lower_knee.includes(ex.movement_pattern) && !excludeIds.has(ex.id)
  );
  // G-01: Random selection instead of deterministic kneePool[0]
  const likelyBp1Pattern = kneePool.length > 0 ? kneePool[Math.floor(Math.random() * kneePool.length)].movement_pattern : null;

  // Phase 1: Opening (Resp + LMF)
  const openingPhase = buildOpeningPhase(exercises, excludeIds, config.valences, breathingProtocols);

  // Phase 2: Mobility specific to BP1
  const mobilityPhase = buildMobilityPhase(exercises, excludeIds, likelyBp1Pattern);

  // Phase 3: Core biplanar
  const corePhase = buildCorePhase(exercises, excludeIds, config.slot);

  // Phase 4-7: Main blocks (BP1 + BP2 + BP3)
  const { phases: mainPhases, coveredPatterns, bp1Pattern } = buildMainBlocks(
    exercises, config.valences, groupLevel, excludeIds, volumeMultiplier, sessionSelectedExercises
  );

  // Phase 8: Finalizer (Carry)
  const warnings: string[] = [];
  const finalizerPhase = buildFinalizerPhase(exercises, excludeIds, volumeMultiplier, config.valences, sessionSelectedExercises, warnings);
  if (finalizerPhase && finalizerPhase.blocks.length > 0) {
    coveredPatterns.push("carregar");
  }

  // Phase 9: Closing by valence
  const closingPhase = buildClosingPhase(config.valences, breathingProtocols);

  const allPhases: SessionPhase[] = [
    openingPhase,
    mobilityPhase,
    corePhase,
    ...mainPhases,
    ...(finalizerPhase ? [finalizerPhase] : []),
    closingPhase,
  ];

  // Collect all covered patterns
  const allCoveredPatterns = new Set<string>(coveredPatterns);
  [openingPhase, mobilityPhase, corePhase].forEach((phase) => {
    phase.blocks.forEach((block) => {
      block.exercises.forEach((ex) => allCoveredPatterns.add(ex.movementPattern));
    });
  });

  // Propagate main phase exercise IDs to global exclude for anti-repetition
  mainPhases.forEach((p) =>
    p.blocks.forEach((b) =>
      b.exercises.forEach((ex) => globalExcludeIds.add(ex.exerciseLibraryId))
    )
  );
  // Also propagate carry
  if (finalizerPhase) {
    finalizerPhase.blocks.forEach((b) =>
      b.exercises.forEach((ex) => globalExcludeIds.add(ex.exerciseLibraryId))
    );
  }

  return {
    id: generateUUID(),
    slot: config.slot,
    name: generateWorkoutName(config.slot, config.valences),
    valences: config.valences,
    totalDuration: SESSION_STRUCTURE.totalDuration,
    phases: allPhases,
    coveredPatterns: Array.from(allCoveredPatterns),
    coreTriplanarCheck: checkCoreTriplanar(allPhases),
  };
}

// ============================================================================
// HANDLER PRINCIPAL
// ============================================================================

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ success: false, error: "Autenticação obrigatória" }),
        { headers: jsonHeaders, status: 401 }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(
        JSON.stringify({ success: false, error: "Token inválido" }),
        { headers: jsonHeaders, status: 401 }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .in("role", ["admin", "moderator"])
      .limit(1);

    if (roleError) {
      return new Response(
        JSON.stringify({ success: false, error: "Falha ao verificar permissões" }),
        { headers: jsonHeaders, status: 500 }
      );
    }

    if (!roleData || roleData.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Acesso restrito a treinadores e admins" }),
        { headers: jsonHeaders, status: 403 }
      );
    }

    const body: unknown = await req.json();
    if (!isValidMesocycleInput(body)) {
      return new Response(
        JSON.stringify({ success: false, error: "Input inválido. Necessário: groupLevel válido e 3 workouts (A/B/C) com valências." }),
        { headers: jsonHeaders, status: 400 }
      );
    }

    const input: MesocycleInput = body;

    if (!input.groupLevel || !input.workouts || input.workouts.length !== 3) {
      return new Response(
        JSON.stringify({ success: false, error: "Input inválido. Necessário: groupLevel e 3 workouts (A/B/C)" }),
        { headers: jsonHeaders, status: 400 }
      );
    }

    // Phase 4: Validate week count
    const weekCount = Math.min(8, Math.max(3, input.weekCount || 4));
    const audiencePreset = input.audiencePreset || "adulto";
    const audienceConfig = AUDIENCE_PRESETS[audiencePreset] || AUDIENCE_PRESETS.adulto;

    // Fetch exercises WITH v14.5 dimensions
    const { data: allExercises, error: exercisesError } = await supabase
      .from("exercises_library")
      .select("id, name, movement_pattern, risk_level, level, category, subcategory, movement_plane, equipment_required, default_sets, default_reps, numeric_level, axial_load, lumbar_demand, technical_complexity, metabolic_potential, knee_dominance, hip_dominance");

    if (exercisesError) throw new Error(`Erro ao buscar exercícios: ${exercisesError.message}`);

    // Fetch breathing protocols (with category for closing selection)
    const { data: breathingProtocols, error: breathingProtocolsError } = await supabase
      .from("breathing_protocols")
      .select("id, name, technique, rhythm, duration_seconds, instructions, category, when_to_use")
      .eq("is_active", true);
    if (breathingProtocolsError) {
      throw new Error(`Erro ao buscar protocolos respiratórios: ${breathingProtocolsError.message}`);
    }

    // Fetch available equipment
    const { data: equipmentData, error: equipmentDataError } = await supabase
      .from("equipment_inventory")
      .select("name")
      .eq("is_available", true);
    if (equipmentDataError) {
      throw new Error(`Erro ao buscar equipamentos disponíveis: ${equipmentDataError.message}`);
    }

    const availableEquipment = new Set<string>(
      (equipmentData || []).map((e: { name: string }) => e.name.toLowerCase())
    );

    // Apply filters
    let exercises = filterByLevel(allExercises || [], input.groupLevel);
    exercises = filterByRisk(exercises, input.groupLevel);
    exercises = filterByAvailableEquipment(exercises, availableEquipment);

    // Phase 4: Apply audience preset filters
    exercises = applyAudienceFilters(exercises, audiencePreset);

    // Phase 4: F4 — Teachable progression filter
    // G-06: Pass filtered exercises (not allExercises) to find regressions in same universe
    exercises = applyF4TeachableProgression(exercises, exercises);

    if (input.excludeExercises?.length) {
      exercises = exercises.filter((ex) => !input.excludeExercises!.includes(ex.id));
    }

    // Phase 4: Mode B — retain specific exercises from previous mesocycle
    // In Mode B, retainExerciseIds stay in the pool but are NOT excluded
    // In Mode A, all exercises from previous cycle are excluded (via excludeExercises)
    if (input.rotationMode === "B" && input.retainExerciseIds?.length) {
      // Ensure retained exercises are in the pool (re-add if filtered out by excludeExercises)
      const retainSet = new Set(input.retainExerciseIds);
      const retained = (allExercises || []).filter((ex) => retainSet.has(ex.id));
      const existingIds = new Set(exercises.map((ex) => ex.id));
      for (const ex of retained) {
        if (!existingIds.has(ex.id)) {
          exercises.push(ex);
        }
      }
    }

    if (exercises.length < 20) {
      return new Response(
        JSON.stringify({ success: false, error: "Biblioteca de exercícios insuficiente. Necessário pelo menos 20 exercícios." }),
        { headers: jsonHeaders, status: 400 }
      );
    }

    // Phase 4: Cap volume multiplier by audience preset
    const rawVolumeMultiplier = calcVolumeMultiplier(input.groupReadiness);
    const volumeMultiplier = Math.min(rawVolumeMultiplier, audienceConfig.volumeMultiplierCap);
    const workouts: GeneratedWorkout[] = [];
    const warnings: string[] = [];

    // Phase 4: Add audience restrictions as info
    if (audiencePreset !== "adulto") {
      warnings.push(`Preset de público: ${audiencePreset}. Restrições aplicadas automaticamente.`);
    }

    if (input.groupReadiness && input.groupReadiness < 45) {
      warnings.push(
        `Readiness médio do grupo baixo (${input.groupReadiness}). Volume reduzido automaticamente em ${Math.round((1 - volumeMultiplier) * 100)}%.`
      );
    }

    // Global exclude IDs for anti-repetition across A/B/C
    const globalExcludeIds = new Set<string>();

    for (const workoutConfig of input.workouts) {
      const workout = generateSingleWorkout(
        exercises, workoutConfig, input.groupLevel, volumeMultiplier,
        breathingProtocols || [], globalExcludeIds
      );
      workouts.push(workout);

      // Volume validation — use audience-specific max
      const effectiveSets = countEffectiveSets(workout);
      if (effectiveSets > audienceConfig.maxEffectiveSets) {
        warnings.push(`Treino ${workoutConfig.slot}: ${effectiveSets} sets efetivos (max para ${audiencePreset}: ${audienceConfig.maxEffectiveSets}). Considere reduzir volume.`);
      }

      // Core triplanar check
      const { anti_extensao, anti_flexao_lateral, anti_rotacao } = workout.coreTriplanarCheck;
      if (!anti_extensao && !anti_flexao_lateral && !anti_rotacao) {
        warnings.push(`Treino ${workoutConfig.slot}: Nenhum plano de core coberto. Revise a seleção.`);
      }
    }

    // v14.5: Cross-session validation (F2, F5, G12)
    const patternsBalance = calcPatternsBalance(workouts);
    const crossStats = collectCrossSessionStats(workouts, allExercises || []);

    validateDominanceBalance(crossStats, input.workouts.length, warnings);
    validatePrimeMoverOverlap(crossStats, warnings);
    validateNeuralAndJointControl(crossStats, warnings);

    const carryCount = patternsBalance["carregar"] || 0;
    if (carryCount < 2) {
      warnings.push(`Carry: apenas ${carryCount}x/semana. Recomendado mínimo 2x/semana.`);
    }

    // G-02: Enrich with LLM (non-blocking, adds warning if fails)
    try {
      await enrichWithLLM(workouts);
    } catch (enrichError) {
      warnings.push('Enriquecimento por IA indisponível nesta geração. Cues de execução não foram adicionados.');
    }

    // Phase 4: Build progression for configurable week count
    const hasMetcon = input.workouts.some((w) => w.valences.includes("condicionamento"));
    const recommendedProgression = buildProgressionForWeeks(weekCount, volumeMultiplier, hasMetcon);

    const mesocycle = {
      id: generateUUID(),
      groupLevel: input.groupLevel,
      workouts,
      createdAt: new Date().toISOString(),
      metadata: {
        version: "v14.5-phase4",
        groupReadiness: input.groupReadiness ?? null,
        volumeMultiplier,
        totalPatternsBalance: patternsBalance,
        recommendedProgression,
        weekCount,
        audiencePreset,
        rotationMode: input.rotationMode || "A",
        crossSessionValidation: {
          neuralProfile: crossStats.neuralProfile,
          jointStress: crossStats.jointStress,
          hingeHeavyCount: crossStats.hingeHeavyCount,
          patternSetsWeekly: crossStats.patternSets,
        },
        safetyFilters: {
          F1: "max 2 LOM>=4/sessão, max 1 hinge pesado/sessão",
          F2: "dominância acumulada: Pull 1.2-1.4x Push, mín semanal por padrão",
          F3: "TEC<=2 em bloco metcon",
          F4: "progressão ensinável: prioriza exercícios com regressões disponíveis",
          F5: "sobreposição prime movers: alerta se mesmo padrão >15 sets em 3 sessões",
          allOutRule: "AX<=2 E LOM<=2 para PSE 9-10",
          antiMetcon: "PSE<=8 em blocos não-metcon",
          G12_neural: "max 2 sessões alta demanda neural/semana",
          G12_articular: "limites: joelho 25, ombro 20, lombar 15 sets/semana",
        },
        audienceRestrictions: audienceConfig.restrictions,
      },
    };

    return new Response(
      JSON.stringify({ success: true, mesocycle, warnings }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("Error generating mesocycle:", errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
