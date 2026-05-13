import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticateServiceRoleOrUserRole } from '../_shared/auth.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AI_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const MAX_QUESTION_CHARS = 2000;

async function callAI(payload: object, apiKey: string, retries = 1): Promise<Response> {
  const res = await fetch(AI_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok && res.status >= 500 && retries > 0) {
    await new Promise(r => setTimeout(r, 1000));
    return callAI(payload, apiKey, retries - 1);
  }
  return res;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  try {
    // AI-06: Coach Console é admin-only no front (rota /coach-console com
    // <AdminRoute>). Esta função é uma das 3 chamadas pela tela — endurecer
    // backend pra rejeitar tentativas de bypass via API direta.
    const authResult = await authenticateServiceRoleOrUserRole(req, {
      corsHeaders: cors,
      allowedRoles: ['admin'],
      missingAuthMessage: 'Não autorizado',
      invalidTokenMessage: 'Não autorizado',
      forbiddenMessage: 'Acesso restrito a administradores (Coach Console)',
    });
    if (authResult instanceof Response) return authResult;

    const body: unknown = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return json({ error: 'Payload inválido' }, 400);
    }

    const payload = body as Record<string, unknown>;
    const student_id = typeof payload.student_id === 'string' ? payload.student_id.trim() : '';
    const question = typeof payload.question === 'string' ? payload.question.trim() : '';

    if (!student_id || !question) return json({ error: 'student_id e question obrigatórios' }, 400);
    if (!UUID_RE.test(student_id)) return json({ error: 'student_id inválido' }, 400);
    if (question.length > MAX_QUESTION_CHARS) {
      return json({ error: `question excede o limite de ${MAX_QUESTION_CHARS} caracteres` }, 400);
    }

    // AI-06: Caller é admin (validado em authenticateServiceRoleOrUserRole
    // com allowedRoles=['admin']) ou service role. Admin tem acesso global
    // por design do Coach Console — ownership check de trainer_id seria
    // inconsistente com a função da tela. Mantém apenas a validação de
    // existência do aluno (404 se não existe).
    const svc = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    const { data: student, error: studentError } = await svc
      .from('students')
      .select('id, trainer_id, name, fitness_level, objectives, limitations, injury_history, preferences')
      .eq('id', student_id)
      .single();

    if (studentError || !student) return json({ error: 'Atleta não encontrado' }, 404);

    const [
      { data: sessions, error: sessionsError },
      { data: goals, error: goalsError },
      { data: records, error: recordsError },
    ] = await Promise.all([
      svc
        .from('workout_sessions')
        .select('date, exercises(exercise_name,load_kg,reps)')
        .eq('student_id', student_id)
        .order('date', { ascending: false })
        .limit(10),
      svc
        .from('athlete_goals')
        .select('id,title,description,goal_type,target_value,target_unit,target_date,status,created_at,updated_at')
        .eq('student_id', student_id)
        .eq('status', 'active'),
      svc
        .from('athlete_records')
        .select('id,exercise_name,record_type,value,achieved_at,session_id,created_at')
        .eq('student_id', student_id)
        .order('achieved_at', { ascending: false })
        .limit(10),
    ]);
    if (sessionsError || goalsError || recordsError) {
      console.error('ai-coach data fetch error:', {
        sessionsError: sessionsError?.message ?? null,
        goalsError: goalsError?.message ?? null,
        recordsError: recordsError?.message ?? null,
      });
      return json({ error: 'Falha ao carregar contexto do atleta para IA' }, 500);
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY não configurada');

    const systemPrompt = `You are an expert sports coach for Move Progress Log. Give specific, actionable advice based on data. Reply in Brazilian Portuguese.
Athlete: ${JSON.stringify({ student, recent_sessions: sessions, goals, records })}`;

    const res = await callAI({
      model: 'anthropic/claude-sonnet-4-5',
      stream: false,
      max_tokens: 1500,
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: question }],
    }, LOVABLE_API_KEY);

    if (!res.ok) return json({ error: `Erro no gateway de IA: ${res.status}` }, 502);
    const answer = (await res.json()).choices?.[0]?.message?.content ?? '';
    return json({ answer, student_id });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Erro desconhecido' }, 500);
  }
});
