import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json({ error: 'Configuração incompleta do backend' }, 500);
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Não autorizado' }, 401);

    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return json({ error: 'Não autorizado' }, 401);

    const isServiceRole = token === serviceRoleKey;
    const svc = createClient(supabaseUrl, serviceRoleKey);

    if (!isServiceRole) {
      const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: { user }, error: authError } = await authClient.auth.getUser();
      if (authError || !user) return json({ error: 'Não autorizado' }, 401);

      const { data: roleData, error: roleError } = await svc
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .limit(1)
        .maybeSingle();

      if (roleError) return json({ error: 'Falha ao verificar permissões' }, 500);
      if (!roleData) return json({ error: 'Acesso restrito a administradores' }, 403);
    }

    // PR-02: Detect PRs from sessions up to 7 days ago (not just yesterday) to catch delayed registrations
    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().split('T')[0];
    const today = new Date().toISOString().split('T')[0];

    const { data: sessions } = await svc
      .from('workout_sessions')
      .select('id, student_id, date, exercises(exercise_name, load_kg, reps, sets)')
      .gte('date', sevenDaysAgo).lt('date', today);

    const sessionList = sessions ?? [];
    const detected: unknown[] = [];

    // Group valid exercises by student_id to minimise DB round-trips
    const byStudent = new Map<string, { session: (typeof sessionList)[0]; ex: { exercise_name: string; load_kg: number; reps: number; sets?: number | null } }[]>();
    for (const session of sessionList) {
      for (const ex of ((session as Record<string, unknown>).exercises as Array<{ exercise_name: string; load_kg: number; reps: number; sets?: number }>) ?? []) {
        if (!ex.load_kg || !ex.reps) continue;
        const list = byStudent.get(session.student_id) ?? [];
        list.push({ session, ex });
        byStudent.set(session.student_id, list);
      }
    }

    for (const [student_id, items] of byStudent) {
      const exerciseNames = [...new Set(items.map(i => i.ex.exercise_name))];

      // Single SELECT: all existing records for this student × these exercises
      const { data: existing } = await svc
        .from('athlete_records')
        .select('exercise_name, record_type, value')
        .eq('student_id', student_id)
        .in('exercise_name', exerciseNames)
        // PR-03: Also detect max_reps and max_total_volume
        .in('record_type', ['max_load', 'max_volume', 'max_reps', 'max_total_volume']);

      // Build in-memory lookup: "exercise_name:record_type" → best known value
      const recordMap = new Map<string, number>();
      for (const r of existing ?? []) {
        const key = `${r.exercise_name}:${r.record_type}`;
        const current = recordMap.get(key) ?? -Infinity;
        if (r.value > current) recordMap.set(key, r.value);
      }

      // Detect PRs entirely in memory — no extra DB reads
      const newRecords: object[] = [];
      for (const { session, ex } of items) {
        // PR-03: Detect max_load, max_volume, max_reps, max_total_volume
        const sets = ex.sets || 1;
        const checks: [string, number][] = [
          ['max_load', ex.load_kg],
          ['max_volume', ex.load_kg * ex.reps],
          ['max_reps', ex.reps],
          ['max_total_volume', ex.load_kg * ex.reps * sets],
        ];
        for (const [record_type, val] of checks) {
          const key = `${ex.exercise_name}:${record_type}`;
          const prev = recordMap.get(key);
          if (prev === undefined || val > prev) {
            recordMap.set(key, val); // update map so same-batch duplicates don't trigger twice
            newRecords.push({
              student_id, exercise_name: ex.exercise_name,
              record_type, value: val, achieved_at: session.date, session_id: session.id,
            });
            detected.push({ student_id, exercise: ex.exercise_name, record_type, value: val, date: session.date });
          }
        }
      }

      // Single batch upsert for all PRs of this student
      if (newRecords.length > 0) {
        await svc.from('athlete_records').upsert(newRecords);
      }
    }

    return json({ detected, sessions_checked: sessionList.length });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Erro desconhecido' }, 500);
  }
});
