import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};
const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } },
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { headers: jsonHeaders, status: 401 });
    }

    const body: unknown = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return new Response(JSON.stringify({ error: 'Payload inválido' }), { headers: jsonHeaders, status: 400 });
    }
    const payload = body as Record<string, unknown>;
    const student_id = typeof payload.student_id === 'string' ? payload.student_id.trim() : '';
    if (!student_id) return new Response(JSON.stringify({ error: 'student_id é obrigatório' }), { headers: jsonHeaders, status: 400 });
    if (!UUID_RE.test(student_id)) return new Response(JSON.stringify({ error: 'student_id inválido' }), { headers: jsonHeaders, status: 400 });

    // Verify ownership (RLS also enforces this).
    const { data: student, error: studentError } = await supabaseClient
      .from('students').select('trainer_id').eq('id', student_id).single();
    if (studentError || student.trainer_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Acesso negado' }), { headers: jsonHeaders, status: 403 });
    }

    const { error: updateError } = await supabaseClient
      .from('whoop_connections').update({ is_active: false }).eq('student_id', student_id);
    if (updateError) {
      console.error('Failed to disconnect Whoop:', updateError);
      return new Response(JSON.stringify({ error: updateError.message }), { headers: jsonHeaders, status: 500 });
    }

    return new Response(JSON.stringify({ success: true }), { headers: jsonHeaders });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in whoop-disconnect:', error);
    return new Response(JSON.stringify({ error: message }), { headers: jsonHeaders, status: 500 });
  }
});
