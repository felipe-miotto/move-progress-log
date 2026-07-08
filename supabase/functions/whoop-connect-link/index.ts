import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { resolveFrontendUrl } from '../_shared/frontendOrigin.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { headers: jsonHeaders, status });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const body: unknown = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return jsonResponse({ error: 'Payload inválido' }, 400);
    }

    const payload = body as Record<string, unknown>;
    const student_id = typeof payload.student_id === 'string' ? payload.student_id.trim() : '';
    const frontend_origin = typeof payload.frontend_origin === 'string' ? payload.frontend_origin.trim() : null;

    if (!student_id) return jsonResponse({ error: 'student_id é obrigatório' }, 400);
    if (!UUID_RE.test(student_id)) return jsonResponse({ error: 'student_id inválido' }, 400);

    // Verify the trainer owns this student (RLS also enforces this).
    const { data: student, error: studentError } = await supabaseClient
      .from('students').select('id, name').eq('id', student_id).single();
    if (studentError || !student) return jsonResponse({ error: 'Aluno não encontrado' }, 404);

    // Already connected?
    const { data: existingConnection, error: existingConnectionError } = await supabaseClient
      .from('whoop_connections').select('id, is_active')
      .eq('student_id', student_id).eq('is_active', true).limit(1).maybeSingle();
    if (existingConnectionError) {
      console.error('Failed to verify existing Whoop connection:', existingConnectionError);
      return jsonResponse({ error: 'Falha ao verificar conexão Whoop atual' }, 500);
    }
    if (existingConnection?.is_active) {
      return jsonResponse({ error: 'Aluno já possui Whoop conectado' }, 400);
    }

    // Create an invite (reusing student_invites with a whoop_connect marker).
    const invite_token = crypto.randomUUID();
    const expires_at = new Date();
    expires_at.setDate(expires_at.getDate() + 7);

    const { data: invite, error: insertError } = await supabaseClient
      .from('student_invites')
      .insert({
        trainer_id: user.id,
        invite_token,
        email: '__whoop_connect__',
        expires_at: expires_at.toISOString(),
        created_student_id: student_id,
      })
      .select('id, expires_at').single();
    if (insertError) {
      console.error('Insert error:', insertError);
      return jsonResponse({ error: insertError.message }, 400);
    }

    const baseUrl = resolveFrontendUrl(req, frontend_origin);
    if (!baseUrl) {
      console.error('[whoop-connect-link] No trusted public origin resolved.');
      return jsonResponse({
        error: 'Não foi possível determinar a URL pública do app para gerar o convite Whoop. Configure PUBLIC_APP_URL nos secrets do Supabase.',
      }, 400);
    }
    const invite_url = `${baseUrl}/whoop-connect/${invite_token}`;

    return jsonResponse({ invite_url, expires_at: invite.expires_at, student_name: student.name });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in whoop-connect-link:', error);
    return jsonResponse({ error: message }, 500);
  }
});
