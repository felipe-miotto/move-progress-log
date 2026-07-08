import { ProviderConfig } from "./providerConfig.ts";

export interface OAuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
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
  if (!res.ok) throw new Error(`token refresh failed: ${res.status}`);
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
  if (!res.ok) throw new Error(`token exchange failed: ${res.status}`);
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
