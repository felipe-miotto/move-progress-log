const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const LOVABLE_PREVIEW_SUFFIX = '.lovable.app';
const LOVABLE_ID_PREVIEW_PREFIX = 'id-preview--';
const LOVABLE_EDITOR_HOSTS = new Set(['lovable.dev', 'www.lovable.dev']);

const toOrigin = (rawUrl: string | null): string | null => {
  if (!rawUrl) return null;
  try {
    return new URL(rawUrl).origin;
  } catch (_error) {
    return null;
  }
};

const decodeBase64Url = (value: string): string | null => {
  if (!value) return null;
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
    return atob(normalized + padding);
  } catch (_error) {
    return null;
  }
};

const isIdPreviewOrigin = (origin: string): boolean => {
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return host.startsWith(LOVABLE_ID_PREVIEW_PREFIX) && host.endsWith(LOVABLE_PREVIEW_SUFFIX);
  } catch (_error) {
    return false;
  }
};

const toPreviewOrigin = (origin: string): string | null => {
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
};

const isTrustedOrigin = (origin: string, canonicalOrigin: string | null): boolean => {
  try {
    const parsed = new URL(origin);
    const host = parsed.hostname.toLowerCase();

    if (LOVABLE_EDITOR_HOSTS.has(host)) return false;

    // PUBLIC_APP_URL / SITE_URL is always honored when explicitly set.
    if (canonicalOrigin && origin === canonicalOrigin) return true;

    // OAuth callback redirects to a frontend that the user (the student
    // who connected their Oura) needs to reach. localhost/127.0.0.1 are
    // never reachable from a phone or another browser, so reject them
    // from automatic origin resolution. Same defense as the invite-link
    // generators (see generate-oura-connect-link).
    return host.endsWith(LOVABLE_PREVIEW_SUFFIX);
  } catch (_error) {
    return false;
  }
};

