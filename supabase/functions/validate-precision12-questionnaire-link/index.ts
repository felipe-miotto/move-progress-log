/**
 * E3.6 — Edge function: validate-precision12-questionnaire-link
 *
 * Lookup read-only do token magic-link. Usado pela página pública
 * `/precision-questionnaire/:token` ANTES de mostrar o formulário,
 * pra evitar que o aluno preencha 8 telas e depois descubra que o
 * link já expirou.
 *
 * Também devolve `require_birthdate` (true se `students.birth_date` é
 * null) pra UI ativar/desativar campo de data de nascimento conforme D11.
 *
 * Endpoint público — sem Authorization header.
 *
 * Resposta sucesso (200):
 *   { ok: true, require_birthdate: boolean, expires_at: string,
 *     questionnaire_version: "precision12_v1" }
 *
 * Resposta erro (400):
 *   { error: "Link inválido ou expirado" }  // genérico, anti-enumeração
 *
 * Segurança:
 *   - Token puro nunca logado (só calcula hash + descarta).
 *   - Service role usado apenas dentro da edge.
 *   - Nunca retorna nome/email/student_id/assessment_id (anti-enumeração).
 *   - Erros homogêneos (mesma mensagem pra "não existe", "revogado",
 *     "usado", "expirado", "tipo errado", "status errado").
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";

// Browser-compatible CORS allow-list.
// `supabase.functions.invoke` envia authorization (anon key), apikey e
// headers x-supabase-client-*; um preflight com allow-list mais restrita
// derruba a chamada antes de chegar no handler. Mantém paridade com
// create-precision12-questionnaire-link e generate-oura-connect-link.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

const GENERIC_TOKEN_ERROR = "Link inválido ou expirado";
const QUESTIONNAIRE_VERSION = "precision12_v1";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { headers: jsonHeaders, status });
}

async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("[validate-p12-link] Missing env vars");
      return jsonResponse({ error: "Server configuration error" }, 500);
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return jsonResponse({ error: "Payload inválido" }, 400);
    }
    const token = typeof body.token === "string" ? body.token : "";
    if (!token || token.length < 16) {
      return jsonResponse({ error: GENERIC_TOKEN_ERROR }, 400);
    }

    const tokenHash = await sha256Hex(token);

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Lookup do link
    const { data: link, error: linkError } = await adminClient
      .from("precision12_questionnaire_links")
      .select("assessment_id, used_at, revoked_at, expires_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (linkError) {
      console.error("[validate-p12-link] link lookup error:", linkError.message);
      return jsonResponse({ error: GENERIC_TOKEN_ERROR }, 400);
    }
    if (!link) {
      return jsonResponse({ error: GENERIC_TOKEN_ERROR }, 400);
    }
    if (link.revoked_at || link.used_at) {
      return jsonResponse({ error: GENERIC_TOKEN_ERROR }, 400);
    }
    if (new Date(link.expires_at).getTime() <= Date.now()) {
      return jsonResponse({ error: GENERIC_TOKEN_ERROR }, 400);
    }

    // 2. Lookup do assessment (valida tipo + status)
    const { data: assessment, error: assessmentError } = await adminClient
      .from("assessments")
      .select("student_id, assessment_type, status")
      .eq("id", link.assessment_id)
      .maybeSingle();

    if (assessmentError || !assessment) {
      console.error("[validate-p12-link] assessment lookup:", assessmentError?.message);
      return jsonResponse({ error: GENERIC_TOKEN_ERROR }, 400);
    }
    if (
      assessment.assessment_type !== "questionnaire_precision12" ||
      !["in_progress", "blocked"].includes(assessment.status)
    ) {
      return jsonResponse({ error: GENERIC_TOKEN_ERROR }, 400);
    }

    // 3. Lookup do birth_date do aluno pra decidir require_birthdate
    const { data: student, error: studentError } = await adminClient
      .from("students")
      .select("birth_date")
      .eq("id", assessment.student_id)
      .maybeSingle();

    if (studentError || !student) {
      console.error("[validate-p12-link] student lookup:", studentError?.message);
      return jsonResponse({ error: GENERIC_TOKEN_ERROR }, 400);
    }

    const requireBirthdate = student.birth_date == null;

    // 4. Retornar metadata mínima (sem dados sensíveis)
    return jsonResponse({
      ok: true,
      require_birthdate: requireBirthdate,
      expires_at: link.expires_at,
      questionnaire_version: QUESTIONNAIRE_VERSION,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[validate-precision12-questionnaire-link] uncaught:", message);
    return jsonResponse({ error: GENERIC_TOKEN_ERROR }, 400);
  }
});
