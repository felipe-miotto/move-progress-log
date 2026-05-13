import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticateServiceRoleOrUserRole } from '../_shared/auth.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AI_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const MIN_PERIOD_DAYS = 7;
const MAX_PERIOD_DAYS = 180;

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
    // AI-06: Coach Console é admin-only no front (/coach-console com
    // <AdminRoute>). Endurecer backend pra rejeitar bypass via API direta.
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
    const rawPeriodDays = typeof payload.period_days === 'number'
      ? payload.period_days
      : Number(payload.period_days ?? 30);
    const period_days = Math.trunc(rawPeriodDays);

    if (!student_id) return json({ error: 'student_id obrigatório' }, 400);
    if (!UUID_RE.test(student_id)) return json({ error: 'student_id inválido' }, 400);
    if (!Number.isFinite(rawPeriodDays)) return json({ error: 'period_days inválido' }, 400);
    if (period_days < MIN_PERIOD_DAYS || period_days > MAX_PERIOD_DAYS) {
      return json({ error: `period_days deve estar entre ${MIN_PERIOD_DAYS} e ${MAX_PERIOD_DAYS}` }, 400);
    }

    // AI-06: Caller é admin ou service role (já validado acima). Admin tem
    // acesso global no Coach Console — ownership check de trainer_id seria
    // incompatível. Mantém apenas a validação de existência do aluno.
    const svc = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const since = new Date(Date.now() - period_days * 86_400_000).toISOString().split('T')[0];

    const { data: student, error: studentError } = await svc.from('students').select('id, trainer_id, name').eq('id', student_id).single();
    if (studentError || !student) return json({ error: 'Atleta não encontrado' }, 404);

    // AI-02: Use existing tables instead of non-existent athlete_metric_trends
    const [{ data: sessions }, { data: ouraMetrics }] = await Promise.all([
      svc.from('workout_sessions').select('id, date, exercises(exercise_name, load_kg, reps, sets)').eq('student_id', student_id).gte('date', since).order('date'),
      svc.from('oura_metrics').select('date, readiness_score, sleep_score, average_sleep_hrv, resting_heart_rate').eq('student_id', student_id).gte('date', since).order('date'),
    ]);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY não configurada');

    const prompt = `Analise os dados de treinamento dos últimos ${period_days} dias e forneça:
1. Progressão de carga e volume
2. Recordes e destaques
3. Recomendações para o próximo ciclo
Dados: ${JSON.stringify({ sessions, ouraMetrics, period_days })}
Responda em português brasileiro com seções estruturadas.`;

    const res = await callAI({
      model: 'anthropic/claude-sonnet-4-5',
      stream: false,
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    }, LOVABLE_API_KEY);

    if (!res.ok) return json({ error: `Erro no gateway de IA: ${res.status}` }, 502);
    const analysis = (await res.json()).choices?.[0]?.message?.content ?? '';
    return json({ analysis, student_id, period_days });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Erro desconhecido' }, 500);
  }
});
