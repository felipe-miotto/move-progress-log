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

const DEFAULT_EXPIRY_DAYS = 7;
const MIN_EXPIRY_DAYS = 1;
const MAX_EXPIRY_DAYS = 30;
const LOVABLE_PREVIEW_SUFFIX = '.lovable.app';
const LOVABLE_ID_PREVIEW_PREFIX = 'id-preview--';
const LOVABLE_EDITOR_HOSTS = new Set(['lovable.dev', 'www.lovable.dev']);

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

function clampInviteExpiry(rawValue: unknown) {
  if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) {
    return DEFAULT_EXPIRY_DAYS;
  }

  return Math.min(MAX_EXPIRY_DAYS, Math.max(MIN_EXPIRY_DAYS, Math.trunc(rawValue)));
}

function normalizeInviteEmail(rawValue: unknown) {
  if (rawValue === undefined || rawValue === null) return null;
  if (typeof rawValue !== 'string') {
    throw new Error('E-mail inválido');
  }

  const normalized = rawValue.trim().toLowerCase();
  if (!normalized) return null;
  if (!emailPattern.test(normalized)) {
    throw new Error('E-mail inválido');
  }

  return normalized;
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

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      console.error('Auth error:', authError);
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const body = await req.json();
    const expiresInDays = clampInviteExpiry(body?.expires_in_days);
    const frontend_origin = typeof body?.frontend_origin === 'string'
      ? body.frontend_origin.trim()
      : null;
    let email: string | null;

    try {
      email = normalizeInviteEmail(body?.email);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Dados inválidos';
      return jsonResponse({ error: message }, 400);
    }

    console.log(`Generating invite, expires in ${expiresInDays} days`);

    // Generate unique token
    const invite_token = crypto.randomUUID();

    // Calculate expiration date
    const expires_at = new Date();
    expires_at.setDate(expires_at.getDate() + expiresInDays);

    // Insert invite
    const { data: invite, error: insertError } = await supabaseClient
      .from('student_invites')
      .insert({
        trainer_id: user.id,
        invite_token,
        email,
        expires_at: expires_at.toISOString(),
      })
      .select('id, expires_at')
      .single();

    if (insertError) {
      console.error('Insert error:', insertError);
      return jsonResponse({ error: insertError.message }, 400);
    }

    // Prefer trusted public frontend origin and fail fast when unavailable.
    const baseUrl = resolveFrontendUrl(req, frontend_origin);
    if (!baseUrl) {
      return jsonResponse(
        {
          error:
            'Não foi possível determinar a URL pública do app para gerar o convite. Configure PUBLIC_APP_URL (ou SITE_URL) ou envie frontend_origin válido.',
        },
        400
      );
    }
    const invite_url = `${baseUrl}/onboarding/${invite_token}`;

    console.log('Invite generated successfully');

    return jsonResponse({
      invite_url,
      expires_at: invite.expires_at,
      token: invite_token,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in generate-student-invite:', error);
    return jsonResponse({ error: message }, 500);
  }
});
