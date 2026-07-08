import { useState } from "react";
import { Activity, Copy, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { buildErrorDescription } from "@/utils/errorParsing";
import { getPreferredFrontendOrigin } from "@/utils/frontendOrigin";

interface SendWhoopConnectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  studentName: string;
}

export const SendWhoopConnectDialog = ({ open, onOpenChange, studentId, studentName }: SendWhoopConnectDialogProps) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("whoop-connect-link", {
        body: { student_id: studentId, frontend_origin: getPreferredFrontendOrigin() },
      });

      if (error) throw error;
      if (!data?.invite_url || typeof data.invite_url !== "string") {
        throw new Error("Não foi possível gerar um link de convite válido para o Whoop.");
      }
      setInviteUrl(data.invite_url);
      toast.success("Link gerado com sucesso");
    } catch (error: unknown) {
      toast.error("Erro ao gerar link", {
        description: buildErrorDescription(error) || "Tente novamente",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    toast.success("Link copiado!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = (next: boolean) => {
    if (!next) {
      setInviteUrl(null);
      setCopied(false);
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Conectar Whoop
          </DialogTitle>
          <DialogDescription>
            Gere um link para <strong>{studentName}</strong> autorizar o compartilhamento dos dados do Whoop.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {!inviteUrl ? (
            <Button onClick={handleGenerate} disabled={isGenerating} className="w-full">
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Gerando...
                </>
              ) : (
                "Gerar Link de Conexão"
              )}
            </Button>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input value={inviteUrl} readOnly className="text-xs" />
                <Button variant="outline" size="icon" onClick={handleCopy} className="flex-shrink-0">
                  {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Envie este link para o aluno. Ele terá <strong>7 dias</strong> para conectar o Whoop.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
