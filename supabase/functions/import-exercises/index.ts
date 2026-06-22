import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";
import { authenticateServiceRoleOrUserRole } from "../_shared/auth.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Normalize name for matching ──
function normalize(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ");
}

// ============================================================================
// MAPEAMENTO: Padrao_movimento da planilha → (category, movement_pattern)
// ============================================================================

interface PatternMapping {
    category: string;
    movement_pattern: string | null;
}

const SPREADSHEET_PATTERN_MAP: Record<string, PatternMapping> = {
    "Squat": { category: "forca_hipertrofia", movement_pattern: "dominancia_joelho" },
    "Hinge": { category: "forca_hipertrofia", movement_pattern: "cadeia_posterior" },
    "Push": { category: "forca_hipertrofia", movement_pattern: "empurrar" },
    "Pull": { category: "forca_hipertrofia", movement_pattern: "puxar" },
    "Carry": { category: "forca_hipertrofia", movement_pattern: "carregar" },
    "Lunge": { category: "forca_hipertrofia", movement_pattern: "lunge" },
    "Core": { category: "core_ativacao", movement_pattern: null },
    "Estab_AntiRotacao": { category: "core_ativacao", movement_pattern: null },
    "Estab_AntiExtensao": { category: "core_ativacao", movement_pattern: null },
    "Estab_AntiFlexaoLat": { category: "core_ativacao", movement_pattern: null },
    "Estab_CintEscap": { category: "core_ativacao", movement_pattern: null },
    "LMF": { category: "lmf", movement_pattern: null },
    "Mobilidade": { category: "mobilidade", movement_pattern: null },
    "Potencia": { category: "potencia_pliometria", movement_pattern: null },
};

// Subcategory mapping from spreadsheet patterns
const SPREADSHEET_SUBCATEGORY_MAP: Record<string, string> = {
    "Estab_AntiRotacao": "anti_rotacao",
    "Estab_AntiExtensao": "anti_extensao",
    "Estab_AntiFlexaoLat": "anti_flexao_lateral",
    "Estab_CintEscap": "ativacao_escapular",
};

// ============================================================================
// MAPEAMENTO UNIFICADO: subcategoria do JSON → (movement_pattern, category)
// ============================================================================

interface SubcategoryMapping {
    movement_pattern: string | null;
    category: string;
}

const SUBCATEGORY_MAP: Record<string, SubcategoryMapping> = {
    empurrar_horizontal: { movement_pattern: "empurrar", category: "forca_hipertrofia" },
    empurrar_vertical: { movement_pattern: "empurrar", category: "forca_hipertrofia" },
    puxar_horizontal: { movement_pattern: "puxar", category: "forca_hipertrofia" },
    puxar_vertical: { movement_pattern: "puxar", category: "forca_hipertrofia" },
    agachamento_bilateral: { movement_pattern: "dominancia_joelho", category: "forca_hipertrofia" },
    agachamento_lateral: { movement_pattern: "dominancia_joelho", category: "forca_hipertrofia" },
    agachamento_unilateral: { movement_pattern: "dominancia_joelho", category: "forca_hipertrofia" },
    base_assimetrica_split_squat: { movement_pattern: "lunge", category: "forca_hipertrofia" },
    lunge: { movement_pattern: "lunge", category: "forca_hipertrofia" },
    lunge_slideboard: { movement_pattern: "lunge", category: "forca_hipertrofia" },
    flexao_joelhos_nordica: { movement_pattern: "cadeia_posterior", category: "forca_hipertrofia" },
    deadlift_bilateral: { movement_pattern: "cadeia_posterior", category: "forca_hipertrofia" },
    deadlift_unilateral: { movement_pattern: "cadeia_posterior", category: "forca_hipertrofia" },
    rdl_stiff: { movement_pattern: "cadeia_posterior", category: "forca_hipertrofia" },
    ponte_hip_thrust: { movement_pattern: "cadeia_posterior", category: "forca_hipertrofia" },
    carregamento: { movement_pattern: "carregar", category: "forca_hipertrofia" },
    carregamentos: { movement_pattern: "carregar", category: "forca_hipertrofia" },
    anti_extensao: { movement_pattern: null, category: "core_ativacao" },
    anti_flexao_lateral: { movement_pattern: null, category: "core_ativacao" },
    anti_rotacao: { movement_pattern: null, category: "core_ativacao" },
    escapula: { movement_pattern: null, category: "core_ativacao" },
    gluteos_estabilidade: { movement_pattern: null, category: "core_ativacao" },
    pe_tornozelo: { movement_pattern: null, category: "core_ativacao" },
    corretivos_quadril: { movement_pattern: null, category: "core_ativacao" },
    tornozelo: { movement_pattern: null, category: "mobilidade" },
    quadril: { movement_pattern: null, category: "mobilidade" },
    coluna_toracica: { movement_pattern: null, category: "mobilidade" },
    integrados: { movement_pattern: null, category: "mobilidade" },
    bilateral_linear: { movement_pattern: null, category: "potencia_pliometria" },
    unilateral_linear: { movement_pattern: null, category: "potencia_pliometria" },
    unilateral_lateral: { movement_pattern: null, category: "potencia_pliometria" },
    unilateral_lateral_medial: { movement_pattern: null, category: "potencia_pliometria" },
    frontal: { movement_pattern: null, category: "potencia_pliometria" },
    sagital: { movement_pattern: null, category: "potencia_pliometria" },
    transverso: { movement_pattern: null, category: "potencia_pliometria" },
    regioes: { movement_pattern: null, category: "lmf" },
    protocolos: { movement_pattern: null, category: "respiracao" },
    tecnicas: { movement_pattern: null, category: "respiracao" },
};

