import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticateServiceRoleOrUserRole } from '../_shared/auth.ts';
import { WHOOP } from '../_shared/wearable/providerConfig.ts';
import { getAccessToken, refreshAccessToken, storeTokens } from '../_shared/wearable/tokens.ts';
import { fetchCollectionsReal, syncStudent } from './sync.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};
const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { headers: jsonHeaders, status });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authResult = await authenticateServiceRoleOrUserRole(req, {
      corsHeaders,
      allowedRoles: ['admin'],
      missingAuthMessage: 'Missing or invalid authorization header',
      invalidTokenMessage: 'Invalid or expired token',
      forbiddenMessage: 'Admin privileges required for this operation',
    });
    if (authResult instanceof Response) return authResult;
    const { supabaseUrl, supabaseServiceKey } = authResult;

    let body: Record<string, unknown> = {};
    const raw = await req.text();
    if (raw.trim().length > 0) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
      } catch {
        return jsonResponse({ error: 'Malformed JSON body' }, 400);
      }
    }

    const student_id = typeof body.student_id === 'string' ? body.student_id.trim() : '';
    if (!student_id || !UUID_RE.test(student_id)) return jsonResponse({ error: 'student_id inválido' }, 400);

    const supa = createClient(supabaseUrl, supabaseServiceKey);

    const { data: conn, error: connErr } = await supa
      .from('whoop_connections')
      .select('token_expires_at, is_active')
      .eq('student_id', student_id)
      .maybeSingle();
    if (connErr || !conn) return jsonResponse({ error: 'Nenhuma conexão Whoop encontrada' }, 404);

    // Access token — refresh if missing or within 60s of expiry.
    let accessToken = await getAccessToken(supa, 'whoop', student_id);
    const skewMs = 60_000;
    const expMs = conn.token_expires_at ? new Date(conn.token_expires_at as string).getTime() : 0;
    if (!accessToken || !Number.isFinite(expMs) || Date.now() + skewMs >= expMs) {
      const { data: refreshTok } = await supa.rpc('get_whoop_refresh_token', { p_student_id: student_id });
      if (!refreshTok) return jsonResponse({ error: 'Falha ao recuperar refresh token' }, 500);
      const refreshed = await refreshAccessToken(WHOOP, refreshTok as string);
      const newExp = new Date();
      newExp.setSeconds(newExp.getSeconds() + (refreshed.expires_in ?? 3600));
      await storeTokens(supa, 'whoop', student_id, {
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token,
        expires_at: newExp.toISOString(),
      });
      await supa.from('whoop_connections').update({ token_expires_at: newExp.toISOString() }).eq('student_id', student_id);
      accessToken = refreshed.access_token;
    }

    // Window: default last 30 days.
    const end = (typeof body.end === 'string' && body.end) || new Date().toISOString();
    const start = (typeof body.start === 'string' && body.start) ||
      new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

    const result = await syncStudent(
      { supa, fetchCollections: fetchCollectionsReal },
      { student_id, start, end, accessToken: accessToken as string },
    );
    await supa.from('whoop_connections').update({ last_sync_at: new Date().toISOString() }).eq('student_id', student_id);

    return jsonResponse({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in whoop-sync:', error);
    return jsonResponse({ error: message }, 500);
  }
});
