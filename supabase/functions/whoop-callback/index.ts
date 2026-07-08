import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { resolveFrontendUrl as sharedResolveFrontendUrl } from '../_shared/frontendOrigin.ts';
import { claimInvite, parseState, releaseInvite } from '../_shared/wearable/oauthState.ts';
import { exchangeCode } from '../_shared/wearable/tokens.ts';
import { WHOOP } from '../_shared/wearable/providerConfig.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const decodeBase64Url = (value: string | null): string | null => {
  if (!value) return null;
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
    return atob(normalized + padding);
  } catch (_e) {
    return null;
  }
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
      return new Response('Missing authorization code or state', { status: 400 });
    }

    // State echoes back via Whoop — validate as untrusted input.
    let parsed;
    try {
      parsed = parseState(state);
    } catch (_e) {
      return new Response('Invalid OAuth state', { status: 400 });
    }
    const { student_id, invite_id, encodedOrigin } = parsed;

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supa = createClient(supabaseUrl ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    // Atomically claim the invite (replay/expiry/race protection) before exchange.
    let invite;
    try {
      invite = await claimInvite(supa, invite_id, student_id);
    } catch (_e) {
      return new Response('Invalid OAuth state', { status: 400 });
    }

    const redirectUri = `${supabaseUrl}/functions/v1/whoop-callback`;
    const frontendUrl = sharedResolveFrontendUrl(req, decodeBase64Url(encodedOrigin));
    if (!frontendUrl) {
      return new Response('Frontend URL inválida para callback Whoop', { status: 400 });
    }

    const errorUrl = (reason: string): string =>
      `${frontendUrl}/onboarding/whoop-error?${new URLSearchParams({ student_id, invite_token: invite.invite_token, reason }).toString()}`;

    let tokens;
    try {
      tokens = await exchangeCode(WHOOP, code, redirectUri);
    } catch (e) {
      console.error('Whoop token exchange failed:', String(e));
      await releaseInvite(supa, invite_id);
      return Response.redirect(errorUrl('token_exchange'), 302);
    }

    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + (tokens.expires_in ?? 3600));

    const { error: storeErr } = await supa.rpc('store_whoop_tokens', {
      p_student_id: student_id,
      p_access_token: tokens.access_token,
      p_refresh_token: tokens.refresh_token,
      p_token_expires_at: expiresAt.toISOString(),
    });
    if (storeErr) {
      console.error('Failed to save Whoop connection:', storeErr);
      await releaseInvite(supa, invite_id);
      return Response.redirect(errorUrl('database'), 302);
    }

    await supa.from('student_invites').update({ used_at: new Date().toISOString() }).eq('id', invite_id);

    // Initial backfill (whoop-sync computes its own last-30-days window).
    try {
      await fetch(`${supabaseUrl}/functions/v1/whoop-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({ student_id }),
      }).then((r) => r.text());
    } catch (e) {
      console.error('Whoop initial sync failed to trigger:', e);
    }

    return Response.redirect(`${frontendUrl}/onboarding/success?student_id=${student_id}`, 302);
  } catch (error) {
    console.error('Error in whoop-callback:', error);
    return new Response('Internal server error', { status: 500 });
  }
});