const LATERALITY_MAP: Record<string, string> = {
    bilateral: "bilateral",
    unilateral: "unilateral",
    alternado: "alternado",
    assimetrica: "base_assimetrica",
    Bilateral: "bilateral",
    Unilateral: "unilateral",
};

function extractMovementPlane(tags: string[], subcategoryKey: string): string {
    if (tags.includes("plano_frontal")) return "frontal";
    if (tags.includes("plano_transverso")) return "transverse";
    if (tags.includes("plano_sagital")) return "sagittal";
    if (subcategoryKey === "frontal") return "frontal";
    if (subcategoryKey === "transverso") return "transverse";
    if (subcategoryKey === "sagital") return "sagittal";
    return "sagittal";
}

function riskFromLevel(level: number): string {
    if (level <= 2) return "low";
    if (level <= 4) return "medium";
    return "high";
}

function levelLabel(level: number): string {
    if (level <= 2) return "Iniciante";
    if (level <= 3) return "Intermediario";
    return "Avancado";
}

// ============================================================================
// Flatten JSON format (existing)
// ============================================================================

interface FlatExercise {
    nome: string;
    movement_pattern: string | null;
    category: string;
    subcategory: string;
    base?: string;
    posicao?: string;
    nivel?: number;
    equipamento?: string;
    tags?: string[];
    fase_pliometria?: number;
    sets_reps?: string;
    regiao?: string;
    cadeia?: string;
}

