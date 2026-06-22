/**
 * Edge Function: Classificação Batch de Exercícios via IA
 * Fabrik Performance - Back to Basics v14.5
 *
 * Usa Lovable AI (Gemini) para classificar exercícios nas 6 dimensões:
 * AX (Carga Axial), LOM (Exigência Lombar), TEC (Complexidade Técnica),
 * MET (Potencial Metabólico), JOE (Dominância Joelho), QUA (Dominância Quadril)
 *
 * Processa em lotes de 20 exercícios por chamada para evitar timeouts.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" };
const DEFAULT_BATCH_SIZE = 20;
const MAX_BATCH_SIZE = 50;

function normalizeBatchSize(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_BATCH_SIZE;
  return Math.max(1, Math.min(MAX_BATCH_SIZE, Math.trunc(parsed)));
}

function normalizeOffset(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.trunc(parsed));
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return fallback;
}

// Exercícios de referência do documento v14.5 — few-shot examples
const REFERENCE_EXERCISES = [
  { name: "Agachamento traseiro BB", AX: 5, LOM: 4, TEC: 3, MET: 2, JOE: 5, QUA: 2 },
  { name: "Agachamento frontal BB", AX: 5, LOM: 4, TEC: 4, MET: 2, JOE: 5, QUA: 2 },
  { name: "Box squat BB", AX: 4, LOM: 3, TEC: 3, MET: 2, JOE: 4, QUA: 3 },
  { name: "Goblet squat KB", AX: 2, LOM: 2, TEC: 2, MET: 3, JOE: 4, QUA: 2 },
  { name: "Romanian deadlift BB", AX: 4, LOM: 4, TEC: 3, MET: 2, JOE: 1, QUA: 5 },
  { name: "Trap bar DL", AX: 4, LOM: 4, TEC: 3, MET: 2, JOE: 3, QUA: 4 },
  { name: "Hip thrust KB/BB", AX: 2, LOM: 2, TEC: 2, MET: 3, JOE: 1, QUA: 5 },
  { name: "Levantamento terra conv.", AX: 5, LOM: 5, TEC: 4, MET: 2, JOE: 3, QUA: 5 },
  { name: "Supino plano BB", AX: 3, LOM: 2, TEC: 3, MET: 2, JOE: 0, QUA: 0 },
  { name: "Overhead press BB", AX: 4, LOM: 3, TEC: 3, MET: 2, JOE: 0, QUA: 0 },
  { name: "Landmine press", AX: 2, LOM: 2, TEC: 2, MET: 2, JOE: 0, QUA: 0 },
  { name: "Puxada supinada cabo", AX: 1, LOM: 1, TEC: 2, MET: 3, JOE: 0, QUA: 0 },
  { name: "Remada inclinada 2DB", AX: 2, LOM: 3, TEC: 2, MET: 3, JOE: 0, QUA: 0 },
  { name: "Leg press", AX: 1, LOM: 1, TEC: 1, MET: 3, JOE: 5, QUA: 1 },
  { name: "Leg curl máquina", AX: 1, LOM: 1, TEC: 1, MET: 2, JOE: 0, QUA: 3 },
  { name: "Step-up 2DB", AX: 2, LOM: 2, TEC: 2, MET: 3, JOE: 4, QUA: 2 },
  { name: "Walking lunge 2DB", AX: 2, LOM: 2, TEC: 3, MET: 4, JOE: 4, QUA: 3 },
  { name: "Reverse lunge inclinado 2DB", AX: 2, LOM: 2, TEC: 3, MET: 3, JOE: 3, QUA: 4 },
  { name: "Box jump", AX: 1, LOM: 1, TEC: 3, MET: 4, JOE: 1, QUA: 4 },
  { name: "KB swing", AX: 2, LOM: 3, TEC: 2, MET: 5, JOE: 1, QUA: 4 },
  { name: "Arremesso rotacional MB", AX: 1, LOM: 2, TEC: 3, MET: 5, JOE: 0, QUA: 3 },
  { name: "Trenó empurrar/puxar", AX: 1, LOM: 2, TEC: 2, MET: 5, JOE: 0, QUA: 3 },
  { name: "Farmer walk KB/DB", AX: 2, LOM: 3, TEC: 1, MET: 3, JOE: 0, QUA: 3 },
  { name: "Suitcase carry", AX: 2, LOM: 3, TEC: 2, MET: 3, JOE: 0, QUA: 3 },
  { name: "Overhead carry KB", AX: 2, LOM: 2, TEC: 2, MET: 3, JOE: 0, QUA: 2 },
];

const SYSTEM_PROMPT = `Você é um especialista em biomecânica e prescrição de exercícios funcionais da Fabrik Performance.

Sua tarefa é classificar exercícios nas 6 dimensões do sistema Back to Basics v14.5, usando escala 1-5 (0 para dimensões não aplicáveis como JOE/QUA em exercícios de membros superiores).

## Dimensões:
- **AX (Carga Axial)**: Carga compressiva na coluna vertebral. 1=Nula (deitado/máquina), 2=Baixa (KB frontal/DB leve), 3=Moderada (DB pesado/unilateral em pé), 4=Alta (barra nas costas/trap bar), 5=Máxima (back squat pesado, DL convencional).
- **LOM (Exigência Lombar)**: Demanda sobre a região lombar. 1=Nula (máquina com apoio), 2=Baixa (sentado/supino), 3=Moderada (remada inclinada, carry), 4=Alta (RDL, hinge com barra), 5=Máxima (DL convencional, good morning).
- **TEC (Complexidade Técnica)**: Dificuldade de execução. 1=Simples (máquina, isolado), 2=Baixa (goblet, push-up), 3=Moderada (lunge, RDL), 4=Alta (clean, snatch, front squat), 5=Expert (Olympic lifts complexos).
- **MET (Potencial Metabólico)**: Capacidade de gerar demanda metabólica. 1=Nulo (isolado lento), 2=Baixo (composto pesado/baixas reps), 3=Moderado (composto moderado), 4=Alto (lunge walking, swing), 5=Máximo (trenó, burpee, KB swing alto volume).
- **JOE (Dominância Joelho)**: Envolvimento da cadeia anterior. 0=Nenhum (push/pull MMSS), 1-5=Progressivo. Squat=5, Leg press=5, Lunge=3-4, Hinge=1.
- **QUA (Dominância Quadril)**: Envolvimento da cadeia posterior. 0=Nenhum (push/pull MMSS), 1-5=Progressivo. RDL/Hip thrust=5, Trap bar=4, Squat=2, Box jump=4.

## Exercícios de Referência (calibração):
${REFERENCE_EXERCISES.map(e => `- ${e.name}: AX=${e.AX} LOM=${e.LOM} TEC=${e.TEC} MET=${e.MET} JOE=${e.JOE} QUA=${e.QUA}`).join("\n")}

## Regras:
1. Para exercícios de MMSS puro (push/pull sem demanda de MMII): JOE=0, QUA=0.
2. Para exercícios em máquina com apoio lombar: LOM=1.
3. Para exercícios isométricos/estáticos (prancha, dead bug): MET=1-2, TEC=1-2.
4. Para carries: AX=2, LOM=2-3 (dependendo da posição), TEC=1-2.
5. Para exercícios de core/ativação: AX=1, LOM=1-2, JOE=0, QUA=0.
6. Para exercícios de mobilidade/LMF: todos os valores = 1.
7. Na dúvida, errar para o lado conservador (valor mais alto para segurança).

Classifique TODOS os exercícios fornecidos. Use a tool para retornar os resultados.`;

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
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "LOVABLE_API_KEY não configurada" }),
        { headers: jsonHeaders, status: 500 }
      );
    }

    // Validate user is admin
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(
        JSON.stringify({ success: false, error: "Token inválido" }),
        { headers: jsonHeaders, status: 401 }
      );
    }

    const userId = userData.user.id;
    const { data: roleData, error: roleError } = await userClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["admin"])
      .limit(1);

    if (roleError) {
      return new Response(
        JSON.stringify({ success: false, error: "Falha ao verificar permissões" }),
        { headers: jsonHeaders, status: 500 }
      );
    }

    if (!roleData || roleData.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Acesso restrito a administradores" }),
        { headers: jsonHeaders, status: 403 }
      );
    }

    const body: unknown = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return new Response(
        JSON.stringify({ success: false, error: "Payload inválido" }),
        { headers: jsonHeaders, status: 400 }
      );
    }

    const payload = body as Record<string, unknown>;
    const batchSize = normalizeBatchSize(payload.batchSize);
    const offset = normalizeOffset(payload.offset);
    const onlyUnclassified = normalizeBoolean(payload.onlyUnclassified, true);

    // Use service role to update exercises
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch exercises to classify
    let query = serviceClient
      .from("exercises_library")
      .select("id, name, category, movement_pattern, subcategory, equipment_required, laterality, stability_position")
      .order("name")
      .range(offset, offset + batchSize - 1);

    if (onlyUnclassified) {
      query = query.is("axial_load", null);
    }

    const { data: exercises, error: fetchError } = await query;
    if (fetchError) throw new Error(`Erro ao buscar exercícios: ${fetchError.message}`);

    if (!exercises || exercises.length === 0) {
      return new Response(
        JSON.stringify({ success: true, classified: 0, message: "Nenhum exercício pendente de classificação", hasMore: false }),
        { headers: jsonHeaders }
      );
    }

    // Build prompt with exercise list
    const exerciseList = exercises.map((ex) => ({
      id: ex.id,
      name: ex.name,
      category: ex.category,
      movement_pattern: ex.movement_pattern,
      subcategory: ex.subcategory,
      equipment: ex.equipment_required,
      laterality: ex.laterality,
      position: ex.stability_position,
    }));

    // Call Lovable AI
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Classifique estes ${exercises.length} exercícios nas 6 dimensões (AX, LOM, TEC, MET, JOE, QUA). Use a tool set_classifications para retornar.\n\n${JSON.stringify(exerciseList, null, 2)}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "set_classifications",
              description: "Define as 6 dimensões para cada exercício",
              parameters: {
                type: "object",
                properties: {
                  classifications: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string", description: "ID do exercício" },
                        axial_load: { type: "integer", minimum: 0, maximum: 5 },
                        lumbar_demand: { type: "integer", minimum: 0, maximum: 5 },
                        technical_complexity: { type: "integer", minimum: 0, maximum: 5 },
                        metabolic_potential: { type: "integer", minimum: 0, maximum: 5 },
                        knee_dominance: { type: "integer", minimum: 0, maximum: 5 },
                        hip_dominance: { type: "integer", minimum: 0, maximum: 5 },
                      },
                      required: ["id", "axial_load", "lumbar_demand", "technical_complexity", "metabolic_potential", "knee_dominance", "hip_dominance"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["classifications"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "set_classifications" } },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ success: false, error: "Rate limit excedido. Tente novamente em alguns segundos." }),
          { headers: jsonHeaders, status: 429 }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ success: false, error: "Créditos insuficientes. Adicione créditos ao workspace." }),
          { headers: jsonHeaders, status: 402 }
        );
      }
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const aiData = await response.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall) {
      throw new Error("IA não retornou classificações no formato esperado");
    }

    const { classifications } = JSON.parse(toolCall.function.arguments);

    if (!classifications || !Array.isArray(classifications)) {
      throw new Error("Formato de classificação inválido");
    }

    // Validate and clamp values
    const validIds = new Set(exercises.map((e) => e.id));
    let updated = 0;
    const errors: string[] = [];

    for (const cls of classifications) {
      if (!validIds.has(cls.id)) {
        errors.push(`ID desconhecido: ${cls.id}`);
        continue;
      }

      const clamp = (v: number) => Math.max(0, Math.min(5, Math.round(v || 0)));

      const { error: updateError } = await serviceClient
        .from("exercises_library")
        .update({
          axial_load: clamp(cls.axial_load),
          lumbar_demand: clamp(cls.lumbar_demand),
          technical_complexity: clamp(cls.technical_complexity),
          metabolic_potential: clamp(cls.metabolic_potential),
          knee_dominance: clamp(cls.knee_dominance),
          hip_dominance: clamp(cls.hip_dominance),
        })
        .eq("id", cls.id);

      if (updateError) {
        errors.push(`Erro ao atualizar ${cls.id}: ${updateError.message}`);
      } else {
        updated++;
      }
    }

    // Check if there are more to classify
    const { count } = await serviceClient
      .from("exercises_library")
      .select("id", { count: "exact", head: true })
      .is("axial_load", null);

    return new Response(
      JSON.stringify({
        success: true,
        classified: updated,
        total: exercises.length,
        remaining: count || 0,
        hasMore: (count || 0) > 0,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: jsonHeaders }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("Error classifying exercises:", errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: jsonHeaders, status: 500 }
    );
  }
});
