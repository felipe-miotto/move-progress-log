import { WHOOP } from '../_shared/wearable/providerConfig.ts';
import {
  getAccessToken,
  OAuthTokens,
  refreshAccessToken as realRefreshAccessToken,
  storeTokens,
  TokenHttpError,
} from '../_shared/wearable/tokens.ts';
import { errorMessage } from './sync.ts';

const MAX_WINDOW_MS = 90 * 24 * 3600 * 1000;

export interface WindowResult {
  start: string;
  end: string;
}

// Validate optional start/end ISO 8601 strings on the request body. Defaults to
// the last 30 days when both are absent. Returns { error } (string) on any
// validation failure so the caller returns 400 with a clear message.
export function validateWindow(body: Record<string, unknown>): WindowResult | { error: string } {
  const hasStart = typeof body.start === 'string' && body.start.trim().length > 0;
  const hasEnd = typeof body.end === 'string' && body.end.trim().length > 0;
  if (!hasStart && !hasEnd) {
    const end = new Date().toISOString();
    const start = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    return { start, end };
  }
  if (hasStart !== hasEnd) return { error: 'start e end devem ser fornecidos juntos' };
  const startStr = (body.start as string).trim();
  const endStr = (body.end as string).trim();
  const startMs = Date.parse(startStr);
  const endMs = Date.parse(endStr);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return { error: 'start/end devem ser ISO 8601 válidos' };
  }
  if (startMs >= endMs) return { error: 'start deve ser anterior a end' };
  if (endMs - startMs > MAX_WINDOW_MS) return { error: 'janela máxima de 90 dias' };
  return { start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString() };
}

// Classify a token-refresh failure. Permanent = the refresh token itself is
// dead (provider returned invalid_grant → revoked/rotated/expired); only then
// do we deactivate the connection so the trainer must reconnect. Everything
// else — invalid_client (wrong secret in env), non-JSON body, network, 5xx,
// 429 — is transient and must NOT deactivate: those would take down healthy
// connections one by one on a config regression.
export function isPermanentTokenFailure(err: unknown): boolean {
  if (!(err instanceof TokenHttpError)) return false;
  if (err.status !== 400 && err.status !== 401) return false;
  if (err.errorCode === 'invalid_grant') return true;
  // Fallback for providers that don't return a parseable JSON error envelope
  // but still include the code in the raw body.
  return typeof err.body === 'string' && err.body.includes('invalid_grant');
}

export interface RefreshDeps {
  // deno-lint-ignore no-explicit-any
  supa: any;
  refreshAccessToken?: (cfg: typeof WHOOP, refreshToken: string) => Promise<OAuthTokens>;
}

export type RefreshOutcome =
  | { ok: true; accessToken: string }
  | { ok: false; status: number; error: string; permanent: boolean };

// Refresh the WHOOP access token when missing/near-expiry. On failure this
// logs a whoop_sync_logs row (status=failed, error_message prefixed with
// "token_refresh: ") and, for permanent failures (invalid_grant only), sets
// whoop_connections.is_active=false so the cron stops retrying and the UI can
// prompt the trainer to reconnect.
export async function ensureAccessToken(
  deps: RefreshDeps,
  args: { student_id: string; tokenExpiresAt: string | null; currentAccessToken: string | null },
): Promise<RefreshOutcome> {
  const { supa } = deps;
  const refreshFn = deps.refreshAccessToken ?? realRefreshAccessToken;
  const skewMs = 60_000;
  const expMs = args.tokenExpiresAt ? new Date(args.tokenExpiresAt).getTime() : 0;
  const needsRefresh = !args.currentAccessToken || !Number.isFinite(expMs) || Date.now() + skewMs >= expMs;
  if (!needsRefresh) return { ok: true, accessToken: args.currentAccessToken as string };

  try {
    const { data: refreshTok, error: rtErr } = await supa.rpc('get_whoop_refresh_token', { p_student_id: args.student_id });
    if (rtErr) throw rtErr;
    if (!refreshTok) throw new Error('refresh token not found');
    const refreshed = await refreshFn(WHOOP, refreshTok as string);
    const newExp = new Date();
    newExp.setSeconds(newExp.getSeconds() + (refreshed.expires_in ?? 3600));
    // storeTokens returns PostgREST { data, error } and does NOT throw. If the
    // RPC fails after WHOOP rotated the refresh token, we've already lost the
    // new refresh token — surface as TRANSIENT so we don't deactivate a
    // still-valid connection; the next run just refreshes again.
    const { error: storeErr } = await storeTokens(supa, 'whoop', args.student_id, {
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      expires_at: newExp.toISOString(),
    });
    if (storeErr) throw new Error(`persistência: ${errorMessage(storeErr)}`);
    await supa.from('whoop_connections').update({ token_expires_at: newExp.toISOString() }).eq('student_id', args.student_id);
    return { ok: true, accessToken: refreshed.access_token };
  } catch (e) {
    const permanent = isPermanentTokenFailure(e);
    const msg = `token_refresh: ${errorMessage(e)}`;
    await supa.from('whoop_sync_logs').insert({
      student_id: args.student_id,
      status: 'failed',
      error_message: msg,
    });
    if (permanent) {
      await supa.from('whoop_connections').update({ is_active: false }).eq('student_id', args.student_id);
    }
    return { ok: false, status: permanent ? 401 : 502, error: msg, permanent };
  }
}
