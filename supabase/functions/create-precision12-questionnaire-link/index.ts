/**
 * E3.4 — Edge function: create-precision12-questionnaire-link
 *
 * Gera link mágico para o aluno responder o Questionário Precision 12.
 *
 * Fluxo:
 *   1. Autentica caller (coach/trainer ou admin).
 *   2. Valida ownership do student (coach dono ou admin).
 *   3. Se `assessment_id` fornecido: valida que pertence ao student,
 *      assessment_type = `questionnaire_precision12`, status compatível.
 *   4. Se não: cria parent `assessments` row com
 *      assessment_type='questionnaire_precision12', status='in_progress'.
 *   5. Gera token aleatório forte (32 bytes base64url). Persiste apenas
 *      SHA-256 hex em `precision12_questionnaire_links.token_hash`.
 *   6. Se já existe link ativo pra esse assessment, revoga antes de criar
 *      novo (parcial unique index garante 1 ativo).
 *   7. Retorna URL pública `/precision-questionnaire/<token>`.
 *
 * Token puro NUNCA persiste — só retornado na response. Coach copia/envia.
 *
 * Não cria row em `questionnaire_responses` — placeholder vazio seria
 * lixo. Edge function `submit-precision12-questionnaire` (E3.5) cria a
 * row no submit final.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";
import { resolveFrontendUrl } from "../_shared/frontendOrigin.ts";

// ────────────────────────────────────────────────────────────────────────────
// Constantes
// ────────────────────────────────────────────────────────────────────────────

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

const DEFAULT_TTL_DAYS = 7;
const MIN_TTL_DAYS = 1;
const MAX_TTL_DAYS = 14;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ASSESSMENT_TYPE = "questionnaire_precision12" as const;

/** Status do assessment em que aceitamos (re)gerar link. */
const REISSUABLE_STATUSES = new Set(["in_progress", "blocked"]);

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { headers: jsonHeaders, status });
}

function clampTtl(rawValue: unknown): number {
  if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) {
    return DEFAULT_TTL_DAYS;
  }
  return Math.min(MAX_TTL_DAYS, Math.max(MIN_TTL_DAYS, Math.trunc(rawValue)));
}

/**
 * Gera token aleatório forte (32 bytes → base64url, ~43 chars).
 * Usa crypto.getRandomValues (CSPRNG) disponível no Deno runtime.
 */
function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  // base64url sem padding
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Hash SHA-256 do token puro (hex lowercase).
 * Usa subtle crypto built-in do Deno.
 */
async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Data ISO (YYYY-MM-DD) no fuso de São Paulo. Usa Intl.DateTimeFormat
 * com locale `sv-SE` (Swedish) que produz nativamente o formato
 * `YYYY-MM-DD`, evitando bug onde `new Date().toISOString()` retorna a
 * data em UTC e diverge do calendário local Brasil após 21h.
 */
function todayInSaoPaulo(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
}

