import { ProviderConfig } from "./providerConfig.ts";

export interface OAuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

// Thrown on non-2xx from the provider's OAuth token endpoint. Exposes the HTTP
// status and the provider's `error` code (parsed from a JSON body when
// available) so callers can distinguish permanent auth failures
// (invalid_grant → revoked/rotated) from transient ones (5xx, 429, network,
// misconfig like invalid_client). The raw response body stays on `.body` and
// is NEVER included in `Error.message`, which surfaces through
// whoop_sync_logs and JSON responses.
export class TokenHttpError extends Error {
  status: number;
  errorCode: string | null;
  body: string;
  constructor(kind: string, status: number, body: string) {
    let errorCode: string | null = null;
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed === "object" && typeof parsed.error === "string") {
        errorCode = parsed.error;
      }
    } catch { /* non-JSON body → keep errorCode null */ }
    super(errorCode ? `${kind} failed: ${status} ${errorCode}` : `${kind} failed: ${status}`);
    this.name = "TokenHttpError";
    this.status = status;
    this.errorCode = errorCode;
    this.body = body;
  }
}

// Refresh an access token using the provider's OAuth token endpoint.
// WHOOP requires `scope=offline` on refresh to keep issuing refresh tokens.
export async function refreshAccessToken(cfg: ProviderConfig, refreshToken: string): Promise<OAuthTokens> {
  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: Deno.env.get(cfg.secretEnv.clientId) ?? "",
      client_secret: Deno.env.get(cfg.secretEnv.clientSecret) ?? "",
      scope: "offline",
    }).toString(),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new TokenHttpError("token refresh", res.status, body);
  }
  return await res.json();
}

// Exchange an authorization code for tokens at the provider's token endpoint.
export async function exchangeCode(cfg: ProviderConfig, code: string, redirectUri: string): Promise<OAuthTokens> {
  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: Deno.env.get(cfg.secretEnv.clientId) ?? "",
      client_secret: Deno.env.get(cfg.secretEnv.clientSecret) ?? "",
    }).toString(),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new TokenHttpError("token exchange", res.status, body);
  }
  return await res.json();
}

// deno-lint-ignore no-explicit-any
export async function storeTokens(supa: any, provider: string, studentId: string, t: { access_token: string; refresh_token: string; expires_at: string }) {
  return supa.rpc(`store_${provider}_tokens`, {
    p_student_id: studentId,
    p_access_token: t.access_token,
    p_refresh_token: t.refresh_token,
    p_token_expires_at: t.expires_at,
  });
}

// deno-lint-ignore no-explicit-any
export async function getAccessToken(supa: any, provider: string, studentId: string): Promise<string | null> {
  const { data } = await supa.rpc(`get_${provider}_access_token`, { p_student_id: studentId });
  return (data as string | null) ?? null;
}
