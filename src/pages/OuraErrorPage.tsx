import { useSearchParams, useNavigate } from "react-router-dom";
import { ROUTES } from "@/constants/navigation";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function OuraErrorPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const studentId = searchParams.get("student_id");
  const inviteToken = searchParams.get("invite_token");
  const reason = searchParams.get("reason");

  const errorMessages: Record<string, { title: string; description: string; suggestion: string }> = {
    token_exchange: {
      title: "Autorização Não Concluída",
      description: "Não conseguimos completar a autorização com o Oura Ring.",
      suggestion: "Isso acontece quando você cancela a autorização ou há um problema de conexão."
    },
    database: {
      title: "Erro ao Salvar Conexão",
      description: "A autorização com o Oura Ring foi bem-sucedida, mas não conseguimos salvar no sistema.",
      suggestion: "Este é um erro temporário. Tente novamente com o mesmo convite se ele ainda estiver válido."
    },
    sync: {
      title: "Erro na Sincronização Inicial",
      description: "Conseguimos conectar o Oura Ring, mas houve um problema ao buscar seus dados iniciais.",
      suggestion: "Não se preocupe! Você pode sincronizar manualmente através do seu perfil depois."
    },
    default: {
      title: "Erro na Conexão",
      description: "Ocorreu um erro inesperado ao conectar com o Oura Ring.",
      suggestion: "Tente novamente em alguns instantes. Se o erro persistir, entre em contato com seu treinador para assistência."
    }
  };

  const error = errorMessages[reason || "default"] || errorMessages.default;
  const retrySuggestion = inviteToken
    ? `${error.suggestion} Use o botão abaixo para reabrir o convite seguro.`
    : `${error.suggestion} Solicite ao seu treinador um novo link de convite.`;

  const handleRetry = () => {
    if (!inviteToken) {
      toast.info("Solicite um novo link ao seu treinador", {
        description: "Por segurança, não é possível tentar novamente sem um convite válido.",
      });
      return;
    }
    navigate(`/oura-connect/${inviteToken}`);
  };

  const handleContinueWithoutOura = () => {
    if (studentId) {
      navigate(ROUTES.studentDetail(studentId));
    } else {
      navigate(ROUTES.dashboard);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            <AlertCircle className="h-16 w-16 text-yellow-500" />
          </div>
          <CardTitle className="text-2xl">
            {error.title}
          </CardTitle>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>{error.description}</p>
            <p className="text-sm font-medium text-foreground mt-2">
              💡 {retrySuggestion}
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Button
              onClick={handleRetry}
              className="w-full"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              {inviteToken ? "Tentar Novamente" : "Solicitar Novo Link"}
            </Button>

            <Button
              onClick={handleContinueWithoutOura}
              variant="outline"
              className="w-full"
            >
              Continuar sem Oura Ring
            </Button>
          </div>

          <div className="text-xs text-center text-muted-foreground space-y-1 border-t pt-3">
            <p>
              ℹ️ Você pode conectar o Oura Ring mais tarde através do seu perfil
            </p>
            <p>
              Seu treinador também pode gerar um novo link de convite com integração Oura
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
