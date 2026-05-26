import { resolveFrontendUrl as sharedResolveFrontendUrl } from '../_shared/frontendOrigin.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

interface ValidatedOuraInvite {
  id: string;
  invite_token: string;
  created_student_id: string | null;
  expires_at: string | null;
  is_used: boolean;
}

// Wrapper that decodes the OAuth state's base64-url-encoded origin before
// delegating to the shared resolver. Keeps the OAuth-specific decoding here
// while the trust/canonicalization logic lives in `_shared/frontendOrigin`.
const resolveFrontendUrl = (
  req: Request,
  encodedStateOrigin?: string | null,
): string | null =>
  sharedResolveFrontendUrl(
    req,
    decodeBase64Url(encodedStateOrigin ?? '') ?? null,
  );

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

    // Parse state to get student_id and invite_id (+ optional frontend origin)
    const [student_id, invite_id, encodedFrontendOrigin] = state.split(':');

    if (!student_id) {
      console.error('Invalid state format');
      return new Response('Invalid state parameter', { status: 400 });
    }

    // OCB-04: Validate UUID format on every id parsed from the state. The
    // state echoes back to us via Oura, so we treat all of it as untrusted
    // input. Reject before any DB query or redirect.
    if (!UUID_RE.test(student_id)) {
      console.error('OCB-04: Invalid student_id format in state');
      return new Response('Invalid OAuth state', { status: 400 });
    }
    if (!invite_id || invite_id === 'retry') {
      // Retry-by-student-id was previously accepted here. That bypassed invite
      // expiry/replay checks, so all OAuth callbacks must now carry a real
      // student_invites.id from a still-valid invite.
      console.error('OCB-08: Missing or deprecated retry invite marker in state');
      return new Response('Invalid OAuth state', { status: 400 });
    }
    if (!UUID_RE.test(invite_id)) {
      console.error('OCB-04: Invalid invite_id format in state');
      return new Response('Invalid OAuth state', { status: 400 });
    }

    // OCB-01: Validate state against database to prevent CSRF/state injection
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseValidationClient = createClient(
      supabaseUrl ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Validate that this invite exists and belongs to this student.
    const { data: invite, error: inviteError } = await supabaseValidationClient
      .from('student_invites')
      .select('id, invite_token, created_student_id, expires_at, is_used')
      .eq('id', invite_id)
      .single();

    if (inviteError || !invite) {
      console.error('OCB-01: Invalid state - invite not found');
      return new Response('Invalid OAuth state', { status: 400 });
    }

    let validatedInvite = invite as ValidatedOuraInvite;

    // If student was already created, verify it matches the state
    if (validatedInvite.created_student_id && validatedInvite.created_student_id !== student_id) {
      console.error('OCB-01: State mismatch - student_id does not match invite');
      return new Response('Invalid OAuth state', { status: 400 });
    }

    // OCB-05: Reject expired invites — even if signed correctly by Oura,
    // an invite past expires_at must not be honored.
    if (
      validatedInvite.expires_at &&
      new Date(validatedInvite.expires_at).getTime() < Date.now()
    ) {
      console.error('OCB-05: Invite expired');
      return new Response('Invalid OAuth state', { status: 400 });
    }

    // OCB-06: Reject replay — a state captured from a successful OAuth
    // round-trip must not be re-usable. is_used is flipped by this callback
    // after tokens are saved successfully.
    if (validatedInvite.is_used === true) {
      console.error('OCB-06: Invite already used (replay attempt)');
      return new Response('Invalid OAuth state', { status: 400 });
    }

    // OCB-09: Atomically claim the invite before exchanging the code. This
    // closes the race where two concurrent callbacks could both observe
    // is_used=false and both store tokens. Recoverable failures below reset
    // the flag so the user can retry through the original invite link.
    const nowIso = new Date().toISOString();
    const { data: claimedInvite, error: claimInviteError } = await supabaseValidationClient
      .from('student_invites')
      .update({ is_used: true })
      .eq('id', validatedInvite.id)
      .eq('is_used', false)
      .gt('expires_at', nowIso)
      .select('id, invite_token, created_student_id, expires_at, is_used')
      .single();

    if (claimInviteError || !claimedInvite) {
      console.error('OCB-09: Failed to claim Oura invite (replay/expired/race)');
      return new Response('Invalid OAuth state', { status: 400 });
    }

    validatedInvite = claimedInvite as ValidatedOuraInvite;

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

    const buildOuraErrorUrl = (reason: string): string => {
      const params = new URLSearchParams({
        student_id,
        invite_token: validatedInvite.invite_token,
        reason,
      });
      return `${frontendUrl}/onboarding/oura-error?${params.toString()}`;
    };

    const releaseInviteForRetry = async (reason: string) => {
      const { error: releaseError } = await supabaseValidationClient
        .from('student_invites')
        .update({ is_used: false })
        .eq('id', validatedInvite.id);

      if (releaseError) {
        console.error(`OCB-09: Failed to release Oura invite after ${reason}:`, releaseError);
      }
    };

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
      // OCB-07: Do NOT log the raw response body — it can echo client_id
      // (and rarely client_secret in misconfigurations) back from Oura's
      // error envelope. Surface only status + parsed error fields.
      const errorText = await tokenResponse.text();
      let errorCode: string | null = null;
      let errorDescription: string | null = null;
      try {
        const parsed = JSON.parse(errorText) as Record<string, unknown>;
        if (typeof parsed.error === 'string') errorCode = parsed.error;
        if (typeof parsed.error_description === 'string') {
          errorDescription = parsed.error_description;
        }
      } catch (_parseError) {
        // Non-JSON response — keep code/description null and only surface status.
      }
      console.error('Oura token exchange failed', {
        status: tokenResponse.status,
        errorCode,
        errorDescription,
      });

      await releaseInviteForRetry('token_exchange');
      return Response.redirect(buildOuraErrorUrl('token_exchange'), 302);
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
      
      await releaseInviteForRetry('database');
      return Response.redirect(buildOuraErrorUrl('database'), 302);
    }

    console.log(`Oura connection saved for student ${student_id}`);

    if (invite_token && invite_token !== 'retry') {
      const { error: inviteUpdateError } = await supabaseClient
        .from('student_invites')
        .update({ is_used: true, used_at: new Date().toISOString() })
        .eq('id', invite_token);

      if (inviteUpdateError) {
        console.error('Failed to mark Oura invite as used:', inviteUpdateError);
      }
    }

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
    // Came from a valid Oura invite / onboarding link.
    console.log('Redirecting to onboarding success');
    return Response.redirect(`${frontendUrl}/onboarding/success?student_id=${student_id}`, 302);
  } catch (error) {
    console.error('Error in oura-callback:', error);
    return new Response('Internal server error', { status: 500 });
  }
});
