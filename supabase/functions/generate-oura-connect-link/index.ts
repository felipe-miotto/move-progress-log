import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const jsonHeaders = {
  ...corsHeaders,
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

const LOVABLE_PREVIEW_SUFFIX = '.lovable.app';
const LOVABLE_ID_PREVIEW_PREFIX = 'id-preview--';
const LOVABLE_EDITOR_HOSTS = new Set(['lovable.dev', 'www.lovable.dev']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { headers: jsonHeaders, status });
}

function toOrigin(rawUrl: string | null) {
  if (!rawUrl) return null;

  try {
    return new URL(rawUrl).origin;
  } catch (_error) {
    return null;
  }
}

function isIdPreviewOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return host.startsWith(LOVABLE_ID_PREVIEW_PREFIX) && host.endsWith(LOVABLE_PREVIEW_SUFFIX);
  } catch (_error) {
    return false;
  }
}

function toPreviewOrigin(origin: string): string | null {
  try {
    const parsed = new URL(origin);
    const host = parsed.hostname.toLowerCase();
    if (!host.startsWith(LOVABLE_ID_PREVIEW_PREFIX) || !host.endsWith(LOVABLE_PREVIEW_SUFFIX)) {
      return origin;
    }
    const previewHost = host.replace(LOVABLE_ID_PREVIEW_PREFIX, 'preview--');
    return `${parsed.protocol}//${previewHost}${parsed.port ? `:${parsed.port}` : ''}`;
  } catch (_error) {
    return null;
  }
}

function isTrustedOrigin(origin: string, canonicalOrigin: string | null): boolean {
  try {
    const parsed = new URL(origin);
    const host = parsed.hostname.toLowerCase();

    if (LOVABLE_EDITOR_HOSTS.has(host)) {
      return false;
    }

    if (canonicalOrigin && origin === canonicalOrigin) return true;

    return (
      host.endsWith(LOVABLE_PREVIEW_SUFFIX) ||
      host === 'localhost' ||
      host === '127.0.0.1'
    );
  } catch (_error) {
    return false;
  }
}

function resolveFrontendUrl(req: Request, bodyFrontendOrigin: string | null) {
  const publicAppOrigin = toOrigin(
    Deno.env.get('PUBLIC_APP_URL') ??
    Deno.env.get('APP_PUBLIC_URL') ??
    null
  );
  // PUBLIC_APP_URL has absolute priority when configured. It must never be
  // overridden by request headers (Origin/Referer), body frontend_origin or
  // SITE_URL. This guarantees invite links always point to the canonical
  // public domain even when the request originates from the editor preview
  // or a localhost dev server.
  if (publicAppOrigin) {
    return publicAppOrigin;
  }
  const siteUrlOrigin = toOrigin(Deno.env.get('SITE_URL') ?? null);
  const canonicalOrigin = siteUrlOrigin;
  const requestOrigins = [
    publicAppOrigin,
    toOrigin(bodyFrontendOrigin),
    siteUrlOrigin,
    toOrigin(req.headers.get('origin')),
    toOrigin(req.headers.get('referer')),
  ].filter((origin): origin is string => Boolean(origin));
  const uniqueOrigins = Array.from(new Set(requestOrigins));
  const trustedOrigins = uniqueOrigins.filter((origin) =>
    isTrustedOrigin(origin, canonicalOrigin)
  );
  const normalizedTrustedOrigins = Array.from(
    new Set(
      trustedOrigins
        .map((origin) => toPreviewOrigin(origin))
        .filter((origin): origin is string => Boolean(origin))
    )
  );

  if (publicAppOrigin && normalizedTrustedOrigins.includes(publicAppOrigin)) {
    return publicAppOrigin;
  }

  if (siteUrlOrigin && normalizedTrustedOrigins.includes(siteUrlOrigin) && !isIdPreviewOrigin(siteUrlOrigin)) {
    return siteUrlOrigin;
  }

  const firstNonIdPreview = normalizedTrustedOrigins.find((origin) => !isIdPreviewOrigin(origin));
  if (firstNonIdPreview) {
    return firstNonIdPreview;
  }

  if (siteUrlOrigin && normalizedTrustedOrigins.includes(siteUrlOrigin)) {
    return siteUrlOrigin;
  }

  return normalizedTrustedOrigins[0] ?? null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization') ?? '' },
        },
      }
    );

    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const body: unknown = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return jsonResponse({ error: 'Payload inválido' }, 400);
    }

    const payload = body as Record<string, unknown>;
    const student_id = typeof payload.student_id === 'string' ? payload.student_id.trim() : '';
    const frontend_origin = typeof payload.frontend_origin === 'string'
      ? payload.frontend_origin.trim()
      : null;

    if (!student_id) {
      return jsonResponse({ error: 'student_id é obrigatório' }, 400);
    }
    if (!UUID_RE.test(student_id)) {
      return jsonResponse({ error: 'student_id inválido' }, 400);
    }

    // Verify trainer owns this student
    const { data: student, error: studentError } = await supabaseClient
      .from('students')
      .select('id, name')
      .eq('id', student_id)
      .single();

    if (studentError || !student) {
      return jsonResponse({ error: 'Aluno não encontrado' }, 404);
    }

    // Check if already connected
    const { data: existingConnection, error: existingConnectionError } = await supabaseClient
      .from('oura_connections')
      .select('id, is_active')
      .eq('student_id', student_id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (existingConnectionError) {
      console.error('Failed to verify existing Oura connection:', existingConnectionError);
      return jsonResponse({ error: 'Falha ao verificar conexão Oura atual' }, 500);
    }

    if (existingConnection?.is_active) {
      return jsonResponse({ error: 'Aluno já possui Oura Ring conectado' }, 400);
    }

    // Generate token and create invite entry (reusing student_invites with oura_connect marker)
    const invite_token = crypto.randomUUID();
    const expires_at = new Date();
    expires_at.setDate(expires_at.getDate() + 7);

    const { data: invite, error: insertError } = await supabaseClient
      .from('student_invites')
      .insert({
        trainer_id: user.id,
        invite_token,
        email: '__oura_connect__',
        expires_at: expires_at.toISOString(),
        created_student_id: student_id,
      })
      .select('id, expires_at')
      .single();

    if (insertError) {
      console.error('Insert error:', insertError);
      return jsonResponse({ error: insertError.message }, 400);
    }

    // Resolve only trusted public app origins. Never fallback to editor/local silently.
    const baseUrl = resolveFrontendUrl(req, frontend_origin);
    if (!baseUrl) {
      return jsonResponse(
        {
          error:
            'Não foi possível determinar a URL pública do app para gerar o convite Oura. Configure PUBLIC_APP_URL (ou SITE_URL) ou envie frontend_origin válido.',
        },
        400
      );
    }
    const invite_url = `${baseUrl}/oura-connect/${invite_token}`;

    console.log('Oura connect link generated for student');

    return jsonResponse({
      invite_url,
      expires_at: invite.expires_at,
      student_name: student.name,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in generate-oura-connect-link:', error);
    return jsonResponse({ error: message }, 500);
  }
});
