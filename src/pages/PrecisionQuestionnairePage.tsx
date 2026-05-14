/**
 * E3.6 — Página pública do Questionário Precision 12.
 *
 * Rota: /precision-questionnaire/:token
 *
 * Estados:
 *   1. loading     — chamando validate-precision12-questionnaire-link
 *   2. invalid     — token inválido/expirado/usado/revogado
 *   3. form        — aluno preenchendo (delega pro QuestionnaireFlow)
 *   4. submitting  — POST pra submit-precision12-questionnaire em curso
 *   5. completed   — submit OK e PAR-Q negativo
 *   6. blocked     — submit OK mas PAR-Q positivo (precisa revisão coach)
 *   7. error       — erro de rede / 500 / submit duplicado
 *
 * Segurança:
 *   - Token NUNCA salvo em localStorage/sessionStorage. Vive só na URL e
 *     em memória do componente.
 *   - Token NUNCA logado.
 *   - Payload é enviado ao edge `submit-precision12-questionnaire`;
 *     normalização e regras finais (PAR-Q soft block, status do
 *     assessment) ficam server-side.
 */

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AlertTriangle, CheckCircle2, ClipboardList, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

import { QuestionnaireFlow } from "@/components/assessments/questionnaire/QuestionnaireFlow";

// ────────────────────────────────────────────────────────────────────────────

interface ValidateResponse {
  ok: true;
  require_birthdate: boolean;
  expires_at: string;
  questionnaire_version: string;
}

interface SubmitResponse {
  ok: true;
  assessment_id: string;
  status: "completed" | "blocked";
  parq_blocked: boolean;
  submitted_at: string;
}

type PageState =
  | { kind: "loading" }
  | { kind: "invalid"; message: string }
  | { kind: "form"; requireBirthdate: boolean }
  | { kind: "submitting" }
  | { kind: "done"; status: "completed" | "blocked" }
  | { kind: "error"; message: string };

// ────────────────────────────────────────────────────────────────────────────

export default function PrecisionQuestionnairePage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<PageState>({ kind: "loading" });

  // Valida token ao montar
  useEffect(() => {
    if (!token) {
      setState({ kind: "invalid", message: "Link inválido ou expirado" });
      return;
    }

    let cancelled = false;
    const validate = async () => {
      try {
        const { data, error } = await supabase.functions.invoke<ValidateResponse>(
          "validate-precision12-questionnaire-link",
          { body: { token } },
        );

        if (cancelled) return;

        if (error || !data || !data.ok) {
          setState({
            kind: "invalid",
            message: "Link inválido ou expirado",
          });
          return;
        }

        setState({ kind: "form", requireBirthdate: data.require_birthdate });
      } catch {
        if (cancelled) return;
        setState({ kind: "invalid", message: "Link inválido ou expirado" });
      }
    };

    validate();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleSubmit = async (payload: Record<string, unknown>) => {
    if (!token) return;

    setState({ kind: "submitting" });
    try {
      const { data, error } = await supabase.functions.invoke<SubmitResponse>(
        "submit-precision12-questionnaire",
        { body: { token, payload } },
      );

      if (error || !data) {
        // Não vazar detalhes do erro pro aluno
        const msg = error?.message ?? "Falha ao enviar respostas";
        // Se for 409 já submetido / link inválido, usa mensagem genérica
        if (/already_submitted|409/i.test(msg) || /400|invalid/i.test(msg)) {
          setState({
            kind: "error",
            message:
              "Não foi possível registrar suas respostas. Verifique se o link ainda é válido ou solicite um novo ao seu coach.",
          });
          return;
        }
        setState({
          kind: "error",
          message: "Erro inesperado ao enviar. Tente novamente em alguns minutos.",
        });
        return;
      }

      setState({ kind: "done", status: data.status });
    } catch {
      setState({
        kind: "error",
        message: "Erro inesperado ao enviar. Tente novamente em alguns minutos.",
      });
    }
  };

  // ─── Renderização por estado ────────────────────────────────────────────

  if (state.kind === "loading") {
    return (
      <CenteredCard>
        <div
          className="flex flex-col items-center gap-3 py-8"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Validando seu link…</p>
        </div>
      </CenteredCard>
    );
  }

  if (state.kind === "invalid") {
    return (
      <CenteredCard
        icon={<AlertTriangle className="h-10 w-10 text-destructive" />}
        title="Link inválido"
        description={state.message}
      >
        <p className="text-sm text-muted-foreground">
          Solicite um novo link ao seu coach Fabrik.
        </p>
      </CenteredCard>
    );
  }

  if (state.kind === "error") {
    return (
      <CenteredCard
        icon={<AlertTriangle className="h-10 w-10 text-destructive" />}
        title="Algo deu errado"
        description={state.message}
      >
        <Button onClick={() => window.location.reload()}>Recarregar</Button>
      </CenteredCard>
    );
  }

  if (state.kind === "submitting") {
    return (
      <CenteredCard>
        <div
          className="flex flex-col items-center gap-3 py-8"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Enviando suas respostas…</p>
        </div>
      </CenteredCard>
    );
  }

  if (state.kind === "done") {
    if (state.status === "blocked") {
      return (
        <CenteredCard
          icon={<AlertTriangle className="h-10 w-10 text-amber-500" />}
          title="Respostas registradas"
          description="Algumas respostas indicam necessidade de revisão do coach antes de prosseguir."
        >
          <p className="text-sm text-muted-foreground">
            A equipe Fabrik vai avaliar suas respostas e orientar o próximo passo.
            Este questionário não substitui avaliação médica.
          </p>
        </CenteredCard>
      );
    }
    return (
      <CenteredCard
        icon={<CheckCircle2 className="h-10 w-10 text-emerald-500" />}
        title="Respostas registradas com sucesso"
        description="O coach Fabrik vai conferir e dar próximos passos."
      />
    );
  }

  // state.kind === "form"
  return (
    <QuestionnaireFlow
      requireBirthdate={state.requireBirthdate}
      onSubmit={handleSubmit}
    />
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers visuais
// ────────────────────────────────────────────────────────────────────────────

interface CenteredCardProps {
  icon?: React.ReactNode;
  title?: string;
  description?: string;
  children?: React.ReactNode;
}

function CenteredCard({ icon, title, description, children }: CenteredCardProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex items-center justify-center">
            {icon ?? <ClipboardList className="h-10 w-10 text-primary" />}
          </div>
          {title && <CardTitle>{title}</CardTitle>}
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        {children && (
          <CardContent className="flex flex-col items-center gap-3 text-center">
            {children}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
