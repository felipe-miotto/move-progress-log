import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "Authorization required" });

    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const token = authHeader.slice("Bearer ".length);
    const { data: { user: caller }, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !caller) return json(401, { error: "Invalid token", detail: authErr?.message });

    const { data: roles, error: roleErr } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);
    if (roleErr) return json(500, { error: "role check failed" });
    if (!roles?.some((r) => r.role === "admin")) return json(403, { error: "Admin required" });

    const body = await req.json().catch(() => null);
    const userId = body?.userId;
    if (!userId || !UUID_RE.test(userId)) return json(400, { error: "Invalid userId" });
    if (userId === caller.id) return json(400, { error: "Cannot delete self" });

    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) return json(500, { error: delErr.message });

    return json(200, { ok: true, deletedUserId: userId });
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : String(e) });
  }
});