const resolveFrontendUrl = (req: Request, encodedStateOrigin?: string | null): string | null => {
  const publicAppOrigin = toOrigin(
    Deno.env.get('PUBLIC_APP_URL') ??
    Deno.env.get('APP_PUBLIC_URL') ??
    null
  );
  // PUBLIC_APP_URL has absolute priority when configured. Never override with
  // request headers, encoded state origin or SITE_URL.
  if (publicAppOrigin) {
    return publicAppOrigin;
  }
  const siteUrlOrigin = toOrigin(Deno.env.get('SITE_URL') ?? null);
  const canonicalOrigin = siteUrlOrigin;
  const candidates = [
    toOrigin(decodeBase64Url(encodedStateOrigin ?? '') ?? null),
    siteUrlOrigin,
    toOrigin(req.headers.get('origin')),
    toOrigin(req.headers.get('referer')),
  ].filter((origin): origin is string => Boolean(origin));
  const uniqueOrigins = Array.from(new Set(candidates));
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
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');

    if (!code || !state) {
      console.error('Missing code or state');
      return new Response('Missing authorization code or state', { status: 400 });
    }

    console.log('Oura callback - code received');

    // Parse state to get student_id and invite_token (+ optional frontend origin)
    const [student_id, invite_token, encodedFrontendOrigin] = state.split(':');

    if (!student_id) {
      console.error('Invalid state format');
      return new Response('Invalid state parameter', { status: 400 });
    }

    // OCB-01: Validate state against database to prevent CSRF/state injection
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseValidationClient = createClient(
      supabaseUrl ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    if (invite_token && invite_token !== 'retry') {
      // Validate that this invite exists and belongs to this student
      const { data: invite, error: inviteError } = await supabaseValidationClient
        .from('student_invites')
        .select('id, created_student_id')
        .eq('id', invite_token)
        .single();

      if (inviteError || !invite) {
        console.error('OCB-01: Invalid state - invite not found');
        return new Response('Invalid OAuth state', { status: 400 });
      }

      // If student was already created, verify it matches the state
      if (invite.created_student_id && invite.created_student_id !== student_id) {
        console.error('OCB-01: State mismatch - student_id does not match invite');
        return new Response('Invalid OAuth state', { status: 400 });
      }
    } else {
      // Retry flow: validate that the student exists
      const { data: student, error: studentError } = await supabaseValidationClient
        .from('students')
        .select('id')
        .eq('id', student_id)
        .single();

      if (studentError || !student) {
        console.error('OCB-01: Invalid state - student not found for retry');
        return new Response('Invalid OAuth state', { status: 400 });
      }
    }

    // Exchange code for tokens
    const ouraClientId = Deno.env.get('OURA_CLIENT_ID');
    const ouraClientSecret = Deno.env.get('OURA_CLIENT_SECRET');
    const redirectUri = `${supabaseUrl}/functions/v1/oura-callback`;
    
    // OCB-03: Derive frontend URL from trusted state origin first, then fallback
    const frontendUrl = resolveFrontendUrl(req, encodedFrontendOrigin);
    if (!frontendUrl) {
      console.error('Invalid frontend URL resolution for Oura callback');
      return new Response('Frontend URL inválida para callback Oura', { status: 400 });
    }

    console.log('Token exchange attempt:', {
      redirectUri,
      frontendUrl,
      clientIdPresent: !!ouraClientId,
      clientSecretPresent: !!ouraClientSecret,
    });

    const tokenResponse = await fetch('https://api.ouraring.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: ouraClientId || '',
        client_secret: ouraClientSecret || '',
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Oura token exchange failed:', errorText);
      
      return Response.redirect(
        `${frontendUrl}/onboarding/oura-error?student_id=${student_id}&reason=token_exchange`,
        302
      );
    }

    const tokenData = await tokenResponse.json();
    console.log('Oura tokens received successfully');

    // Calculate token expiration
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + tokenData.expires_in);

    // Reuse validation client for token storage
    const supabaseClient = supabaseValidationClient;

    // Store tokens securely in Vault using database function
    const { error: insertError } = await supabaseClient.rpc('store_oura_tokens', {
      p_student_id: student_id,
      p_access_token: tokenData.access_token,
      p_refresh_token: tokenData.refresh_token,
      p_token_expires_at: expiresAt.toISOString(),
    });

    if (insertError) {
      console.error('Failed to save Oura connection:', insertError);
      
      return Response.redirect(
        `${frontendUrl}/onboarding/oura-error?student_id=${student_id}&reason=database`,
        302
      );
    }

    console.log(`Oura connection saved for student ${student_id}`);

    // OCB-02: Throttled initial sync — batch 5 at a time instead of 30 parallel
    console.log('🔄 Starting initial Oura sync (throttled, last 30 days)...');
    try {
      const BATCH_SIZE = 5;
      let successful = 0;
      let failed = 0;

      const formatDateInSaoPaulo = (value: Date): string =>
        new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(value);

      for (let batch = 0; batch < 30; batch += BATCH_SIZE) {
        const batchPromises = [];
        for (let i = batch; i < Math.min(batch + BATCH_SIZE, 30); i++) {
          const date = new Date();
          date.setDate(date.getDate() - i);
          const dateStr = formatDateInSaoPaulo(date);
          
          batchPromises.push(
            fetch(`${supabaseUrl}/functions/v1/oura-sync`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              },
              body: JSON.stringify({ student_id, date: dateStr }),
            }).then(async res => {
              await res.text(); // consume body
              if (!res.ok) failed++;
              else successful++;
            }).catch(() => { failed++; })
          );
        }
        await Promise.allSettled(batchPromises);
      }
      
      console.log(`✅ Initial sync completed: ${successful} successful, ${failed} failed`);
    } catch (syncError) {
      console.error('❌ Failed to trigger initial sync:', syncError);
    }

    // Redirect based on origin
    if (invite_token && invite_token !== 'retry') {
      // Came from student onboarding
      console.log('Redirecting to onboarding success');
      return Response.redirect(`${frontendUrl}/onboarding/success?student_id=${student_id}`, 302);
    } else {
      // Came from trainer interface or retry
      console.log('Redirecting to student detail');
      return Response.redirect(`${frontendUrl}/alunos/${student_id}`, 302);
    }
  } catch (error) {
    console.error('Error in oura-callback:', error);
    return new Response('Internal server error', { status: 500 });
  }
});
