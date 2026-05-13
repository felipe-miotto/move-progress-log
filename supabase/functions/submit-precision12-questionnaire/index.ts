/**
 * E3.5 — Edge function: submit-precision12-questionnaire
 *
 * Recebe submit do Questionário Precision 12 do aluno (via link mágico).
 * Endpoint público (sem Authorization). Toda escrita é atômica via RPC
 * `submit_precision12_questionnaire_response`.
 *
 * Fluxo:
 *   1. Aceita request pública (sem JWT) com body { token, payload }.
 *   2. Valida body shape.
 *   3. Calcula SHA-256 hex do token recebido.
 *   4. Valida payload via schema Zod compartilhado (_shared/...).
 *   5. Normaliza payload (vazios → null, condicionais → null se gatilho
 *      é false, etc).
 *   6. Chama RPC com (token_hash, payload_normalizado).
 *   7. RPC roda transação atômica:
 *      - Valida link (não usado/revogado/expirado)
 *      - Valida assessment (tipo, status)
 *      - Bloqueia submit duplicado
 *      - INSERT em questionnaire_responses (forçando assessment_id,
 *        questionnaire_version, submitted_at; nunca aceita parq_blocked
 *        do client — generated column)
 *      - UPDATE em assessments.status (completed ou blocked baseado em
 *        parq_blocked)
 *      - UPDATE em precision12_questionnaire_links.used_at
 *   8. Retorna resposta segura (sem token, sem payload).
 *
 * Segurança:
 *   - Token puro NUNCA logado.
 *   - Erros de token (não existe / revogado / usado / expirado) viram
 *     resposta genérica "Link inválido ou expirado" pra evitar
 *     enumeração.
 *   - assessment_id NÃO é aceito do payload do aluno (RPC ignora).
 *   - parq_blocked NÃO é aceito (RPC remove e gera via SQL).
 *   - submitted_at NÃO é aceito (RPC força now()).
 *   - Service role usado APENAS dentro da edge function.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";
import { precision12SubmitSchema, normalizeForSubmit } from "../_shared/precision12QuestionnaireValidation.ts";

// ────────────────────────────────────────────────────────────────────────────
// Constantes
// ────────────────────────────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

/** Mensagem genérica para erros relacionados ao token — evita enumeração. */
const GENERIC_TOKEN_ERROR = "Link inválido ou expirado";

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { headers: jsonHeaders, status });
}

/**
 * Hash SHA-256 hex lowercase. Mesma função usada em
 * create-precision12-questionnaire-link (paridade obrigatória — sem isso,
 * lookup por token falha).
 */
async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ────────────────────────────────────────────────────────────────────────────
// Handler
// ────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    // 0. Env vars (apenas service role — endpoint público)
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("[submit-p12-questionnaire] Missing env vars");
      return jsonResponse({ error: "Server configuration error" }, 500);
    }

    // 1. Body shape
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return jsonResponse({ error: "Payload inválido" }, 400);
    }

    const token = typeof body.token === "string" ? body.token : "";
    if (!token || token.length < 16) {
      // Token deve ter pelo menos 16 chars (real tem ~43)
      return jsonResponse({ error: GENERIC_TOKEN_ERROR }, 400);
    }
    if (!body.payload || typeof body.payload !== "object" || Array.isArray(body.payload)) {
      return jsonResponse({ error: "Payload inválido" }, 400);
    }

    // 2. Validar payload via Zod (mesmas regras do app)
    const parseResult = precision12SubmitSchema.safeParse(body.payload);
    if (!parseResult.success) {
      // Devolve issues estruturados (sem dados sensíveis)
      const issues = parseResult.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      }));
      console.error("[submit-p12-questionnaire] payload validation failed", {
        issueCount: issues.length,
      });
      return jsonResponse({ error: "Respostas inválidas", issues }, 400);
    }

    // 3. Normalizar payload (vazios → null, condicionais → null, etc.)
    const normalized = normalizeForSubmit(parseResult.data);

    // 4. Calcular SHA-256 do token. Token puro NUNCA é logado nem
    //    persistido — apenas o hash trafega pro banco.
    const tokenHash = await sha256Hex(token);

    // 5. Service role client (única forma de chamar a RPC, que tem
    //    GRANT apenas pro service_role)
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // 6. Chamar RPC transacional
    const { data, error } = await adminClient.rpc(
      // @ts-expect-error: types.ts pode ainda não conhecer a RPC nova.
      // O Lovable regenera types após aplicar a migration.
      "submit_precision12_questionnaire_response",
      {
        p_token_hash: tokenHash,
        p_payload: normalized,
      },
    );

    if (error) {
      // Erros de token: P0002 (invalid_token). Genérico pra evitar enumeração.
      // Erro 23505 (unique_violation) significa already_submitted.
      if (error.code === "P0002") {
        console.warn("[submit-p12-questionnaire] invalid token attempt");
        return jsonResponse({ error: GENERIC_TOKEN_ERROR }, 400);
      }
      if (error.code === "23505" || /already_submitted/i.test(error.message ?? "")) {
        return jsonResponse(
          { error: "Este questionário já foi respondido. Solicite um novo link ao seu coach." },
          409,
        );
      }
      console.error("[submit-p12-questionnaire] RPC error:", {
        code: error.code,
        message: error.message,
      });
      return jsonResponse({ error: "Falha ao processar respostas" }, 500);
    }

    if (!data || typeof data !== "object") {
      console.error("[submit-p12-questionnaire] RPC returned empty");
      return jsonResponse({ error: "Falha ao processar respostas" }, 500);
    }

    // 7. Retornar resposta segura (sem token, sem payload completo)
    const result = data as {
      ok: boolean;
      assessment_id: string;
      status: string;
      parq_blocked: boolean;
      submitted_at: string;
    };

    console.log("[submit-p12-questionnaire] success", {
      assessmentId: result.assessment_id,
      status: result.status,
      parqBlocked: result.parq_blocked,
    });

    return jsonResponse({
      ok: result.ok,
      assessment_id: result.assessment_id,
      status: result.status,
      parq_blocked: result.parq_blocked,
      submitted_at: result.submitted_at,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[submit-precision12-questionnaire] uncaught:", message);
    return jsonResponse({ error: "Erro inesperado" }, 500);
  }
});