function flattenJSON(json: Record<string, unknown>): FlatExercise[] {
    const result: FlatExercise[] = [];
    const padroes = json.padroes_de_movimento as Record<string, unknown>;
    if (!padroes) return result;

  for (const [_topKey, topVal] of Object.entries(padroes)) {
        const topObj = topVal as Record<string, unknown>;
        const subcategorias = topObj.subcategorias as Record<string, unknown>;
        if (!subcategorias) continue;

      for (const [subKey, subVal] of Object.entries(subcategorias)) {
              const mapping = SUBCATEGORY_MAP[subKey];
              const movementPattern = mapping ? mapping.movement_pattern : subKey;
              const category = mapping?.category || "forca_hipertrofia";

          const subObj = subVal as Record<string, unknown>;
              const exercicios = subObj.exercicios;
              if (!exercicios) continue;

          const pushExercise = (ex: Record<string, unknown>) => {
                    let exerciseSubcategory = subKey;
                    if (subKey === "empurrar_horizontal" || subKey === "empurrar_vertical") {
                                exerciseSubcategory = subKey.replace("empurrar_", "");
                    } else if (subKey === "puxar_horizontal" || subKey === "puxar_vertical") {
                                exerciseSubcategory = subKey.replace("puxar_", "");
                    } else if (movementPattern === "cadeia_posterior") {
                                exerciseSubcategory = subKey === "flexao_joelhos_nordica" ? "enfase_joelho" : "enfase_quadril";
                    } else if (category === "potencia_pliometria") {
                                if (["bilateral_linear", "unilateral_linear", "unilateral_lateral", "unilateral_lateral_medial"].includes(subKey)) {
                                              exerciseSubcategory = "pliometria";
                                } else if (["frontal", "sagital", "transverso"].includes(subKey)) {
                                              exerciseSubcategory = "locomocao";
                                } else {
                                              exerciseSubcategory = "potencia";
                                }
                    }

                    result.push({
                                nome: ex.nome as string,
                                movement_pattern: movementPattern,
                                category,
                                subcategory: exerciseSubcategory,
                                base: ex.base as string | undefined,
                                posicao: ex.posicao as string | undefined,
                                nivel: ex.nivel as number | undefined,
                                equipamento: ex.equipamento as string | undefined,
                                tags: ex.tags as string[] | undefined,
                                fase_pliometria: ex.fase as number | undefined,
                                sets_reps: ex.sets_reps as string | undefined,
                                regiao: ex.regiao as string | undefined,
                                cadeia: ex.cadeia as string | undefined,
                    });
          };

          if (Array.isArray(exercicios)) {
                    for (const ex of exercicios) pushExercise(ex);
          } else if (typeof exercicios === "object") {
                    for (const [_groupKey, groupVal] of Object.entries(exercicios as Record<string, unknown>)) {
                                if (Array.isArray(groupVal)) {
                                              for (const ex of groupVal) pushExercise(ex);
                                } else {
                                              const group = groupVal as Record<string, unknown>;
                                              const groupExercises = group.exercicios;
                                              if (Array.isArray(groupExercises)) {
                                                              for (const ex of groupExercises) pushExercise(ex);
                                              }
                                }
                    }
          }
      }
  }
    return result;
}

// ============================================================================
// Spreadsheet format (new XLSX import)
// ============================================================================


type SpreadsheetExercise = Record<string, unknown>;

// Helper to get a value from a spreadsheet row with normalized key fallback
function getField(row: SpreadsheetExercise, ...keys: string[]): unknown {
    for (const key of keys) {
          if (row[key] !== undefined && row[key] !== null && row[key] !== "") return row[key];
    }
    // Fallback: normalize all keys and try matching
  const normalizeKey = (k: string) => k.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const normalizedKeys = keys.map(normalizeKey);
    for (const [rowKey, rowVal] of Object.entries(row)) {
          if (rowVal === undefined || rowVal === null || rowVal === "") continue;
          const nk = normalizeKey(rowKey);
          if (normalizedKeys.includes(nk)) return rowVal;
    }
    return undefined;
}

function mapSpreadsheetPlane(plano?: string): string {
    if (!plano) return "sagittal";
    const p = plano.toLowerCase().trim();
    if (p.includes("frontal")) return "frontal";
    if (p.includes("transvers")) return "transverse";
    return "sagittal";
}

function mapSpreadsheetRisk(risco?: string): string | null {
    if (!risco) return null;
    const r = risco
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
    if (r.includes("baixo") || r === "low") return "low";
    if (r.includes("alto") || r === "high") return "high";
    if (r.includes("medio") || r === "medium") return "medium";
    return null;
}

// FIX: aceitar |, virgula e ponto-e-virgula como separadores
function parsePrimaryMuscles(grupo?: string): string[] | null {
    if (!grupo) return null;
    return grupo.split(/[|,;]/).map(m => m.trim()).filter(Boolean);
}

// FIX: lookup case-insensitive para cobrir variacoes de casing da planilha
function lookupPatternMap(padrao?: string): PatternMapping | null {
    if (!padrao) return null;
    if (SPREADSHEET_PATTERN_MAP[padrao]) return SPREADSHEET_PATTERN_MAP[padrao];
    for (const key of Object.keys(SPREADSHEET_PATTERN_MAP)) {
          if (key.toLowerCase() === padrao.toLowerCase()) return SPREADSHEET_PATTERN_MAP[key];
    }
    return null;
}

// ============================================================================
// Heuristic scoring for orphan exercises
// ============================================================================

