import { assertEquals } from "jsr:@std/assert";
import { exchangeCode, refreshAccessToken } from "./tokens.ts";
import { WHOOP } from "./providerConfig.ts";

Deno.test("exchangeCode POSTs authorization_code to the provider token URL", async () => {
  const orig = globalThis.fetch;
  let captured: { url: string; body: string } | null = null;
  // deno-lint-ignore no-explicit-any
  globalThis.fetch = ((url: any, init: any) => {
    captured = { url: String(url), body: String(init?.body ?? "") };
    return Promise.resolve(
      new Response(JSON.stringify({ access_token: "a1", refresh_token: "r1", expires_in: 3600 }), { status: 200 }),
    );
  }) as typeof fetch;
  try {
    const out = await exchangeCode(WHOOP, "code123", "https://x/functions/v1/whoop-callback");
    assertEquals(out.access_token, "a1");
    assertEquals(captured!.url, WHOOP.tokenUrl);
    assertEquals(captured!.body.includes("grant_type=authorization_code"), true);
    assertEquals(captured!.body.includes("code=code123"), true);
  } finally {
    globalThis.fetch = orig;
  }
});

Deno.test("refreshAccessToken POSTs to the provider token URL with offline scope", async () => {
  const orig = globalThis.fetch;
  let captured: { url: string; body: string } | null = null;
  // deno-lint-ignore no-explicit-any
  globalThis.fetch = ((url: any, init: any) => {
    captured = { url: String(url), body: String(init?.body ?? "") };
    return Promise.resolve(
      new Response(JSON.stringify({ access_token: "a1", refresh_token: "r1", expires_in: 3600 }), { status: 200 }),
    );
  }) as typeof fetch;
  try {
    const out = await refreshAccessToken(WHOOP, "r0");
    assertEquals(out.access_token, "a1");
    assertEquals(out.refresh_token, "r1");
    assertEquals(captured!.url, WHOOP.tokenUrl);
    assertEquals(captured!.body.includes("grant_type=refresh_token"), true);
    assertEquals(captured!.body.includes("refresh_token=r0"), true);
    assertEquals(captured!.body.includes("scope=offline"), true);
  } finally {
    globalThis.fetch = orig;
  }
});
