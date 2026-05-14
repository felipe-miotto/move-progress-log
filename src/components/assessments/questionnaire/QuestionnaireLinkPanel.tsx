/**
 * E3.7 — Painel do coach pra gerar link do Questionário Precision 12.
 *
 * Substitui o card desabilitado do CreateAssessmentWizard. Fluxo:
 *
 *   idle      → botão "Gerar link"
 *   generating → loading
 *   generated → mostra link + validade + Copiar / Abrir
 *   error     → mensagem amigável
 *
 * Reissue: se já há link na tela e coach clica "Gerar novo link",
 * `window.confirm` antes de chamar (a edge function `create-precision12-
 * questionnaire-link` revoga o link ativo anterior automaticamente —
 * vide D3 do PR #127).
 *
 * Segurança:
 *   - Token / invite_url NUNCA são logados em console.
 *   - Não salva em localStorage/sessionStorage.
 *   - Copy usa navigator.clipboard.writeText com fallback amigável
 *     (toast com instrução de copiar manualmente).
 */

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertTriangle,
  Check,
  ClipboardCopy,
  ExternalLink,
  Loader2,
  RefreshCw,
  Send,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";
import { supabase } from "@/integrations/supabase/client";

// ────────────────────────────────────────────────────────────────────────────

interface CreateLinkResponse {
  invite_url: string;
  token: string;
  expires_at: string;
  assessment_id: string;
  student_name?: string;
}

interface QuestionnaireLinkPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  /** Chamado quando o link é gerado (ou reissue). Permite o caller
   *  trocar de tela / fechar o panel se quiser. */
  onCreated?: (assessmentId: string) => void;
}

type PanelState =
  | { kind: "idle" }
  | { kind: "generating" }
  | {
      kind: "generated";
      inviteUrl: string;
      expiresAt: string;
      assessmentId: string;
    }
  | { kind: "error"; message: string };

const REISSUE_CONFIRM_MESSAGE =
  "Gerar um novo link revoga o anterior. Deseja continuar?";

// ────────────────────────────────────────────────────────────────────────────