// ────────────────────────────────────────────────────────────────────────────
// Handler
// ────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 0. Env vars
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      console.error("[create-precision12-questionnaire-link] Missing env vars");
      return jsonResponse(
        { error: "Missing Supabase environment variables" },
        500,
      );
    }

    // 1. Autenticar caller via JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    // 2. Service-role client (bypassa RLS pra operações de escrita
    // controladas, sempre após validações no código abaixo)
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verifica se caller é admin (pra liberar geração em alunos de outros trainers)
    const { data: adminRoleRow } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    const isAdmin = !!adminRoleRow;

    // 3. Body
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return jsonResponse({ error: "Payload inválido" }, 400);
    }

    const studentId = typeof body.student_id === "string" ? body.student_id.trim() : "";
    const assessmentIdRaw =
      typeof body.assessment_id === "string" ? body.assessment_id.trim() : "";
    const ttlDays = clampTtl(body.ttl_days);
    const frontendOrigin =
      typeof body.frontend_origin === "string" ? body.frontend_origin.trim() : null;

    if (!studentId || !UUID_RE.test(studentId)) {
      return jsonResponse({ error: "student_id inválido" }, 400);
    }
    if (assessmentIdRaw && !UUID_RE.test(assessmentIdRaw)) {
      return jsonResponse({ error: "assessment_id inválido" }, 400);
    }

    // 4. Resolver URL pública ANTES de qualquer escrita no banco
    //    (evita assessment/link órfão se origin inválido)
    const baseUrl = resolveFrontendUrl(req, frontendOrigin);
    if (!baseUrl) {
      console.error(
        "[create-p12-link] no trusted public origin",
        {
          publicAppUrlSet: Boolean(
            Deno.env.get("PUBLIC_APP_URL") ?? Deno.env.get("APP_PUBLIC_URL"),
          ),
          siteUrlSet: Boolean(Deno.env.get("SITE_URL")),
        },
      );
      return jsonResponse(
        {
          error:
            "Não foi possível determinar a URL pública do app. Configure PUBLIC_APP_URL nos secrets do Supabase.",
        },
        400,
      );
    }

    // 5. Validar ownership do student
    const { data: student, error: studentError } = await adminClient
      .from("students")
      .select("id, trainer_id, name")
      .eq("id", studentId)
      .maybeSingle();

    if (studentError) {
      console.error("[create-p12-link] student fetch error:", studentError);
      return jsonResponse({ error: "Falha ao buscar aluno" }, 500);
    }
    if (!student) {
      return jsonResponse({ error: "Aluno não encontrado" }, 404);
    }
    if (!isAdmin && student.trainer_id !== user.id) {
      return jsonResponse({ error: "Acesso negado a esse aluno" }, 403);
    }

    // 5. Resolver/criar assessment
    let assessmentId: string;

    if (assessmentIdRaw) {
      // Reusar assessment existente: validar
      const { data: assessment, error: assessmentError } = await adminClient
        .from("assessments")
        .select("id, student_id, assessment_type, status")
        .eq("id", assessmentIdRaw)
        .maybeSingle();

      if (assessmentError) {
        console.error("[create-p12-link] assessment fetch error:", assessmentError);
        return jsonResponse({ error: "Falha ao buscar avaliação" }, 500);
      }
      if (!assessment) {
        return jsonResponse({ error: "Avaliação não encontrada" }, 404);
      }
      if (assessment.student_id !== studentId) {
        return jsonResponse(
          { error: "Avaliação não pertence ao aluno informado" },
          400,
        );
      }
      if (assessment.assessment_type !== ASSESSMENT_TYPE) {
        return jsonResponse(
          { error: "Avaliação não é do tipo questionnaire_precision12" },
          400,
        );
      }
      if (!REISSUABLE_STATUSES.has(assessment.status)) {
        return jsonResponse(
          {
            error: `Não é possível gerar link: status atual é '${assessment.status}'. Apenas 'in_progress' ou 'blocked' permitem reemissão.`,
          },
          400,
        );
      }
      assessmentId = assessment.id;
    } else {
      // Criar assessment novo (status='in_progress'). RPC create_precision12_assessment
      // BLOQUEIA questionnaire_precision12 (proposital — fluxo via edge); INSERT
      // direto via service role é a forma correta aqui.
      const trainerId = isAdmin ? student.trainer_id ?? user.id : user.id;

      const todayIso = todayInSaoPaulo();

      const { data: assessment, error: insertAssessmentError } = await adminClient
        .from("assessments")
        .insert({
          student_id: studentId,
          trainer_id: trainerId,
          professional_id: trainerId, // legacy compat
          assessment_type: ASSESSMENT_TYPE,
          assessment_date: todayIso,
          status: "in_progress",
        })
        .select("id")
        .single();

      if (insertAssessmentError || !assessment) {
        console.error("[create-p12-link] assessment insert error:", insertAssessmentError);
        return jsonResponse({ error: "Falha ao criar avaliação" }, 500);
      }
      assessmentId = assessment.id;
    }

    // 6. Revogar links ativos anteriores do mesmo assessment (decisão:
    // preferimos revogar e gerar novo; consistente com UX de "regerar link")
    const nowIso = new Date().toISOString();
    const { error: revokeError } = await adminClient
      .from("precision12_questionnaire_links")
      .update({ revoked_at: nowIso })
      .eq("assessment_id", assessmentId)
      .is("used_at", null)
      .is("revoked_at", null);

    if (revokeError) {
      console.error("[create-p12-link] revoke error:", revokeError);
      return jsonResponse({ error: "Falha ao revogar link anterior" }, 500);
    }

    // 7. Gerar token + hash
    const token = generateToken();
    const tokenHash = await sha256Hex(token);

    const expiresAt = new Date();
    expiresAt.setUTCDate(expiresAt.getUTCDate() + ttlDays);

    const trainerIdForLink = isAdmin ? student.trainer_id ?? user.id : user.id;

    const { error: insertLinkError } = await adminClient
      .from("precision12_questionnaire_links")
      .insert({
        assessment_id: assessmentId,
        student_id: studentId,
        trainer_id: trainerIdForLink,
        token_hash: tokenHash,
        expires_at: expiresAt.toISOString(),
        created_by: user.id,
      });

    if (insertLinkError) {
      console.error("[create-p12-link] link insert error:", insertLinkError);
      return jsonResponse({ error: "Falha ao criar link" }, 500);
    }

    // baseUrl já resolvido e validado no passo 4 (antes de qualquer write)
    const inviteUrl = `${baseUrl}/precision-questionnaire/${token}`;

    console.log("[create-p12-link] link generated for student", {
      studentId,
      assessmentId,
      ttlDays,
    });

    return jsonResponse({
      invite_url: inviteUrl,
      token,
      expires_at: expiresAt.toISOString(),
      assessment_id: assessmentId,
      student_name: student.name,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[create-precision12-questionnaire-link] uncaught:", error);
    return jsonResponse({ error: message }, 500);
  }
});
