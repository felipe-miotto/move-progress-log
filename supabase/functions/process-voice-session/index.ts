import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ═══════════════════════════════════════════════════════════════
// IA: OpenAI (migrado de Gemini em 2026-05 — GEMINI_API_KEY estava
// sem cota: 429 FreeTier limit=0). Centraliza IA na OpenAI, mesma
// usada no fluxo DEXA (`extract-dexa-pdf`).
//   - Transcrição: POST /v1/audio/transcriptions (whisper-1)
//   - Extração:    POST /v1/chat/completions (gpt-4.1, JSON mode)
// ═══════════════════════════════════════════════════════════════

const OPENAI_API_BASE = "https://api.openai.com/v1";
/** Modelo de transcrição de áudio (Whisper — aceita webm, estável). */
const OPENAI_TRANSCRIPTION_MODEL = "whisper-1";
/** Modelo de extração estruturada (mesmo do fluxo DEXA). */
const OPENAI_EXTRACTION_MODEL = "gpt-4.1";

/**
 * Detecta erro de quota/billing/rate-limit numa resposta da OpenAI e
 * devolve mensagem humana SEGURA (sem body bruto, sem prompt).
 * Retorna `null` se não for esse tipo de erro.
 */
function describeOpenAiQuotaError(status: number, bodyText: string): string | null {
  const lower = bodyText.toLowerCase();
  if (status === 429 || lower.includes("insufficient_quota") || lower.includes("billing")) {
    return "O serviço de IA está sem cota disponível no momento. Verifique o plano/billing da OpenAI e tente novamente.";
  }
  if (status === 401 || status === 403) {
    return "Falha de autenticação com o serviço de IA. Verifique a OPENAI_API_KEY.";
  }
  return null;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// V-02: Client and AI initialized inside handler to prevent shared state between requests

// ═══════════════════════════════════════════════════════════════
// SHARED: manter sincronizado com voice-session/index.ts
// ═══════════════════════════════════════════════════════════════

/** Constantes de conversão de unidades */
const POUND_TO_KG_CONVERSION = 0.4536;
const DECIMAL_PLACES = 1;

/** Correções terminológicas padrão para transcrição PT-BR */
const TERMINOLOGY_CORRECTIONS: Record<string, string> = {
  'alteres': 'halteres',
  'querobel': 'kettlebell',
  'ketobel': 'kettlebell',
  'quetobell': 'kettlebell',
  'quetobel': 'kettlebell',
  'sandbeg': 'sandbag',
  'land mine': 'landmine',
};

/** Categorias clínicas para observações extraídas */
const CLINICAL_CATEGORIES = ['dor', 'mobilidade', 'força', 'técnica', 'geral'] as const;

/** Níveis de severidade para observações clínicas */
const SEVERITY_LEVELS = {
  ALTA: 'alta',   // Dor aguda, limitações severas
  MEDIA: 'média', // Desconfortos, déficits de ativação
  BAIXA: 'baixa', // Comentários técnicos leves, fadiga normal
} as const;

/** Regras de carga por tipo de equipamento */
const EQUIPMENT_LOAD_RULES = {
  KETTLEBELL_DUPLO: 'Multiplicar por 2 (soma de ambos)',
  HALTERES_DUPLO: 'Multiplicar por 2 (soma de ambos)',
  BARRA_BILATERAL: 'Se "de cada lado" → multiplicar por 2 + barra',
  LANDMINE: 'Apenas carga adicionada, NÃO multiplicar por 2',
  SANDBAG: 'Carga direta, sem multiplicação',
  PESO_CORPORAL: 'Usar weight_kg do aluno se disponível, senão null',
  ELASTICO: 'NUNCA converter para kg, registrar como observação',
} as const;

// ═══════════════════════════════════════════════════════════════
// FIM SHARED
// ═══════════════════════════════════════════════════════════════

const roundToDecimal = (value: number, decimals: number = DECIMAL_PLACES): number => {
  const multiplier = Math.pow(10, decimals);
  return Math.round(value * multiplier) / multiplier;
};

const WEIGHT_TERM_PATTERN = /(?:(\d+(?:[.,]\d+)?)\s*[x×]\s*)?(\d+(?:[.,]\d+)?)\s*(kg|lbs?)/gi;

const parseNumeric = (value: string) => parseFloat(value.replace(',', '.'));

const addWeightTerms = (
  content: string,
  multiplier = 1,
  options: { ignoreBarra?: boolean } = {},
): number => {
  let subtotal = 0;
  for (const match of content.matchAll(WEIGHT_TERM_PATTERN)) {
    const beforeMatch = content.substring(Math.max(0, (match.index ?? 0) - 12), match.index ?? 0);
    if (options.ignoreBarra && /barra\s*(?:de\s*)?$/i.test(beforeMatch)) continue;

    const quantity = match[1] ? parseNumeric(match[1]) : 1;
    const value = parseNumeric(match[2]);
    const unit = match[3].toLowerCase();
    const kg = unit.startsWith('lb') ? value * POUND_TO_KG_CONVERSION : value;
    subtotal += quantity * kg * multiplier;
  }
  return subtotal;
};

// V-04: Max audio size validation (20M chars ≈ 15MB audio)
const MAX_AUDIO_SIZE_CHARS = 20_000_000;

// Processar base64 em chunks para prevenir problemas de memória
function processBase64Chunks(base64String: string, chunkSize = 32768) {
  const chunks: Uint8Array[] = [];
  let position = 0;
  
  while (position < base64String.length) {
    const chunk = base64String.slice(position, position + chunkSize);
    const binaryChunk = atob(chunk);
    const bytes = new Uint8Array(binaryChunk.length);
    
    for (let i = 0; i < binaryChunk.length; i++) {
      bytes[i] = binaryChunk.charCodeAt(i);
    }
    
    chunks.push(bytes);
    position += chunkSize;
  }

  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // V-02: Initialize clients inside handler to prevent shared state
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    // IA via OpenAI. Falha cedo + clara se a chave não estiver configurada.
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Serviço de IA indisponível: OPENAI_API_KEY não configurada.',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Processing voice session
    
    // Validate authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate the caller with the anon key; keep service_role only for privileged reads/writes.
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Verify user authentication
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      // Authentication failed
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { audio, prescriptionId, students, date, time } = await req.json();
    
    // Validate required fields
    if (!audio || !students || !Array.isArray(students) || students.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: audio or students' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // V-04: Validate audio payload size before processing
    if (typeof audio === 'string' && audio.length > MAX_AUDIO_SIZE_CHARS) {
      return new Response(
        JSON.stringify({ error: `Áudio excede o tamanho máximo permitido (~15MB). Tente gravar segmentos menores.` }),
        { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!date || !time) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: date or time' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    

    // Verify trainer owns the prescription (only if prescriptionId is provided)
    if (prescriptionId) {
      const { data: prescription, error: prescriptionError } = await supabaseClient
        .from('workout_prescriptions')
        .select('trainer_id')
        .eq('id', prescriptionId)
        .single();

      if (prescriptionError || !prescription) {
        
        return new Response(
          JSON.stringify({ error: 'Prescription not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (prescription.trainer_id !== user.id) {
        
        return new Response(
          JSON.stringify({ error: 'Unauthorized access to prescription data' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Verify trainer owns all students
    const { data: studentRecords, error: studentsError } = await supabaseClient
      .from('students')
      .select('id, trainer_id')
      .in('id', students.map((s: { id: string }) => s.id));

    if (studentsError || !studentRecords) {
      
      return new Response(
        JSON.stringify({ error: 'Error validating students' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const unauthorizedStudents = studentRecords.filter(s => s.trainer_id !== user.id);
    if (unauthorizedStudents.length > 0) {
      
      return new Response(
        JSON.stringify({ error: 'Unauthorized access to one or more students' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    
    
    // 1️⃣ Transcrever áudio via OpenAI (Whisper).
    const binaryAudio = processBase64Chunks(audio);

    /**
     * Dica de vocabulário para o Whisper (campo `prompt`, máx ~224
     * tokens). Lista termos técnicos de treino com a grafia CORRETA
     * para reduzir transcrição errada. Correções determinísticas de
     * termos mal-transcritos são aplicadas DEPOIS via
     * TERMINOLOGY_CORRECTIONS (string replace no resultado).
     */
    const whisperVocabularyHint =
      'Termos de treino: halteres, kettlebell, sandbag, landmine, ' +
      'supino, agachamento, barra, anilha, libras, quilos.';

    // V-06: AbortController with 30s timeout for transcription
    const transcriptionController = new AbortController();
    const transcriptionTimeout = setTimeout(() => transcriptionController.abort(), 30_000);

    let transcription: string;
    try {
      const audioBlob = new Blob([binaryAudio], { type: 'audio/webm' });
      const transcriptionForm = new FormData();
      transcriptionForm.append('file', audioBlob, 'audio.webm');
      transcriptionForm.append('model', OPENAI_TRANSCRIPTION_MODEL);
      transcriptionForm.append('language', 'pt');
      transcriptionForm.append('prompt', whisperVocabularyHint);
      transcriptionForm.append('response_format', 'json');

      const transcriptionResponse = await fetch(
        `${OPENAI_API_BASE}/audio/transcriptions`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
          body: transcriptionForm,
          signal: transcriptionController.signal,
        },
      );

      if (!transcriptionResponse.ok) {
        // Lê o body só para classificar quota/billing — NUNCA expõe
        // o corpo bruto ao client (pode conter detalhes internos).
        const errText = await transcriptionResponse.text().catch(() => '');
        const quotaMsg = describeOpenAiQuotaError(transcriptionResponse.status, errText);
        clearTimeout(transcriptionTimeout);
        return new Response(
          JSON.stringify({
            success: false,
            error: quotaMsg ?? 'Falha ao transcrever o áudio. Tente novamente.',
          }),
          {
            status: transcriptionResponse.status === 429 ? 429 : 502,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        );
      }

      const transcriptionJson = (await transcriptionResponse.json()) as { text?: string };
      transcription = typeof transcriptionJson.text === 'string' ? transcriptionJson.text : '';
    } catch (err) {
      clearTimeout(transcriptionTimeout);
      if ((err as Error).name === 'AbortError') {
        return new Response(
          JSON.stringify({ error: 'Transcrição excedeu o tempo limite (30s). Tente gravar um áudio mais curto.' }),
          { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw err;
    }
    clearTimeout(transcriptionTimeout);

    // Correções terminológicas determinísticas — aplica os pares de
    // TERMINOLOGY_CORRECTIONS como substituição case-insensitive no
    // texto transcrito. Mais robusto que depender só do modelo.
    for (const [wrong, right] of Object.entries(TERMINOLOGY_CORRECTIONS)) {
      transcription = transcription.replace(
        new RegExp(wrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
        right,
      );
    }


    // 2️⃣ Buscar detalhes completos da prescrição (se fornecida)
    let prescriptionDetails = null;
    
    if (prescriptionId) {
      const { data: prescDetailsData, error: prescDetailsError } = await supabaseClient
        .from('workout_prescriptions')
        .select('id, name, prescription_exercises (id, sets, reps, order_index, should_track, exercises_library (name))')
        .eq('id', prescriptionId)
        .single();
      
      if (prescDetailsError || !prescDetailsData) {
        
        throw new Error('Erro ao buscar detalhes da prescrição');
      }
      
      prescriptionDetails = prescDetailsData;
    }

    const studentsInfo = students
      .map((s: { name: string; weight_kg?: number }) => `  - ${s.name}${s.weight_kg ? ` (peso: ${s.weight_kg} kg)` : ' (peso não cadastrado)'}`)
      .join('\n');
    
    const exercisesInfo = prescriptionDetails 
      ? prescriptionDetails.prescription_exercises
          .filter((ex: Record<string, unknown>) => ex.should_track !== false)
          .map((ex: Record<string, unknown>) => `  ${(ex.order_index as number) + 1}. ${(ex.exercises_library as Record<string, unknown>).name}: ${ex.sets} séries × ${ex.reps} reps`)
          .join('\n')
      : '  (Sessão livre - sem prescrição definida)';

    // 3️⃣ Processar com OpenAI para extrair dados estruturados
    
    
    const systemPrompt = `Você é o sistema oficial de consolidação de cargas da Fabrik.
Sua função é interpretar transcrições de treino em português (PT-BR), tolerando ruído, interrupções, correções e comentários paralelos, e extrair apenas os dados estruturais finais.

PRIORIDADE: Exatidão matemática > Fidelidade ao áudio > Clareza estrutural

❌ PROIBIÇÕES ABSOLUTAS:
- Nunca invente dados
- Nunca infira repetições não mencionadas
- Nunca assuma pesos não informados
- Nunca use memória histórica
- Nunca estime peso de elástico

CONTEXTO DA SESSÃO:
📅 Data: ${date}
⏰ Hora: ${time}

👥 ALUNOS PRESENTES:
${studentsInfo}

💪 EXERCÍCIOS PRESCRITOS:
${exercisesInfo}

INSTRUÇÕES CRÍTICAS (PADRÃO FABRIK):

1. **Repetições (reps)**: 
   - **REGRA CRÍTICA**: Se o áudio mencionar o exercício mas NÃO especificar reps, você DEVE marcar como null
   - **NUNCA USE 0 (ZERO)**: Use sempre null quando não mencionado
   - Exemplo: "fez 3 séries de agachamento" → reps: null (não especificou quantas repetições)
   - Exemplo: "agachamento, 8 repetições" → reps: 8
   - **NUNCA invente valores de reps que não foram mencionados**

2. **Séries**: Use null se não mencionado (usará valor prescrito)

**CRÍTICO - REGRA DE EXERCÍCIOS NÃO MENCIONADOS**:
   - Se um exercício foi PRESCRITO mas NÃO foi mencionado no áudio: NÃO inclua esse exercício no resultado
   - Apenas registre exercícios que foram EXPLICITAMENTE mencionados no áudio
   - Se o áudio menciona "fez agachamento" mas não menciona outros exercícios prescritos, registre APENAS o agachamento
   - NUNCA preencha exercícios automaticamente da prescrição se eles não foram mencionados

🔁 **CORREÇÕES NO MEIO DO ÁUDIO (CRÍTICO)**:
   - Se houver correção durante a gravação:
     * "anota 20" (substituindo valor anterior)
     * "não é 17,5, é 20"
     * "corrige pra 25"
   - → considerar APENAS a carga final corrigida
   - → descartar valores anteriores que foram explicitamente corrigidos

**IMPORTANTE - PESO CORPORAL (CÁLCULO AUTOMÁTICO)**:
   - Se o exercício usa "peso corporal" ou "PC" e você TEM o peso do aluno (weight_kg):
     * SEMPRE calcule automaticamente: load_kg = weight_kg do aluno
     * load_breakdown: "Peso corporal = [weight_kg] kg"
     * Exemplo: Se aluno pesa 75 kg → load_breakdown: "Peso corporal = 75.0 kg", load_kg: 75.0
   - Se NÃO tiver o peso do aluno:
     * load_breakdown: "Peso corporal"
     * load_kg: null

**IMPORTANTE - ELÁSTICO / BANDA (AUXÍLIO)**:
   - Se o exercício usa elástico como auxílio:
     * load_breakdown: "Peso corporal" (ou com valor se disponível)
     * observations: "Auxílio do elástico [cor]" (ex: "Auxílio do elástico roxo")
     * NUNCA converter elástico para kg
     * NUNCA estimar peso do elástico

3. **Carga - FORMATO OBRIGATÓRIO DE load_breakdown**:
   
   a) **load_breakdown** (descrição completa da montagem):
      - **REGRA CRÍTICA**: Quando houver múltiplos pesos de cada lado, TODOS devem estar DENTRO do parêntese
      - ✅ CORRETO: "(25 lb + 2 kg + 1 kg) de cada lado + barra 10 kg"
      - ❌ ERRADO: "(25 lb) de cada lado + 2 kg + barra 10 kg"
      
      **KETTLEBELLS DUPLOS (CRÍTICO)**:
      - "duplo kettlebell de 32 kg" → load_breakdown: "2 kettlebells de 32 kg", load_kg: 64.0
      - "kettlebell duplo de 24 kg" → load_breakdown: "2 kettlebells de 24 kg", load_kg: 48.0
      - "2 kettlebells de 28 kg" → load_breakdown: "2 kettlebells de 28 kg", load_kg: 56.0
      - "dois halteres de 15 kg" → load_breakdown: "2 halteres de 15 kg", load_kg: 30.0
      
      **LANDMINE (CRÍTICO - NÃO multiplicar por 2)**:
      - Landmine usa apenas carga adicionada, NÃO multiplica por 2
      - "Landmine press com 15 kg" → load_breakdown: "15 kg", load_kg: 15.0
      - Se peso da barra não for informado → registrar normalmente + incluir alerta nas observations
      
      **SANDBAG**:
      - Carga direta, sem multiplicação
      - "Sandbag de 20 kg" → load_breakdown: "20 kg", load_kg: 20.0
      
      **Exemplos válidos:**
      - "(10 lb + 5 kg) de cada lado + barra 20 kg"
      - "15 kg" (peso único, sem barra)
      - "2 kettlebells de 32 kg" (peso duplo, SEM barra)
      - "Peso corporal" (exercícios sem carga externa)
      
      - Se não mencionado: null
   
   b) **load_kg** (total convertido, 1 casa decimal):
      - Se carga foi mencionada: calcule o total em kg
      - ARREDONDE para 1 CASA DECIMAL
      - Se não mencionado: null

4. **Conversão de Libras (PADRÃO FABRIK)**:
   - **1 lb = 0.4536 kg** (padrão Fabrik)
   - Converter antes de somar. Arredondar apenas no resultado final.
   - **ATENÇÃO: "de cada lado" significa multiplicar por 2**
   - **CÁLCULO OBRIGATÓRIO**: Se load_breakdown foi preenchido, load_kg NUNCA pode ser null
   
   **BARRA BILATERAL**:
   - Se disser "X kg" sem especificar lado → assumir que é por lado e multiplicar por 2
   - Se disser "de cada lado" → multiplicar por 2
   - Se peso da barra não for informado → NÃO inventar, registrar sem barra, incluir alerta
   
   Exemplos detalhados:
   
   a) "25 kg"
      * load_breakdown: "25 kg"
      * load_kg: 25.0
   
   b) "25 lb de cada lado + barra 10 kg"
      * Passo 1: 25 lb = 25 × 0.45 = 11.3 kg (por lado)
      * Passo 2: 11.3 × 2 lados = 22.6 kg
      * Passo 3: 22.6 + 10 (barra) = 32.6 kg
      * load_breakdown: "(25 lb) de cada lado + barra 10 kg"
      * load_kg: 32.6
   
   c) "15 lb + 2 kg de cada lado + barra 10 kg"
      * Passo 1: 15 lb = 15 × 0.45 = 6.8 kg
      * Passo 2: (6.8 + 2) × 2 lados = 17.6 kg
      * Passo 3: 17.6 + 10 (barra) = 27.6 kg
      * load_breakdown: "(15 lb + 2 kg) de cada lado + barra 10 kg"
      * load_kg: 27.6

**CASOS ESPECIAIS DE UNIDADES MISTAS (CRÍTICO)**:

=== CENÁRIO A: UMA LIBRA + UM QUILO DE CADA LADO ===
Áudio: "25 lb e 5 kg de cada lado, barra 20 kg"
Cálculo: (25 × 0.45 + 5) × 2 + 20 = (11.25 + 5) × 2 + 20 = 32.5 + 20 = 52.5 kg
JSON ESPERADO:
{
  "load_breakdown": "(25 lb + 5 kg) de cada lado + barra 20 kg",
  "load_kg": 52.5
}

=== CENÁRIO B: DUAS LIBRAS + DOIS QUILOS DE CADA LADO ===
Áudio: "25 lb, 10 lb, 5 kg e 2 kg de cada lado, barra 15 kg"
Cálculo: (25×0.45 + 10×0.45 + 5 + 2) × 2 + 15 = (11.25 + 4.5 + 7) × 2 + 15 = 45.5 + 15 = 60.5 kg
JSON ESPERADO:
{
  "load_breakdown": "(25 lb + 10 lb + 5 kg + 2 kg) de cada lado + barra 15 kg",
  "load_kg": 60.5
}

=== CENÁRIO C: PESO TOTAL (SEM "DE CADA LADO") ===
Áudio: "Fez com 40 kg na barra"
JSON ESPERADO:
{
  "load_breakdown": "40 kg",
  "load_kg": 40.0
}

⚠️ REGRA CRÍTICA PARA UNIDADES MISTAS:
- TODOS os pesos (lb E kg) devem estar DENTRO do mesmo parêntese
- ❌ ERRADO: "(25 lb) de cada lado + 5 kg + barra 20 kg"
- ✅ CORRETO: "(25 lb + 5 kg) de cada lado + barra 20 kg"

**EXEMPLOS PRÁTICOS DE CARGA (14 CENÁRIOS REAIS)**:

a) **Peso corporal COM registro:**
   Áudio: "Fez flexão de braço"
   Aluno: peso = 80 kg
   → load_breakdown: "Peso corporal = 80.0 kg"
   → load_kg: 80.0

b) **Peso corporal SEM registro:**
   Áudio: "Fez flexão de braço"
   Aluno: peso não cadastrado
   → load_breakdown: "Peso corporal"
   → load_kg: null

c) **Kettlebell simples:**
   Áudio: "Levantamento terra com kettlebell de 32 kg"
   → load_breakdown: "32 kg"
   → load_kg: 32.0

d) **2 Kettlebells (CRÍTICO - SEMPRE MULTIPLICAR POR 2):**
   Áudio: "Agachamento com 2 kettlebells de 24 kg"
   → load_breakdown: "2 kettlebells de 24 kg"
   → load_kg: 48.0
   
e) **Duplo kettlebell (MESMA REGRA):**
   Áudio: "Remada com duplo kettlebell de 28 kg"
   → load_breakdown: "2 kettlebells de 28 kg"
   → load_kg: 56.0

f) **Halter simples (cada mão):**
   Áudio: "Rosca com halteres de 12 kg cada"
   → load_breakdown: "2 halteres de 12 kg"
   → load_kg: 24.0

g) **Barra + anilhas em LB de cada lado:**
   Áudio: "Supino com 45 lb de cada lado e barra de 20 kg"
   → Cálculo: 45 lb × 0.45 = 20.3 kg → 20.3 × 2 = 40.6 kg → 40.6 + 20 = 60.6 kg
   → load_breakdown: "(45 lb) de cada lado + barra 20 kg"
   → load_kg: 60.6

h) **Anilhas mistas (lb + kg) de cada lado:**
   Áudio: "Agachamento com 25 lb e 5 kg de cada lado, barra 10 kg"
   → Cálculo: (25 × 0.45 + 5) × 2 + 10 = (11.3 + 5) × 2 + 10 = 32.6 + 10 = 42.6 kg
   → load_breakdown: "(25 lb + 5 kg) de cada lado + barra 10 kg"
   → load_kg: 42.6

i) **Múltiplas anilhas de cada lado (CRÍTICO - TODAS DENTRO DO PARÊNTESE):**
   Áudio: "Terra com 25 lb, 2 kg e 1 kg de cada lado, barra 15 kg"
   → Cálculo: (25 × 0.45 + 2 + 1) × 2 + 15 = (11.3 + 3) × 2 + 15 = 28.6 + 15 = 43.6 kg
   → load_breakdown: "(25 lb + 2 kg + 1 kg) de cada lado + barra 15 kg"
   → load_kg: 43.6

j) **Anilhas diferentes em cada lado (raro mas possível):**
   Áudio: "Agachamento assimétrico, lado direito 20 kg, lado esquerdo 15 kg, barra 10 kg"
   → load_breakdown: "20 kg (dir) + 15 kg (esq) + barra 10 kg"
   → load_kg: 45.0

k) **Carga não mencionada:**
   Áudio: "Fez 3 séries de agachamento com 10 repetições"
   → load_breakdown: null
   → load_kg: null

l) **Exercício sem carga externa:**
   Áudio: "Prancha isométrica por 60 segundos"
   → load_breakdown: "Peso corporal = 75.0 kg" (se peso cadastrado)
   → load_kg: 75.0

m) **Landmine (NÃO multiplicar por 2):**
   Áudio: "Landmine press com 15 kg"
   → load_breakdown: "15 kg"
   → load_kg: 15.0

n) **Sandbag (carga direta):**
   Áudio: "Carry com sandbag de 30 kg"
   → load_breakdown: "30 kg"
   → load_kg: 30.0

**REGRAS PARA CAMPOS NÃO PREENCHIDOS**:
- Se a carga NÃO foi mencionada no áudio:
  * load_breakdown: null (não "", não "não informado")
  * load_kg: null (não 0)
- Se as repetições NÃO foram mencionadas:
  * reps: null (não 0, não "")
- Se as séries NÃO foram mencionadas:
  * sets: null (não 0, não "")
- Se NÃO há observações sobre o exercício:
  * observations: null (não "", não "sem observações")

**CRÍTICO**: NUNCA use strings vazias "" ou valores 0 para dados não informados. SEMPRE use null.

5. **Nome do Exercício**:
   - Incluir tipo de pegada quando mencionado
   - Exemplos: "Afundo (pegada taça)", "Remada unilateral (halter)"

6. **is_best_set**:
   - Registrar apenas a MAIOR CARGA da sessão por exercício
   - Sempre true

7. **Observações Técnicas** (campo observations):
   - Incluir: "carga submáxima", "dificuldade perna X", "boa execução"
   - Incluir qualquer comentário técnico relevante
   - Incluir alertas de precisão quando aplicável:
     * Peso da barra não informado → "⚠️ Peso da barra não informado"
     * Substituição de exercício → "⚠️ Substituição: [original] → [substituto]"

8. **Observações Clínicas** (campo separado clinical_observations):
   - Extraia: DOR, DESCONFORTO, LIMITAÇÕES, DÉFICITS DE MOBILIDADE/ATIVAÇÃO
   - **CAPITALIZE a primeira letra de cada observation_text**
   - Exemplo: "dor no joelho" → "Dor no joelho"
   - UMA observação pode ter MÚLTIPLAS categorias
   - Categorias possíveis: "dor", "mobilidade", "força", "técnica", "geral"
   
   **CLASSIFICAÇÃO DE SEVERIDADE (CRÍTICO)**:
   - **ALTA**: Dor aguda, limitações severas que impedem o exercício
     * Exemplo: "Dor intensa no joelho que impediu o agachamento"
   - **MÉDIA**: Desconfortos, déficits de ativação, limitações moderadas
     * Exemplo: "Desconforto no quadril por déficit de ativação do glúteo"
   - **BAIXA**: Comentários técnicos leves, fadiga normal
     * Exemplo: "Leve cansaço ao final da série"
   
   **REGRA GERAL**: Qualquer DOR, DESCONFORTO ou DÉFICIT deve ser no mínimo "média"

🎯 **PONTOS DE ATENÇÃO TÉCNICOS** (campo tech_points - gerar apenas quando houver):
   - Dor ou desconforto relatado
   - Técnica comprometida
   - Carga claramente submáxima
   - Progressão evidente
   - Substituição por limitação
   - Curto. Técnico. Objetivo. Sem diagnóstico médico.

9. **reserve_reps** (Reserva — repetições em reserva):
   - Campo de TEXTO LIVRE (não número). Exemplos válidos:
     * "2-3"   → reserva de 2 a 3 repetições
     * "0"     → falhou na repetição alvo / atingiu o limite
     * "RM"    → repetições máximas (sinônimo de reserva 0)
     * "4+"    → reserva alta
   - **MAPEAMENTOS OBRIGATÓRIOS** (vindo do áudio → reserve_reps):
     * "RM" / "repetições máximas" / "máximas" / "falha técnica"
       / "até a falha" → reserve_reps: "0"
     * "2 a 3 de reserva" / "duas a três de reserva" → reserve_reps: "2-3"
     * "zero de reserva" / "sem reserva" → reserve_reps: "0"
     * número solto após "reserva" / "RIR" → reserve_reps com aquele número
   - **NÃO INFERIR** a partir de "submáxima" sozinho:
     * "carga submáxima" → reserve_reps: null + observations: "Submáxima"
     * "fez submáxima" → reserve_reps: null + observations: "Submáxima"
   - Se o coach não mencionar reserva, repetições máximas ou falha
     técnica explicitamente → reserve_reps: null (NÃO inventar).
   - Reserva NUNCA substitui o campo reps: ambos coexistem.

10. **prescribed_exercise_name** (IMPORTANTE):
   - Tente SEMPRE associar o exercício executado com um dos exercícios prescritos
   - Compare o nome executado com a lista de exercícios prescritos
   - Se houver correspondência (mesmo que parcial), use o nome prescrito
   - Exemplos:
     * Executado: "Agachamento taça" → Prescrito: "Agachamento goblet"
     * Executado: "Remada halter" → Prescrito: "Remada unilateral"
   - Se não houver correspondência clara: null

FORMATO DE SAÍDA:
{
  "sessions": [
    {
      "student_name": "nome do aluno",
      "clinical_observations": [
        {
          "observation_text": "descrição da observação",
          "categories": ["dor", "mobilidade"],
          "severity": "baixa|média|alta"
        }
      ],
      "tech_points": ["ponto técnico 1", "ponto técnico 2"],
      "precision_alerts": ["Peso da barra não informado no supino", "Repetições ausentes no agachamento"],
      "exercises": [
        {
          "prescribed_exercise_name": "nome do exercício prescrito (ou null)",
          "executed_exercise_name": "nome executado (com pegada)",
          "sets": número ou null,
          "reps": número ou null,
          "reserve_reps": "texto livre da reserva (ou null) — ex: 2-3, 0, RM, 4+",
          "load_kg": número com 1 casa decimal (ex: 25.0) ou null,
          "load_breakdown": "descrição EXATA ou null",
          "observations": "observações técnicas ou null",
          "is_best_set": true
        }
      ]
    }
  ]
}`;

    // 3️⃣ Extração estruturada via OpenAI Chat Completions em JSON mode.
    // `response_format: json_object` garante JSON válido — o systemPrompt
    // já descreve o contrato detalhado e menciona "JSON" (requisito do
    // modo). `temperature: 0` para extração determinística.
    const extractionResponse = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_EXTRACTION_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `Transcrição da sessão:\n\n${transcription}`,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
      }),
    });

    if (!extractionResponse.ok) {
      const errText = await extractionResponse.text().catch(() => '');
      const quotaMsg = describeOpenAiQuotaError(extractionResponse.status, errText);
      return new Response(
        JSON.stringify({
          success: false,
          error: quotaMsg ?? 'Falha ao extrair os dados da sessão. Tente novamente.',
        }),
        {
          status: extractionResponse.status === 429 ? 429 : 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const extractionJson = (await extractionResponse.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const extractionContent = extractionJson.choices?.[0]?.message?.content ?? '';
    let extractedData: { sessions?: Array<Record<string, unknown>> };
    try {
      extractedData = JSON.parse(extractionContent) as { sessions?: Array<Record<string, unknown>> };
    } catch {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'A IA retornou um formato inesperado. Tente gravar novamente.',
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    
    // Preservar exercícios mencionados sem reps e marcá-los para input manual
    if (extractedData.sessions) {
      extractedData.sessions.forEach((session: Record<string, unknown>) => {
        if (session.exercises) {
          session.exercises = (session.exercises as Record<string, unknown>[]).map((ex: Record<string, unknown>) => {
            if (!ex.reps || ex.reps === 0) {
              // REGRA FABRIK: usar null para dados não informados, NUNCA 0
              return {
                ...ex,
                reps: null,
                sets: ex.sets || null,
                load_kg: ex.load_kg || null,
                observations: ex.observations 
                  ? `🔴 EXERCÍCIO MENCIONADO SEM REPETIÇÕES - PREENCHER MANUALMENTE\n\n${ex.observations}`
                  : '🔴 EXERCÍCIO MENCIONADO SEM REPETIÇÕES - PREENCHER MANUALMENTE',
                needs_manual_input: true
              };
            }
            return ex;
          });
        }
      });
    }
    
    // Função para normalizar load_breakdown com erros de formato
    function normalizeBreakdown(breakdown: string): string {
      // Tolera "de cada lado" E "cada lado" (sem "de") — o LLM às vezes
      // omite a preposição e os usuários também. Regex única, alinhada
      // com o cliente em `src/utils/loadCalculation.ts`.
      const eachSidePattern = /(?:de\s*)?cada\s*lado/i;
      const hasEachSide = eachSidePattern.test(breakdown);
      if (!hasEachSide) return breakdown;

      const match = breakdown.match(/\((.*?)\)\s*(?:de\s*)?cada\s*lado(.*?)(?:barra|\+\s*barra|$)/i);
      if (!match) return breakdown;
      
      const insideParens = match[1];
      const afterEachSide = match[2].trim();
      const barraMatch = breakdown.match(/(barra\s+\d+(?:\.\d+)?\s*kg)/i);
      const barra = barraMatch ? barraMatch[1] : '';

      const looseWeights: string[] = [];
      const weightRegex = /(\d+(?:\.\d+)?)\s*(kg|lb)/gi;
      let weightMatch;

      while ((weightMatch = weightRegex.exec(afterEachSide)) !== null) {
        looseWeights.push(`${weightMatch[1]} ${weightMatch[2]}`);
      }

      if (looseWeights.length === 0) return breakdown;

      // Output canônico SEMPRE com "de cada lado".
      const newInsideParens = [insideParens, ...looseWeights].join(' + ');
      return `(${newInsideParens}) de cada lado${barra ? ' + ' + barra : ''}`;
    }

    // Função auxiliar para calcular carga (ROBUSTA)
    // ════════════════════════════════════════════════════════════════
    // calculateLoadFromBreakdown — parser por GRAMÁTICA DE COMPONENTES
    //
    // Espelho do cliente em `src/utils/loadCalculation.ts`. Deno não
    // importa do bundle do app, então mantemos cópia textual. Qualquer
    // mudança na semântica DEVE ser aplicada nos DOIS lugares.
    //
    // Aceita `exerciseName` opcional para ativar heurísticas de contexto
    // (landmine, barra bilateral) — extraído do payload do LLM via
    // `exercise.executed_exercise_name` ou `exercise.prescribed_exercise_name`.
    // ════════════════════════════════════════════════════════════════

    const BILATERAL_BARBELL_KEYWORDS = [
      'supino',
      'agachamento',
      'levantamento terra',
      'deadlift',
      'remada com barra',
      'remada curvada',
      'bench press',
      'barra fixa',
      'press militar',
      'desenvolvimento com barra',
      'stiff',
      'front squat',
      'back squat',
      'high bar',
      'low bar',
    ];

    const UNILATERAL_KEYWORDS = [
      'unilateral',
      'um braço',
      'um lado',
      'uma mão',
      'single arm',
      'single leg',
    ];

    const BODYWEIGHT_WITH_VALUE_RE = /peso\s*corporal\s*=\s*(\d+(?:[.,]\d+)?)\s*kg/i;
    const BODYWEIGHT_RE = /peso\s*corporal/i;
    const ELASTIC_RE = /\bel[áa]stico\b|\bbanda\b|\belastic\b|\bband\b/i;
    const UNKNOWN_PLATE_RE = /\bplaca\s+\d+(?!\s*(?:kg|lb|x))\b/i;
    const WEIGHT_TERM_RE = /(?:(\d+(?:[.,]\d+)?)\s*x\s*)?(\d+(?:[.,]\d+)?)\s*(kg|lb)\b/gi;
    const BAR_RE = /\bbarra\s+(\d+(?:[.,]\d+)?)\s*(kg|lb)\b/i;
    const DUAL_IMPLEMENT_RE =
      /\b(\d+)\s*(?:halteres?|kettlebells?)\s+(?:de\s+)?(\d+(?:[.,]\d+)?)\s*(kg|lb)\b|\b(?:duplo\s*kettlebell|kettlebell\s*duplo)\s+(?:de\s+)?(\d+(?:[.,]\d+)?)\s*(kg|lb)\b/i;

    function normalizeText(input: string): string {
      let t = input.toLowerCase();
      t = t.replace(/[×*]/g, 'x');
      t = t.replace(/\blibras?\b|\bpounds?\b|\blbs\b/gi, 'lb');
      t = t.replace(/\bquilogramas?\b|\bquilos?\b|\bkgs\b/gi, 'kg');
      t = t.replace(/\bpar\s+de\s+halteres?\b/gi, '2 halteres');
      t = t.replace(/\bdumbbells?\b/gi, 'halteres');
      t = t.replace(/\bdb\b/gi, 'halteres');
      t = t.replace(/\bdois\b/gi, '2');
      t = t.replace(
        /\bbarra\s+(?:de\s+)?(\d+(?:[.,]\d+)?)(?:\s*(kg|lb))?\b/gi,
        (_m, num: string, unit?: string) => `barra ${num}${(unit ?? 'kg').toLowerCase()}`,
      );
      let openCount = 0;
      let closeCount = 0;
      for (const ch of t) {
        if (ch === '(') openCount += 1;
        if (ch === ')') closeCount += 1;
      }
      while (closeCount > openCount) {
        const lastIdx = t.lastIndexOf(')');
        if (lastIdx < 0) break;
        t = t.slice(0, lastIdx) + t.slice(lastIdx + 1);
        closeCount -= 1;
      }
      return t;
    }

    function decideContext(normalizedText: string, exerciseName: string | null) {
      const exLower = (exerciseName ?? '').toLowerCase();
      const isLandmine =
        exLower.includes('landmine') || /\blandmine\b/.test(normalizedText);
      const isUnilateralHint =
        UNILATERAL_KEYWORDS.some((k) => exLower.includes(k)) ||
        UNILATERAL_KEYWORDS.some((k) => normalizedText.includes(k));
      const isBilateralBarbell =
        !isLandmine &&
        !isUnilateralHint &&
        !!exerciseName &&
        BILATERAL_BARBELL_KEYWORDS.some((k) => exLower.includes(k));
      return { isLandmine, isBilateralBarbell, isUnilateralHint };
    }

    type WeightTerm = { quantity: number; explicitQuantity: boolean; valueKg: number };

    function extractWeightTerms(content: string): WeightTerm[] {
      const out: WeightTerm[] = [];
      WEIGHT_TERM_RE.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = WEIGHT_TERM_RE.exec(content)) !== null) {
        const hasQuantity = Boolean(match[1]);
        const quantity = hasQuantity ? parseFloat(match[1]!.replace(',', '.')) : 1;
        const value = parseFloat(match[2].replace(',', '.'));
        const unit = match[3].toLowerCase();
        const valueKg = unit === 'lb' ? value * POUND_TO_KG_CONVERSION : value;
        out.push({ quantity, explicitQuantity: hasQuantity, valueKg });
      }
      return out;
    }

    function extractBar(text: string): { kg: number; range: [number, number] } | null {
      const m = text.match(BAR_RE);
      if (!m || m.index === undefined) return null;
      const value = parseFloat(m[1].replace(',', '.'));
      const unit = m[2].toLowerCase();
      const kg = unit === 'lb' ? value * POUND_TO_KG_CONVERSION : value;
      return { kg, range: [m.index, m.index + m[0].length] };
    }

    function extractDualImplement(text: string): { kg: number; range: [number, number] } | null {
      const m = text.match(DUAL_IMPLEMENT_RE);
      if (!m || m.index === undefined) return null;
      let value: number;
      let unit: string;
      if (m[1]) {
        const declaredQty = parseInt(m[1], 10);
        if (declaredQty < 2) return null;
        value = parseFloat(m[2].replace(',', '.'));
        unit = m[3].toLowerCase();
      } else {
        value = parseFloat(m[4].replace(',', '.'));
        unit = m[5].toLowerCase();
      }
      const kgEach = unit === 'lb' ? value * POUND_TO_KG_CONVERSION : value;
      return { kg: kgEach * 2, range: [m.index, m.index + m[0].length] };
    }

    function extractEachSide(text: string): { innerContent: string; range: [number, number] } | null {
      const parenRe = /\(([^()]*)\)\s*(?:de\s+)?cada\s+lado/i;
      const parenMatch = text.match(parenRe);
      if (parenMatch && parenMatch.index !== undefined) {
        return {
          innerContent: parenMatch[1],
          range: [parenMatch.index, parenMatch.index + parenMatch[0].length],
        };
      }
      const eachSideRe = /(?:de\s+)?cada\s+lado/i;
      const m = text.match(eachSideRe);
      if (!m || m.index === undefined) return null;
      const phraseEnd = m.index + m[0].length;
      let start = 0;
      const slice = text.slice(0, m.index);
      const barMatchBefore = slice.match(BAR_RE);
      if (barMatchBefore && barMatchBefore.index !== undefined) {
        start = barMatchBefore.index + barMatchBefore[0].length;
      }
      const innerContent = text.slice(start, m.index).trim();
      return { innerContent, range: [start, phraseEnd] };
    }

    function sumTerms(terms: WeightTerm[], multiplier: 1 | 2): number {
      let sum = 0;
      for (const term of terms) {
        if (multiplier === 2 && !term.explicitQuantity) {
          sum += term.quantity * term.valueKg * 2;
        } else {
          sum += term.quantity * term.valueKg;
        }
      }
      return sum;
    }

    function removeRange(text: string, range: [number, number]): string {
      return text.slice(0, range[0]) + ' ' + text.slice(range[1]);
    }

    function calculateLoadFromBreakdown(
      breakdown: string | null,
      exerciseName: string | null = null,
    ): number | null {
      if (!breakdown || !breakdown.trim()) return null;
      try {
        const normalized = normalizeText(breakdown.trim());
        const ctx = decideContext(normalized, exerciseName);

        // Early returns
        const bwMatch = normalized.match(BODYWEIGHT_WITH_VALUE_RE);
        if (bwMatch) {
          return roundToDecimal(parseFloat(bwMatch[1].replace(',', '.')));
        }
        if (BODYWEIGHT_RE.test(normalized) && !bwMatch) {
          // Edge não tem studentWeight — devolve null (mesmo path antigo).
          return null;
        }
        if (ELASTIC_RE.test(normalized)) return null;
        if (UNKNOWN_PLATE_RE.test(normalized)) return null;

        let remaining = normalized;
        let total = 0;

        const eachSide = extractEachSide(remaining);
        if (eachSide) {
          const innerTerms = extractWeightTerms(eachSide.innerContent);
          const multiplier = ctx.isLandmine ? 1 : 2;
          total += sumTerms(innerTerms, multiplier as 1 | 2);
          remaining = removeRange(remaining, eachSide.range);
        }

        if (!ctx.isUnilateralHint) {
          const dual = extractDualImplement(remaining);
          if (dual) {
            total += dual.kg;
            remaining = removeRange(remaining, dual.range);
          }
        }

        const bar = extractBar(remaining);
        if (bar) {
          total += bar.kg;
          remaining = removeRange(remaining, bar.range);
        }

        const looseTerms = extractWeightTerms(remaining);
        if (looseTerms.length > 0) {
          const onlyImplicitSingle =
            looseTerms.length === 1 && !looseTerms[0].explicitQuantity;
          const inferBilateralX2 =
            ctx.isBilateralBarbell && !eachSide && bar !== null && onlyImplicitSingle;
          const multiplier: 1 | 2 = inferBilateralX2 ? 2 : 1;
          total += sumTerms(looseTerms, multiplier);
        }

        return total > 0 ? roundToDecimal(total) : null;
      } catch {
        return null;
      }
    }
    
    // Sanitizar dados (converter 0 e "" para null)
    function sanitizeExerciseData(exercise: Record<string, unknown>) {
      const fieldsToSanitize = ['load_kg', 'load_breakdown', 'reps', 'sets', 'observations'];
      for (const field of fieldsToSanitize) {
        if (exercise[field] === 0 || exercise[field] === '' || exercise[field] === 'não informado') {
          exercise[field] = null;
        }
      }
    }

    // Validar e recalcular load_kg se necessário
    function validateAndRecalculateLoad(exercise: Record<string, unknown>, _sessionIdx: number, _exIdx: number) {
      sanitizeExerciseData(exercise);
      
      if (!exercise.load_breakdown) {
        if (exercise.load_kg !== null) exercise.load_kg = null;
        return;
      }
      
      exercise.load_breakdown = normalizeBreakdown(exercise.load_breakdown as string);
      // Passa o nome do exercício como contexto para o calculator —
      // ativa heurísticas de landmine / barra bilateral. Usa
      // executed_exercise_name (preferido) com fallback pra prescribed_exercise_name.
      const exerciseNameForContext =
        (exercise.executed_exercise_name as string | undefined) ??
        (exercise.prescribed_exercise_name as string | undefined) ??
        null;
      const calculatedLoadKg = calculateLoadFromBreakdown(
        exercise.load_breakdown as string,
        exerciseNameForContext,
      );
      
      if (exercise.load_kg === null || exercise.load_kg === undefined) {
        exercise.load_kg = calculatedLoadKg;
        return;
      }
      
      // Validar consistência (tolerância de 0.1 kg)
      if (calculatedLoadKg !== null) {
        const diff = Math.abs((exercise.load_kg as number) - calculatedLoadKg);
        if (diff > 0.1) {
          // Usar valor calculado (mais confiável que o output do LLM)
          exercise.load_kg = calculatedLoadKg;
        } else {
          exercise.load_kg = Math.round((exercise.load_kg as number) * 10) / 10;
        }
      }
    }

    // APLICAR VALIDAÇÃO COMPLETA
    extractedData.sessions?.forEach((session: Record<string, unknown>, sessionIdx: number) => {
      (session.exercises as Record<string, unknown>[] | undefined)?.forEach((ex: Record<string, unknown>, exIdx: number) => {
        validateAndRecalculateLoad(ex, sessionIdx, exIdx);
      });
    });
    
    // ═══════════════════════════════════════════════════════════
    // MEL-IA-006: Validação de Desvio da Prescrição
    // ═══════════════════════════════════════════════════════════
    let prescriptionDeviations: Record<string, unknown>[] = [];
    
    if (prescriptionDetails && prescriptionDetails.prescription_exercises) {
      const prescribedExercises: Array<{ name: string; sets: string; reps: string }> = prescriptionDetails.prescription_exercises.map((pe: Record<string, unknown>) => ({
        name: (pe.exercises_library as Record<string, unknown>).name as string,
        sets: pe.sets as string,
        reps: pe.reps as string,
      }));
      
      extractedData.sessions?.forEach((session: Record<string, unknown>) => {
        const sessionDeviations: Record<string, unknown>[] = [];
        const executedNames = ((session.exercises as Record<string, unknown>[] | undefined) || []).map((ex: Record<string, unknown>) => 
          ((ex.executed_exercise_name as string) || '').toLowerCase().trim()
        );
        const prescribedNames = prescribedExercises.map((pe) => pe.name.toLowerCase().trim());
        
        // 1. Exercícios prescritos mas NÃO executados (omissões)
        prescribedExercises.forEach((pe) => {
          const peName = pe.name.toLowerCase().trim();
          const wasExecuted = executedNames.some((en: string) => 
            en.includes(peName) || peName.includes(en) || 
            ((session.exercises as Record<string, unknown>[] | undefined) || []).some((ex: Record<string, unknown>) => 
              (ex.prescribed_exercise_name as string)?.toLowerCase().trim() === peName
            )
          );
          
          if (!wasExecuted) {
            sessionDeviations.push({
              type: 'exercicio_omitido',
              prescribed_name: pe.name,
              message: `Exercício prescrito "${pe.name}" não foi executado`,
            });
          }
        });
        
        // 2. Exercícios executados mas NÃO prescritos (substituições/adições)
        ((session.exercises as Record<string, unknown>[] | undefined) || []).forEach((ex: Record<string, unknown>) => {
          const exName = ((ex.executed_exercise_name as string) || '').toLowerCase().trim();
          const isFromPrescription = prescribedNames.some((pn: string) => 
            pn.includes(exName) || exName.includes(pn)
          ) || (ex.prescribed_exercise_name && prescribedNames.includes(
            (ex.prescribed_exercise_name as string).toLowerCase().trim()
          ));
          
          if (!isFromPrescription) {
            sessionDeviations.push({
              type: 'exercicio_substituido',
              executed_name: ex.executed_exercise_name,
              message: `Exercício "${ex.executed_exercise_name}" não estava na prescrição`,
            });
          }
        });
        
        // 3. Desvios de volume (séries diferentes do prescrito)
        ((session.exercises as Record<string, unknown>[] | undefined) || []).forEach((ex: Record<string, unknown>) => {
          if (ex.prescribed_exercise_name && ex.sets) {
            const prescribed = prescribedExercises.find((pe) => 
              pe.name.toLowerCase().trim() === (ex.prescribed_exercise_name as string).toLowerCase().trim()
            );
            if (prescribed) {
              const prescribedSets = parseInt(prescribed.sets);
              if (!isNaN(prescribedSets) && ex.sets !== prescribedSets) {
                sessionDeviations.push({
                  type: 'desvio_volume',
                  exercise_name: ex.executed_exercise_name,
                  prescribed_sets: prescribed.sets,
                  executed_sets: ex.sets,
                  message: `"${ex.executed_exercise_name}": ${ex.sets} séries (prescrito: ${prescribed.sets})`,
                });
              }
            }
          }
        });
        
        if (sessionDeviations.length > 0) {
          session.prescription_deviations = sessionDeviations;
        }
      });
      
      // Collect all deviations for the response
      prescriptionDeviations = extractedData.sessions?.flatMap((s: Record<string, unknown>) => 
        ((s.prescription_deviations as Record<string, unknown>[]) || []).map((d: Record<string, unknown>) => ({ ...d, student_name: s.student_name }))
      ) || [];
    }
    // ═══════════════════════════════════════════════════════════
    // FIM MEL-IA-006
    // ═══════════════════════════════════════════════════════════
    

    const response = {
      success: true,
      transcription,
      data: extractedData,
      prescriptionDeviations: prescriptionDeviations.length > 0 ? prescriptionDeviations : undefined,
    };

    return new Response(
      JSON.stringify(response),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('[process-voice-session] error:', error instanceof Error ? error.stack : String(error));
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido' 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