export const QuestionnaireLinkPanel = ({
  open,
  onOpenChange,
  studentId,
  onCreated,
}: QuestionnaireLinkPanelProps) => {
  const queryClient = useQueryClient();
  const [state, setState] = useState<PanelState>({ kind: "idle" });
  const [copied, setCopied] = useState(false);

  // Reset visual ao fechar
  useEffect(() => {
    if (!open) {
      setState({ kind: "idle" });
      setCopied(false);
    }
  }, [open]);

  const callCreate = async () => {
    setState({ kind: "generating" });
    setCopied(false);
    try {
      const { data, error } = await supabase.functions.invoke<CreateLinkResponse>(
        "create-precision12-questionnaire-link",
        {
          body: {
            student_id: studentId,
            // frontend_origin é opcional; edge usa PUBLIC_APP_URL se setado,
            // senão valida origin do request — passar window.location.origin
            // ajuda em previews lovable
            frontend_origin: window.location.origin,
          },
        },
      );

      if (error || !data) {
        const message =
          error?.message ?? "Falha ao gerar link. Tente novamente em alguns minutos.";
        setState({ kind: "error", message });
        return;
      }

      setState({
        kind: "generated",
        inviteUrl: data.invite_url,
        expiresAt: data.expires_at,
        assessmentId: data.assessment_id,
      });

      // Atualiza a aba Avaliações pra mostrar o assessment in_progress
      queryClient.invalidateQueries({
        queryKey: ["assessments", "by-student", studentId],
      });
      queryClient.invalidateQueries({ queryKey: ["student", studentId] });

      onCreated?.(data.assessment_id);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro inesperado ao gerar link";
      setState({ kind: "error", message });
    }
  };

  const handleGenerate = () => {
    if (state.kind === "generated") {
      // Reissue precisa de confirmação
      const confirmed = window.confirm(REISSUE_CONFIRM_MESSAGE);
      if (!confirmed) return;
    }
    void callCreate();
  };

  const handleCopy = async () => {
    if (state.kind !== "generated") return;
    try {
      await navigator.clipboard.writeText(state.inviteUrl);
      setCopied(true);
      notify.success("Link copiado");
      // Reset visual após 2s
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback amigável: seleciona o input pro coach copiar manual
      const input = document.getElementById("p12-link-input") as HTMLInputElement | null;
      input?.select();
      notify.error("Não foi possível copiar automaticamente", {
        description: "Selecione o link no campo acima e copie manualmente.",
      });
    }
  };

  const handleOpen = () => {
    if (state.kind !== "generated") return;
    window.open(state.inviteUrl, "_blank", "noopener,noreferrer");
  };

  // ─── Renderização ──────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Questionário Precision 12</DialogTitle>
          <DialogDescription>
            Gere um link para o aluno responder o questionário de anamnese e
            prontidão. O link é de uso único e expira em 7 dias.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {state.kind === "idle" && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
              Ao gerar, o assessment é criado com status{" "}
              <code className="rounded bg-muted px-1 text-xs">in_progress</code>{" "}
              e aparece na aba Avaliações. Você copia o link e envia ao aluno
              (WhatsApp, e-mail, etc).
            </div>
          )}

          {state.kind === "generating" && (
            <div
              className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground"
              role="status"
              aria-live="polite"
            >
              <Loader2 className="h-4 w-4 animate-spin" />
              Gerando link…
            </div>
          )}

          {state.kind === "error" && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          )}

          {state.kind === "generated" && (
            <GeneratedLinkView
              inviteUrl={state.inviteUrl}
              expiresAt={state.expiresAt}
              copied={copied}
              onCopy={handleCopy}
              onOpen={handleOpen}
            />
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={state.kind === "generating"}
          >
            Fechar
          </Button>
          <Button
            type="button"
            onClick={handleGenerate}
            disabled={state.kind === "generating"}
            aria-label={
              state.kind === "generated" ? "Gerar novo link (revoga anterior)" : "Gerar link"
            }
          >
            {state.kind === "generating" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : state.kind === "generated" ? (
              <RefreshCw className="mr-2 h-4 w-4" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            {state.kind === "generated" ? "Gerar novo link" : "Gerar link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ────────────────────────────────────────────────────────────────────────────

interface GeneratedLinkViewProps {
  inviteUrl: string;
  expiresAt: string;
  copied: boolean;
  onCopy: () => void;
  onOpen: () => void;
}

const GeneratedLinkView = ({
  inviteUrl,
  expiresAt,
  copied,
  onCopy,
  onOpen,
}: GeneratedLinkViewProps) => {
  const expiresLabel = (() => {
    try {
      return format(parseISO(expiresAt), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", {
        locale: ptBR,
      });
    } catch {
      return expiresAt;
    }
  })();

  return (
    <div className="space-y-3" role="region" aria-label="Link gerado">
      <Alert>
        <AlertDescription className="text-sm">
          <strong>Envie este link ao aluno.</strong> O link é de uso único e expira em{" "}
          <span className="font-semibold">{expiresLabel}</span>.
        </AlertDescription>
      </Alert>

      <div className="space-y-1.5">
        <label
          htmlFor="p12-link-input"
          className="text-xs font-medium text-muted-foreground"
        >
          Link do questionário
        </label>
        <div className="flex gap-2">
          <Input
            id="p12-link-input"
            type="text"
            value={inviteUrl}
            readOnly
            className="font-mono text-xs"
            onFocus={(e) => e.target.select()}
            aria-label="URL do questionário (somente leitura)"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={onCopy}
            aria-label="Copiar link"
          >
            {copied ? (
              <Check className="h-4 w-4 text-emerald-600" aria-hidden />
            ) : (
              <ClipboardCopy className="h-4 w-4" aria-hidden />
            )}
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCopy}
          className="flex-1"
        >
          <ClipboardCopy className="mr-2 h-3.5 w-3.5" />
          Copiar link
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onOpen}
          className="flex-1"
        >
          <ExternalLink className="mr-2 h-3.5 w-3.5" />
          Abrir em nova aba
        </Button>
      </div>
    </div>
  );
};
