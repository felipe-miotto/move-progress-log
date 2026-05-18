import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.21.0";

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
    const GOOGLE_AI_API_KEY = Deno.env.get('GOOGLE_AI_API_KEY')!;
    const genAI = new GoogleGenerativeAI(GOOGLE_AI_API_KEY);

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

    
    
    // 1️⃣ Transcrever áudio usando Gemini
    const binaryAudio = processBase64Chunks(audio);
    
    // Converter para base64 sem prefixo data URL
    let audioBase64 = '';
    const bytes = new Uint8Array(binaryAudio);
    const len = bytes.length;
    for (let i = 0; i < len; i++) {
      audioBase64 += String.fromCharCode(bytes[i]);
    }
    audioBase64 = btoa(audioBase64);

    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.0-flash" 
    });

    const terminologyCorrectionsPrompt = Object.entries(TERMINOLOGY_CORRECTIONS)
      .map(([k, v]) => `- "${k}" → "${v}"`)
      .join('\n');

    // V-06: AbortController with 30s timeout for transcription
    const transcriptionController = new AbortController();
    const transcriptionTimeout = setTimeout(() => transcriptionController.abort(), 30_000);

    let transcriptionResult;
    try {
      transcriptionResult = await model.generateContent([
        {
          inlineData: {
            mimeType: "audio/webm",
            data: audioBase64
          }
        },
        `Transcreva este áudio em português brasileiro sobre treino físico.
Tolere ruído, interrupções, correções e comentários paralelos.

CORREÇÕES OBRIGATÓRIAS:
${terminologyCorrectionsPrompt}
- "supino" (manter assim)
- "agachamento" (manter assim)

CORREÇÕES NO MEIO DO ÁUDIO:
- Se houver correção ("não é 17,5, é 20", "anota 20 em vez de 15"), transcreva AMBAS as versões fielmente.
- O sistema de extração usará apenas a carga final corrigida.

Retorne APENAS a transcrição corrigida, sem adicionar comentários.`
      ]);
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

    const transcription = transcriptionResult.response.text();
    

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

    // 3️⃣ Processar com Gemini para extrair dados estruturados
    
    
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

9. **prescribed_exercise_name** (IMPORTANTE):
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
          "load_kg": número com 1 casa decimal (ex: 25.0) ou null,
          "load_breakdown": "descrição EXATA ou null",
          "observations": "observações técnicas ou null",
          "is_best_set": true
        }
      ]
    }
  ]
}`;

    const extractionModel = genAI.getGenerativeModel({ 
      model: "gemini-2.0-flash",
      generationConfig: {
        responseMimeType: "application/json"
      }
    });

    const extractionResult = await extractionModel.generateContent([
      systemPrompt,
      `\n\nTranscrição da sessão:\n\n${transcription}`
    ]);

    const extractedData = JSON.parse(extractionResult.response.text());
    
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
    function calculateLoadFromBreakdown(breakdown: string | null): number | null {
      if (!breakdown) return null;
      
      try {
        // 1. DETECTAR PESO CORPORAL COM VALOR
        const bodyCorporalWithValue = breakdown.match(/Peso corporal\s*=\s*(\d+(?:\.\d+)?)\s*kg/i);
        if (bodyCorporalWithValue) {
          return roundToDecimal(parseFloat(bodyCorporalWithValue[1]));
        }
        
        // 2. DETECTAR PESO CORPORAL SEM VALOR
        if (/Peso corporal/i.test(breakdown) && !/\d/.test(breakdown)) {
          return null;
        }
        
        // 3. DETECTAR ELÁSTICOS/BANDAS
        const hasOnlyElastic = /^(elástico|banda|elastic)/i.test(breakdown.trim()) && !/\d+\s*(kg|lb)/i.test(breakdown);
        if (hasOnlyElastic) return null;
        
        let total = 0;
        let processedEachSide = false;

        // 4. DETECTAR "CADA LADO" (com OU sem "de", com OU sem
        //    parênteses) — tolerância alinhada com o cliente em
        //    `src/utils/loadCalculation.ts`. Antes do fix, regex
        //    `/de cada lado/i` estrito cancelava o multiplicador por 2
        //    quando o LLM/usuário omitia o "de" (ex.: "70 lb cada lado
        //    + barra 15kg" virava 46.8 em vez de 78.5).
        const eachSidePattern = /(?:de\s*)?cada\s*lado/i;
        if (eachSidePattern.test(breakdown)) {
          processedEachSide = true;
          const parenMatch = breakdown.match(/\((.*?)\)\s*(?:de\s*)?cada\s*lado/i);
          if (parenMatch) {
            // Formato canônico com parênteses: "(... + ...) de cada lado"
            const content = parenMatch[1];

            const kgMatches = Array.from(content.matchAll(/(\d+(?:[.,]\d+)?)\s*kg/gi));
            for (const m of kgMatches) {
              total += parseFloat(m[1].replace(',', '.')) * 2;
            }

            const lbMatches = Array.from(content.matchAll(/(\d+(?:[.,]\d+)?)\s*lb/gi));
            for (const m of lbMatches) {
              // Sem arredondamento intermediário — `roundToDecimal` só
              // no return final pra evitar off-by-0.1 (ex.: 78.6 vs 78.5).
              total += parseFloat(m[1].replace(',', '.')) * POUND_TO_KG_CONVERSION * 2;
            }
          } else {
            // Formato sem parênteses: "70 lb cada lado + barra 15kg".
            // Multiplica TUDO antes do "cada lado" por 2, exceto barra
            // (extraída separadamente abaixo no passo 6).
            const beforeEachSide = breakdown.split(eachSidePattern)[0] ?? '';
            const contentWithoutBarra = beforeEachSide.replace(
              /barra\s*(?:de\s*)?(\d+(?:[.,]\d+)?)\s*kg/gi,
              '',
            );

            const kgMatches = Array.from(contentWithoutBarra.matchAll(/(\d+(?:[.,]\d+)?)\s*kg/gi));
            for (const m of kgMatches) {
              total += parseFloat(m[1].replace(',', '.')) * 2;
            }

            const lbMatches = Array.from(contentWithoutBarra.matchAll(/(\d+(?:[.,]\d+)?)\s*lb/gi));
            for (const m of lbMatches) {
              total += parseFloat(m[1].replace(',', '.')) * POUND_TO_KG_CONVERSION * 2;
            }
          }
        }

        // 5. DETECTAR KETTLEBELLS/HALTERES DUPLOS (multiplicar por 2)
        const multiKbMatch = breakdown.match(/(2\s*kettlebells?|duplo\s*kettlebell|kettlebell\s*duplo|dois\s*halteres|2\s*halteres).*?(\d+(?:[.,]\d+)?)\s*(kg|lb)/i);
        if (multiKbMatch && !processedEachSide) {
          const value = parseFloat(multiKbMatch[2].replace(',', '.'));
          const unit = multiKbMatch[3].toLowerCase();
          const kg = unit === 'lb' ? value * POUND_TO_KG_CONVERSION : value;
          total += kg * 2;
        }

        // 6. EXTRAIR PESO DA BARRA (sempre soma direta, mesmo em "cada lado")
        const barraMatch = breakdown.match(/barra\s*(\d+(?:[.,]\d+)?)\s*kg/i);
        if (barraMatch) {
          total += parseFloat(barraMatch[1].replace(',', '.'));
        }

        // 7. PESOS SIMPLES (sem "cada lado" nem "duplo")
        if (!processedEachSide && !multiKbMatch) {
          const kgMatches = Array.from(breakdown.matchAll(/(\d+(?:[.,]\d+)?)\s*kg/gi));
          for (const m of kgMatches) {
            const matchText = breakdown.substring(Math.max(0, (m.index || 0) - 6), (m.index || 0) + m[0].length);
            if (!/barra/i.test(matchText)) {
              total += parseFloat(m[1].replace(',', '.'));
            }
          }

          const lbMatches = Array.from(breakdown.matchAll(/(\d+(?:[.,]\d+)?)\s*lb/gi));
          for (const m of lbMatches) {
            total += parseFloat(m[1].replace(',', '.')) * POUND_TO_KG_CONVERSION;
          }
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
      const calculatedLoadKg = calculateLoadFromBreakdown(exercise.load_breakdown as string);
      
      if (exercise.load_kg === null || exercise.load_kg === undefined) {
        exercise.load_kg = calculatedLoadKg;
        return;
      }
      
      // Validar consistência (tolerância de 0.1 kg)
      if (calculatedLoadKg !== null) {
        const diff = Math.abs((exercise.load_kg as number) - calculatedLoadKg);
        if (diff > 0.1) {
          // Usar valor calculado (mais confiável que o Gemini)
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