function heuristicScores(ex: { name: string; category: string | null; movement_pattern: string | null; boyle_score: number | null }) {
    const name = (ex.name || "").toLowerCase();
    const cat = ex.category || "";
    const mp = ex.movement_pattern || "";
    const bs = ex.boyle_score;

  const axial_load = (cat === "core_ativacao" || cat === "mobilidade" || cat === "lmf" || cat === "respiracao") ? 1
        : (mp === "carregar") ? 4
        : (name.includes("deadlift") || name.includes("terra")) ? 4
        : (name.includes("agachamento") || name.includes("squat")) ? 3
        : 2;

  const lumbar_demand = (cat === "core_ativacao" || cat === "mobilidade" || cat === "lmf" || cat === "respiracao") ? 1
        : (name.includes("deadlift") || name.includes("terra") || name.includes("rdl") || name.includes("stiff")) ? 4
        : (mp === "carregar") ? 3
        : 2;

  const technical_complexity = bs || 2;

  const metabolic_potential = (cat === "potencia_pliometria") ? 4
        : (cat === "core_ativacao" || cat === "mobilidade" || cat === "lmf" || cat === "respiracao") ? 1
        : 3;

  const knee_dominance = (mp === "dominancia_joelho") ? 4
        : (mp === "lunge") ? 3
        : (mp === "cadeia_posterior") ? 1
        : 2;

  const hip_dominance = (mp === "cadeia_posterior") ? 4
        : (mp === "lunge") ? 3
        : (mp === "dominancia_joelho") ? 1
        : 2;

  return { axial_load, lumbar_demand, technical_complexity, metabolic_potential, knee_dominance, hip_dominance };
}

