/**
 * E4.4 — Dialog de reissue de link de Questionário Precision 12 acionado
 * da fila do Coach Console.
 *
 * Primeira mutação introduzida no Coach Console. Princípios:
 *
 *   1. Confirmação OBRIGATÓRIA antes da chamada à edge function — o
 *      dialog abre direto no estado "confirming". Cancel/Close NÃO chama
 *      a edge.
 *   2. Única superfície de write: `supabase.functions.invoke(
 *      "create-precision12-questionnaire-link", ...)`. Nenhum
 *      `.insert/.update/.delete/.upsert`, nenhuma RPC.
 *   3. Token e invite_url ficam SÓ em React state — nunca em
 *      localStorage/sessionStorage, nunca em console.log, nunca na URL
 *      do app.
 *   4. Após sucesso, invalida `["precision12", "coach-console"]` +
 *      `["assessments", "by-student", studentId]` + `["student",
 *      studentId]` pra fila/tabela e a tab Avaliações refletirem o
 *      novo link.
 *
 * Erro server-side "Apenas avaliações 'in_progress' permitem reemissão."
 * recebe tradução amigável.
 */

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertTriangle,
  Check,
  ClipboardCopy,
  ExternalLink,
  Loader2,
  RefreshCw,
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
// Edge function contract (E3.7) — espelhado do QuestionnaireLinkPanel.
// ────────────────────────────────────────────────────────────────────────────

interface CreateLinkResponse {
  invite_url: string;
  token: string;
  expires_at: string;
  assessment_id: string;
  student_name?: string;
}

interface ReissueRequestBody {
  student_id: string;
  assessment_id: string;
  frontend_origin: string;
}

interface Precision12ReissueLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  studentName: string;
  assessmentId: string;
}

type DialogState =
  | { kind: "confirming" }
  | { kind: "generated"; inviteUrl: string; expiresAt: string }
  | { kind: "error"; message: string };

const REISSUE_CONFIRM_MESSAGE =
  "Gerar um novo link revoga o anterior. Deseja continuar?";

/**
 * Erros do edge function que ganham tradução amigável. O texto vem do
 * `index.ts` da edge `create-precision12-questionnaire-link` (PR #136).
 */
// E5.6b/N-1 (corrigido na auditoria): a mensagem amigável também usa
// "gerar novo link" pra ficar consistente com o título do dialog
// ("Gerar novo link do questionário") e o botão da fila ("Gerar novo link").
// O texto do erro server-side em si NÃO muda (é contrato com a edge);
// apenas a tradução para o coach.
const SERVER_ERROR_FRIENDLY: Record<string, string> = {
  "Apenas avaliações 'in_progress' permitem reemissão.":
    "Este questionário não permite gerar novo link.",
};

function friendlyErrorMessage(raw: string | undefined): string {
  if (!raw) {
    return "Falha ao gerar link. Tente novamente em alguns minutos.";
  }
  return SERVER_ERROR_FRIENDLY[raw] ?? raw;
}

// ────────────────────────────────────────────────────────────────────────────

