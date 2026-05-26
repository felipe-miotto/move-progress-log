import { useSearchParams } from "react-router-dom";
import { CheckCircle2, Activity, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useOuraMetrics } from "@/hooks/useOuraMetrics";
import { useOuraConnection } from "@/hooks/useOuraConnection";
import { toast } from "sonner";

export default function OnboardingSuccessPage() {
  const [searchParams] = useSearchParams();
  const studentId = searchParams.get("student_id");

  const { data: ouraMetrics, isLoading: metricsLoading } = useOuraMetrics(studentId || "", 7);
  const { data: ouraConnection, isLoading: connectionLoading } = useOuraConnection(studentId || "", {
    pollUntilConnected: true,
    refetchIntervalMs: 3000,
  });

  const handleClose = () => {
    // Tentar fechar a janela (funciona se foi aberta via window.open)
    window.close();
    
    // Fallback: se não conseguir fechar (navegação normal)
    // Verificar após 100ms se a janela ainda está aberta
    setTimeout(() => {
      if (!window.closed) {
        // Mostrar mensagem de que pode fechar manualmente
        toast.info("Você pode fechar esta aba agora", {
          description: "Seu cadastro foi concluído com sucesso!",
          duration: 10000,
        });
      }
    }, 100);
  };

  const renderOuraStatus = () => {
    if (!studentId) return null;

    if (connectionLoading || metricsLoading) {
      return (
        <div className="flex items-center gap-2 p-3 rounded-md bg-muted/50">
          <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
          <span className="text-sm text-muted-foreground">
            Verificando sincronização do Oura Ring...
          </span>
        </div>
      );
    }

    if (ouraConnection && ouraMetrics && ouraMetrics.length > 0) {
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2 p-3 rounded-md bg-muted/50">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <div className="flex-1">
              <p className="text-sm font-medium">
                Oura Ring conectado com sucesso!
              </p>
              <p className="text-xs text-muted-foreground">
                {ouraMetrics.length} {ouraMetrics.length === 1 ? 'dia sincronizado' : 'dias sincronizados'}
              </p>
            </div>
            <Badge variant="outline" className="text-xs">
              <Activity className="h-3 w-3 mr-1" />
              Ativo
            </Badge>
          </div>
        </div>
      );
    }

    if (ouraConnection && (!ouraMetrics || ouraMetrics.length === 0)) {
      return (
        <div className="flex items-center gap-2 p-3 rounded-md bg-muted/50">
          <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
          <div>
            <p className="text-sm font-medium">
              Sincronização em andamento...
            </p>
            <p className="text-xs text-muted-foreground">
              Seus dados do Oura Ring estão sendo carregados
            </p>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 animate-fade-in bg-background">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 animate-scale-in">
            <CheckCircle2 className="h-16 w-16 text-green-500" />
          </div>
          <CardTitle className="text-2xl">
            Cadastro Realizado com Sucesso! 🎉
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-center text-muted-foreground">
            Seu cadastro foi concluído com sucesso! 
            {ouraConnection 
              ? " Seus dados do Oura Ring estão sendo sincronizados e seu treinador já pode acompanhar seu progresso."
              : " Seu treinador já pode acessar suas informações e iniciar seu planejamento."
            }
          </p>
          
          {renderOuraStatus()}

          <div className="pt-4">
            <Button
              variant="outline"
              onClick={handleClose}
              className="w-full"
            >
              Fechar Janela
            </Button>
          </div>

          <div className="border-t pt-4 mt-4">
            <p className="text-sm text-center text-muted-foreground">
              <strong className="text-foreground">Próximos passos:</strong> Aguarde contato do seu treinador para agendar sua primeira sessão.
            </p>
            <p className="text-xs text-center text-muted-foreground mt-2">
              Você pode fechar esta janela agora.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