// ── Main handler ──
Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
          return new Response(null, { headers: corsHeaders });
    }

             try {
                   const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
                   const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
                   const supabase = createClient(supabaseUrl, serviceKey);

      // Auth check (required): service_role OR authenticated admin (PR #212: admin-only)
      const authResult = await authenticateServiceRoleOrUserRole(req, {
        corsHeaders,
        allowedRoles: ["admin"],
        missingAuthMessage: "Missing or invalid authorization header",
        invalidTokenMessage: "Unauthorized",
        forbiddenMessage: "Forbidden: admin required",
      });
      if (authResult instanceof Response) {
        return authResult;
      }

      const body = await req.json();
      const skipOrphans = body.skip_orphans === true;

      // Detect format
      let isSpreadsheetFormat = false;
                   let exercises: FlatExercise[] = [];
                   let spreadsheetExercises: SpreadsheetExercise[] = [];

      if (body.format === "spreadsheet" && Array.isArray(body.exercises)) {
              isSpreadsheetFormat = true;
              spreadsheetExercises = body.exercises;
      } else if (body.exercises && Array.isArray(body.exercises)) {
              exercises = body.exercises;
      } else if (body.padroes_de_movimento) {
              exercises = flattenJSON(body);
      } else {
              return new Response(
                        JSON.stringify({ error: "Invalid format: need exercises array or padroes_de_movimento" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                      );
      }

      // Fetch existing exercises for matching
      const { data: existing, error: existingError } = await supabase
                     .from("exercises_library")
                     .select("id, name, category, movement_pattern, boyle_score");
      if (existingError) {
        throw new Error(`Erro ao buscar exercícios existentes: ${existingError.message}`);
      }

      const existingMap = new Map<string, { id: string; name: string; category: string | null; movement_pattern: string | null; boyle_score: number | null }>();
                   for (const ex of existing || []) {
                           existingMap.set(normalize(ex.name), ex);
                   }

      const errors: string[] = [];

      if (isSpreadsheetFormat) {
              // ── SPREADSHEET FORMAT (XLSX) ──

                     // FIX PRINCIPAL: acumular em arrays, sem I/O no loop
                     const toInsert: Record<string, unknown>[] = [];
              const toUpdate: Array<{ id: string; record: Record<string, unknown> }> = [];
              const matchedNames = new Set<string>();
              const debugSamples: Record<string, unknown>[] = [];
              let skipped = 0;

                     for (let idx = 0; idx < spreadsheetExercises.length; idx++) {
                               const ex = spreadsheetExercises[idx];
                               try {
                                           const exercicio_pt = getField(ex, "exercicio_pt", "nome", "name") as string;
                                           if (!exercicio_pt) continue;

                                 // Debug: log first 3 exercises
                                 if (idx < 3) {
                                               debugSamples.push({
                                                               idx,
                                                               name: exercicio_pt,
                                                               raw_keys: Object.keys(ex),
                                                               grupo_muscular_raw: ex["grupo_muscular"],
                                                               grupo_muscular_getField: getField(ex, "grupo_muscular"),
                                                               enfase_raw: ex["Enfase"],
                                                               enfase_getField: getField(ex, "Enfase", "enfase"),
                                                               all_values_sample: Object.entries(ex).slice(0, 5).map(([k, v]) => `${k}=${v}`),
                                               });
                                 }

                                 const padrao = getField(ex, "Padrao_movimento", "padrao_movimento") as string | undefined;

                                 // Skip MetCon
                                 if (padrao === "MetCon") {
                                               skipped++;
                                               continue;
                                 }

                                 const normalizedName = normalize(exercicio_pt);
                                           matchedNames.add(normalizedName);

                                 // Try direct match
                                 let match = existingMap.get(normalizedName);

                                 // Try aliases
                                 const aliasStr = getField(ex, "aliases_origem") as string | undefined;
                                           if (!match && aliasStr) {
                                                         const aliases = aliasStr.split(";").map((a: string) => normalize(a.trim()));
                                                         for (const alias of aliases) {
                                                                         match = existingMap.get(alias);
                                                                         if (match) break;
                                                         }
                                           }

                                 // FIX: usar lookupPatternMap com fallback case-insensitive
                                 const patternMapping = lookupPatternMap(padrao);

                                 // Extract fields with normalized key access
                                 const enfase = getField(ex, "Enfase", "enfase") as string | undefined;
                                           const grupoMuscular = getField(ex, "grupo_muscular") as string | undefined;
                                           const boyleScore = getField(ex, "boyle_score") as number | undefined;
                                           const subcategoria = getField(ex, "subcategoria") as string | undefined;

                                 const record: Record<string, unknown> = {
                                               name: exercicio_pt,
                                               boyle_score: boyleScore || null,
                                               axial_load: (getField(ex, "AX") as number) ?? null,
                                               lumbar_demand: (getField(ex, "LOM") as number) ?? null,
                                               technical_complexity: (getField(ex, "TEC") as number) ?? null,
                                               metabolic_potential: (getField(ex, "MET") as number) ?? null,
                                               knee_dominance: (getField(ex, "JOE") as number) ?? null,
                                               hip_dominance: (getField(ex, "QUA") as number) ?? null,
                                               primary_muscles: parsePrimaryMuscles(grupoMuscular),
                                               emphasis: enfase || null,
                                 };

                                 // Only set category/pattern if we have the mapping
                                 if (patternMapping) {
                                               record.category = patternMapping.category;
                                               record.functional_group = patternMapping.category;
                                               if (patternMapping.movement_pattern) {
                                                               record.movement_pattern = patternMapping.movement_pattern;
                                               }
                                 }

                                 // Map subcategory from spreadsheet pattern
                                 if (padrao && SPREADSHEET_SUBCATEGORY_MAP[padrao]) {
                                               record.subcategory = SPREADSHEET_SUBCATEGORY_MAP[padrao];
                                 } else if (subcategoria) {
                                               record.subcategory = subcategoria;
                                 }

                                 // Additional fields
                                 const base = getField(ex, "Base", "base") as string | undefined;
                                           const lateralidade = getField(ex, "lateralidade") as string | undefined;
                                           if (base || lateralidade) {
                                                         const lat = lateralidade || base;
                                                         record.laterality = lat ? (LATERALITY_MAP[lat] || lat.toLowerCase()) : null;
                                           }
                                           const posicao = getField(ex, "Posicao", "posicao") as string | undefined;
                                           if (posicao) record.position = posicao;
                                           const plano = getField(ex, "plano") as string | undefined;
                                           if (plano) record.movement_plane = mapSpreadsheetPlane(plano);
                                           const tipoContracao = getField(ex, "Tipo_contracao", "tipo_contracao") as string | undefined;
                                           if (tipoContracao) record.contraction_type = tipoContracao;
                                           const risco = getField(ex, "risco") as string | undefined;
                                           if (risco) record.risk_level = mapSpreadsheetRisk(risco);
                                           const nivelBoyle = getField(ex, "nivel_boyle") as string | undefined;
                                           if (nivelBoyle) record.level = nivelBoyle;
                                           if (boyleScore) {
                                                         record.numeric_level = boyleScore;
                                           }

                                 // Equipment
                                 const equipArr: string[] = [];
                                           const equipamento = getField(ex, "equipamento") as string | undefined;
                                           const implemento = getField(ex, "Implemento", "implemento") as string | undefined;
                                            if (equipamento) equipArr.push(...equipamento.split(/[,;+/]/).map((e: string) => e.trim()).filter(Boolean));
                                            if (implemento) implemento.split(/[,;+/]/).map((e: string) => e.trim()).filter(Boolean).forEach((e: string) => equipArr.push(e));
                                           if (equipArr.length > 0) record.equipment_required = [...new Set(equipArr)];

                                 // FIX PRINCIPAL: acumular em arrays em vez de fazer I/O individual
                                 if (match && match.id !== "__pending__") {
                                               toUpdate.push({ id: match.id, record });
                                 } else if (!match) {
                                               toInsert.push(record);
                                               // FIX: marcar como pending para evitar UPDATE fantasma em duplicatas
                                             existingMap.set(normalizedName, {
                                                             id: "__pending__",
                                                             name: exercicio_pt,
                                                             category: record.category as string || null,
                                                             movement_pattern: record.movement_pattern as string || null,
                                                             boyle_score: boyleScore || null,
                                             });
                                 }
                                           // Se match.id === "__pending__" -> duplicata na planilha -> ignorar

                               } catch (e) {
                                           errors.push(`Exception "${(getField(ex, "exercicio_pt") || "?")}": ${(e as Error).message}`);
                               }
                     }

                     // ── BATCH INSERT ──────────────────────────────────────────────────────
                     let inserted = 0;
              let updated = 0;
              const CHUNK = 100;

                     if (toInsert.length > 0) {
                               for (let i = 0; i < toInsert.length; i += CHUNK) {
                                           const chunk = toInsert.slice(i, i + CHUNK);
                                           const { error, data } = await supabase
                                             .from("exercises_library")
                                             .insert(chunk)
                                             .select("id");
                                           if (error) {
                                                         errors.push(`Batch insert chunk ${Math.floor(i / CHUNK) + 1}: ${error.message}`);
                                           } else {
                                                         inserted += data?.length ?? chunk.length;
                                           }
                               }
                     }

                     // ── BATCH UPDATE (upsert por id) ───────────────────────────────────────
                     if (toUpdate.length > 0) {
                               for (let i = 0; i < toUpdate.length; i += CHUNK) {
                                           const chunk = toUpdate.slice(i, i + CHUNK);
                                           const rows = chunk.map(({ id, record }) => ({ id, ...record }));
                                           const { error, data } = await supabase
                                             .from("exercises_library")
                                             .upsert(rows, { onConflict: "id" })
                                             .select("id");
                                           if (error) {
                                                         errors.push(`Batch update chunk ${Math.floor(i / CHUNK) + 1}: ${error.message}`);
                                           } else {
                                                         updated += data?.length ?? chunk.length;
                                           }
                               }
                     }

                     // ── BATCH: Reclassify orphans with heuristic scores (skip if partial batch) ──
                     let orphansUpdated = 0;
              const orphans: string[] = [];
              const orphanRows: Record<string, unknown>[] = [];

              if (!skipOrphans) {
                     for (const [norm, ex] of existingMap) {
                               if (!matchedNames.has(norm) && ex.id !== "__pending__") {
                                           orphans.push(ex.name);
                                           const scores = heuristicScores(ex);
                                           orphanRows.push({
                                                         id: ex.id,
                                                         axial_load: scores.axial_load,
                                                         lumbar_demand: scores.lumbar_demand,
                                                         technical_complexity: scores.technical_complexity,
                                                         metabolic_potential: scores.metabolic_potential,
                                                         knee_dominance: scores.knee_dominance,
                                                         hip_dominance: scores.hip_dominance,
                                           });
                               }
                     }

                     if (orphanRows.length > 0) {
                               for (let i = 0; i < orphanRows.length; i += CHUNK) {
                                           const chunk = orphanRows.slice(i, i + CHUNK);
                                           const { error, data } = await supabase
                                             .from("exercises_library")
                                             .upsert(chunk, { onConflict: "id", ignoreDuplicates: false })
                                             .select("id");
                                           if (!error) {
                                                         orphansUpdated += data?.length ?? chunk.length;
                                           } else {
                                                         errors.push(`Orphan batch chunk ${Math.floor(i / CHUNK) + 1}: ${error.message}`);
                                           }
                               }
                     }
              }

                     return new Response(
                               JSON.stringify({
                                           format: "spreadsheet",
                                           inserted,
                                           updated,
                                           skipped,
                                           orphans_reclassified: orphansUpdated,
                                           errors: errors.slice(0, 50),
                                           errors_total: errors.length,
                                           orphans,
                                           orphans_total: orphans.length,
                                           total_processed: spreadsheetExercises.length,
                                           total_in_db_after: existingMap.size + inserted,
                                           debug_samples: debugSamples,
                               }),
                       { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                             );
      } else {
              // ── JSON FORMAT (existing behavior) ──
                     let inserted = 0;
              let updated = 0;
              const orphans: string[] = [];

                     for (const ex of exercises) {
                               try {
                                           const normalizedName = normalize(ex.nome);

                                 const laterality = ex.base
                                             ? LATERALITY_MAP[ex.base] || ex.base
                                               : null;

                                 const equipmentArr = ex.equipamento
                                             ? ex.equipamento.split(/[+/]/).map((e: string) => e.trim()).filter(Boolean)
                                               : [];

                                 let sets: number | null = null;
                                           let reps: string | null = null;
                                           if (ex.sets_reps) {
                                                         const parts = ex.sets_reps.split("x");
                                                         if (parts.length === 2) {
                                                                         sets = parseInt(parts[0].trim());
                                                                         reps = parts[1].trim();
                                                         }
                                           }

                                 const record: Record<string, unknown> = {
                                               name: ex.nome,
                                               movement_pattern: ex.movement_pattern || null,
                                               functional_group: ex.movement_pattern || null,
                                               category: ex.category,
                                               subcategory: ex.subcategory,
                                               laterality,
                                               numeric_level: ex.nivel || null,
                                               boyle_score: ex.nivel ? (ex.nivel <= 2 ? 1 : ex.nivel <= 4 ? 2 : ex.nivel <= 6 ? 3 : ex.nivel <= 8 ? 4 : 5) : null,
                                               position: ex.posicao || null,
                                               tags: ex.tags || [],
                                               equipment_required: equipmentArr,
                                               risk_level: ex.nivel ? riskFromLevel(ex.nivel) : null,
                                               level: ex.nivel ? levelLabel(ex.nivel) : null,
                                               movement_plane: extractMovementPlane(ex.tags || [], ex.subcategory),
                                               plyometric_phase: typeof ex.fase_pliometria === "number" ? ex.fase_pliometria : null,
                                 };

                                 if (sets !== null) record.default_sets = sets;
                                           if (reps !== null) record.default_reps = reps;

                                 const match = existingMap.get(normalizedName);

                                 if (match) {
                                               const { error } = await supabase
                                                 .from("exercises_library")
                                                 .update(record)
                                                 .eq("id", match.id);
                                               if (error) errors.push(`Update "${ex.nome}": ${error.message}`);
                                               else updated++;
                                 } else {
                                               const { error } = await supabase
                                                 .from("exercises_library")
                                                 .insert(record);
                                               if (error) errors.push(`Insert "${ex.nome}": ${error.message}`);
                                               else {
                                                               inserted++;
                                                               existingMap.set(normalizedName, { id: "new", name: ex.nome, category: ex.category, movement_pattern: ex.movement_pattern, boyle_score: null });
                                               }
                                 }
                               } catch (e) {
                                           errors.push(`Exception "${ex.nome}": ${(e as Error).message}`);
                               }
                     }

                     // Find orphans
                     const jsonNormalized = new Set(exercises.map((ex: FlatExercise) => normalize(ex.nome)));
              for (const [norm, ex] of existingMap) {
                        if (!jsonNormalized.has(norm)) {
                                    orphans.push(ex.name);
                        }
              }

                     return new Response(
                               JSON.stringify({
                                           format: "json",
                                           inserted,
                                           updated,
                                           errors: errors.slice(0, 50),
                                           errors_total: errors.length,
                                           orphans,
                                           orphans_total: orphans.length,
                                           total_processed: exercises.length,
                                           total_in_db_after: existingMap.size,
                               }),
                       { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                             );
      }
             } catch (err) {
                   return new Response(
                           JSON.stringify({ error: (err as Error).message }),
                     { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                         );
             }
});