export function Precision12ReissueLinkDialog({
  open,
  onOpenChange,
  studentId,
  studentName,
  assessmentId,
}: Precision12ReissueLinkDialogProps) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<DialogState>({ kind: "confirming" });
  const [copied, setCopied] = useState(false);

  // Reset visual ao fechar — o próximo open volta pro confirming inicial.
  useEffect(() => {
    if (!open) {
      setState({ kind: "confirming" });
      setCopied(false);
    }
  }, [open]);

  const mutation = useMutation<CreateLinkResponse, Error, ReissueRequestBody>({
    mutationFn: async (body) => {
      const { data, error } = await supabase.functions.invoke<CreateLinkResponse>(
        "create-precision12-questionnaire-link",
        { body },
      );
      if (error) throw new Error(error.message ?? "Erro ao gerar link");
      if (!data) throw new Error("Resposta vazia da edge function");
      return data;
    },
    onSuccess: (data) => {
      setState({
        kind: "generated",
        inviteUrl: data.invite_url,
        expiresAt: data.expires_at,
      });
      // Refresca fila / tabela do Coach Console + aba Avaliações do aluno.
      queryClient.invalidateQueries({
        queryKey: ["precision12", "coach-console"],
      });
      queryClient.invalidateQueries({
        queryKey: ["assessments", "by-student", studentId],
      });
      queryClient.invalidateQueries({ queryKey: ["student", studentId] });
    },
    onError: (err) => {
      setState({
        kind: "error",
        message: friendlyErrorMessage(err.message),
      });
    },
  });

  const handleConfirm = () => {
    mutation.mutate({
      student_id: studentId,
      assessment_id: assessmentId,
      frontend_origin: window.location.origin,
    });
  };

  const handleClose = () => {
    if (mutation.isPending) return;
    onOpenChange(false);
  };

  const handleCopy = async () => {
    if (state.kind !== "generated") return;
    try {
      await navigator.clipboard.writeText(state.inviteUrl);
      setCopied(true);
      notify.success("Link copiado");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      const input = document.getElementById(
        "p12-reissue-link-input",
      ) as HTMLInputElement | null;
      input?.select();
      notify.error("Não foi possível copiar automaticamente", {
        description: "Selecione o link no campo acima e copie manualmente.",
      });
    }
  };

  const handleOpenLink = () => {
    if (state.kind !== "generated") return;
    window.open(state.inviteUrl, "_blank", "noopener,noreferrer");
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          {/*
            E5.6b / N-1 — título do dialog alinhado à microcopy da fila
            ("Gerar novo link"). Antes o dialog dizia "Reemitir link" mas
            a CTA interna já era "Gerar novo link" — divergência confundia.
          */}
          <DialogTitle>Gerar novo link do questionário</DialogTitle>
          <DialogDescription>
            Aluno: <span className="font-medium">{studentName}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {state.kind === "confirming" && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{REISSUE_CONFIRM_MESSAGE}</AlertDescription>
            </Alert>
          )}

          {mutation.isPending && (
            <div
              className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground"
              role="status"
              aria-live="polite"
            >
              <Loader2 className="h-4 w-4 animate-spin" />
              Gerando link…
            </div>
          )}

          {state.kind === "error" && !mutation.isPending && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          )}

          {state.kind === "generated" && !mutation.isPending && (
            <GeneratedLinkView
              inviteUrl={state.inviteUrl}
              expiresAt={state.expiresAt}
              copied={copied}
              onCopy={handleCopy}
              onOpen={handleOpenLink}
            />
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {state.kind === "generated" ? (
            <Button type="button" onClick={handleClose}>
              Fechar
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={mutation.isPending}
              >
                Cancelar
              </Button>
              {/*
                E5.6b / N-2 — CTA marcada como destructive porque a ação
                REVOGA o link anterior (texto do próprio aviso admite isso).
                Antes usava variant=default (bg-primary laranja-coral), o
                que subestimava o caráter destrutivo. Continua diferenciada
                visualmente do Revoke pelo texto e pelo ícone (RefreshCw vs
                Ban).
              */}
              <Button
                type="button"
                variant="destructive"
                onClick={handleConfirm}
                disabled={mutation.isPending}
                aria-label="Confirmar geração do novo link"
              >
                {mutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                {state.kind === "error" ? "Tentar novamente" : "Gerar novo link"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ────────────────────────────────────────────────────────────────────────────

interface GeneratedLinkViewProps {
  inviteUrl: string;
  expiresAt: string;
  copied: boolean;
  onCopy: () => void;
  onOpen: () => void;
}

function GeneratedLinkView({
  inviteUrl,
  expiresAt,
  copied,
  onCopy,
  onOpen,
}: GeneratedLinkViewProps) {
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
    <div className="space-y-3" role="region" aria-label="Novo link gerado">
      <Alert>
        <AlertDescription className="text-sm">
          <strong>Novo link ativo.</strong> O link anterior foi revogado.
          Expira em <span className="font-semibold">{expiresLabel}</span>.
        </AlertDescription>
      </Alert>

      <div className="space-y-1.5">
        <label
          htmlFor="p12-reissue-link-input"
          className="text-xs font-medium text-muted-foreground"
        >
          Link do questionário
        </label>
        <div className="flex gap-2">
          <Input
            id="p12-reissue-link-input"
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
}
