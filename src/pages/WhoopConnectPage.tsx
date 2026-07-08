import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2, Shield, Activity, Moon, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { buildErrorDescription } from "@/utils/errorParsing";

interface InviteData {
  valid: boolean;
  already_connected?: boolean;
  trainer_name: string;
  student_name: string;
  student_id: string;
  invite_id: string;
  whoop_client_id?: string;
  error?: string;
}

export default function WhoopConnectPage() {
  const { token } = useParams();
  const [isLoading, setIsLoading] = useState(true);
  const [inviteData, setInviteData] = useState<InviteData | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    const validate = async () => {
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        if (!supabaseUrl || !supabaseKey) {
          throw new Error("Configuração do Supabase ausente no cliente");
        }

        const response = await fetch(
          `${supabaseUrl}/functions/v1/validate-student-invite?token=${token}&type=whoop_connect`,
          { headers: { apikey: supabaseKey } },
        );

        const result = await response.json();
        if (result.already_connected) {
          setInviteData(result);
        } else if (!response.ok) {
          throw new Error(result?.error || "Falha ao validar convite do Whoop");
        } else if (!result.valid) {
          setError(result.error || "Link inválido ou expirado");
        } else {
          setInviteData(result);
        }
      } catch (error: unknown) {
        setError(buildErrorDescription(error) || "Erro ao validar link");
      } finally {
        setIsLoading(false);
      }
    };

    validate();
  }, [token]);

  const handleConnect = async () => {
    if (!inviteData || !token) return;

    setIsConnecting(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const whoopClientId = inviteData.whoop_client_id;

      if (!whoopClientId) {
        toast.error("Whoop não configurado no sistema");
        setIsConnecting(false);
        return;
      }

      const redirectUri = `${supabaseUrl}/functions/v1/whoop-callback`;
      const encodedOrigin = (() => {
        try {
          return btoa(window.location.origin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
        } catch (_error) {
          return "";
        }
      })();
      const state = encodedOrigin
        ? `${inviteData.student_id}:${inviteData.invite_id}:${encodedOrigin}`
        : `${inviteData.student_id}:${inviteData.invite_id}`;
      const scope = "read:recovery read:sleep read:workout read:cycles read:profile offline";

      const whoopAuthUrl =
        `https://api.prod.whoop.com/oauth/oauth2/auth?response_type=code&client_id=${whoopClientId}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}`;

      window.location.href = whoopAuthUrl;
    } catch (error: unknown) {
      toast.error("Erro ao iniciar conexão", {
        description: buildErrorDescription(error) || "Tente novamente em instantes.",
      });
      setIsConnecting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !inviteData) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Link Inválido</CardTitle>
            <CardDescription>{error || "Este link é inválido, expirado ou já foi utilizado."}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Entre em contato com seu treinador para solicitar um novo link.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (inviteData.already_connected) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Activity className="h-8 w-8 text-primary" />
            </div>
            <CardTitle>Whoop já conectado</CardTitle>
            <CardDescription>
              A autorização foi recebida com sucesso. Seu treinador já pode acompanhar seus dados do Whoop.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-center text-muted-foreground">Você pode fechar esta aba agora.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 py-8">
      <div className="max-w-lg mx-auto space-y-6">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Activity className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">Conectar Whoop</CardTitle>
            <CardDescription className="text-base">
              {inviteData.trainer_name} solicitou acesso aos dados do seu Whoop para personalizar seus treinos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-muted/50 p-4 rounded-lg space-y-3">
              <p className="font-medium text-sm">Dados que serão compartilhados:</p>
              <div className="grid grid-cols-1 gap-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Heart className="h-4 w-4 text-primary" />
                  <span>Recuperação (recovery, HRV, FC em repouso)</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Moon className="h-4 w-4 text-primary" />
                  <span>Sono (performance, fases, eficiência)</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Activity className="h-4 w-4 text-primary" />
                  <span>Esforço diário (strain) e treinos</span>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2 text-xs text-muted-foreground border-t pt-4">
              <Shield className="h-4 w-4 mt-0.5 flex-shrink-0 text-primary" />
              <p>
                <strong>Privacidade garantida:</strong> Seus dados serão usados <strong>exclusivamente</strong> por{" "}
                {inviteData.trainer_name} para personalizar seus treinos. Não compartilharemos com terceiros.
              </p>
            </div>

            <Button size="lg" className="w-full" onClick={handleConnect} disabled={isConnecting}>
              {isConnecting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Redirecionando...
                </>
              ) : (
                <>
                  <Activity className="h-4 w-4 mr-2" />
                  Conectar Whoop
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
