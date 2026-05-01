import { Link } from "react-router-dom";
import { FileText, ShieldCheck, Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ROUTES } from "@/constants/navigation";

type LegalVariant = "terms" | "privacy" | "ouraConsent";

interface LegalPageProps {
  variant: LegalVariant;
}

const LEGAL_CONTENT: Record<
  LegalVariant,
  {
    title: string;
    subtitle: string;
    icon: typeof FileText;
    sections: Array<{ title: string; body: string[] }>;
  }
> = {
  terms: {
    title: "Termos de Uso",
    subtitle: "Condições operacionais para uso do sistema Fabrik Performance.",
    icon: FileText,
    sections: [
      {
        title: "Uso do sistema",
        body: [
          "O Fabrik Performance é uma ferramenta de acompanhamento de treino, registro de sessões, relatórios e apoio à tomada de decisão do treinador.",
          "As recomendações exibidas no sistema não substituem avaliação profissional presencial, julgamento clínico ou decisão técnica do treinador responsável.",
        ],
      },
      {
        title: "Responsabilidades",
        body: [
          "O aluno deve informar limitações, dor, alterações de saúde e qualquer condição relevante antes das sessões.",
          "O treinador é responsável por validar a execução, ajustar cargas e interromper treinos quando houver risco operacional.",
        ],
      },
      {
        title: "Disponibilidade",
        body: [
          "O sistema pode passar por manutenção, atualização ou instabilidade de serviços externos como Supabase, Lovable e Oura.",
          "Registros críticos devem ser revisados pelo time operacional quando houver falha de sincronização, importação ou autenticação.",
        ],
      },
    ],
  },
  privacy: {
    title: "Política de Privacidade",
    subtitle: "Como dados pessoais e dados de treino são usados no piloto operacional.",
    icon: ShieldCheck,
    sections: [
      {
        title: "Dados tratados",
        body: [
          "Podem ser tratados dados cadastrais, histórico de treinos, prescrições, observações do treinador, métricas de recuperação e dados de dispositivos conectados autorizados pelo aluno.",
          "Dados sensíveis de saúde ou recuperação devem ser usados apenas para acompanhamento de treino, segurança operacional e personalização do atendimento.",
        ],
      },
      {
        title: "Finalidade",
        body: [
          "Os dados são usados para registrar sessões, acompanhar evolução, gerar relatórios, apoiar decisões de carga e reduzir risco de intervenção inadequada.",
          "A Fabrik não deve vender ou compartilhar dados pessoais com terceiros para fins comerciais sem autorização específica.",
        ],
      },
      {
        title: "Segurança e acesso",
        body: [
          "O acesso interno deve ser limitado a pessoas autorizadas e compatível com a função operacional de cada usuário.",
          "Solicitações de correção, exclusão ou revisão de dados devem ser encaminhadas ao responsável operacional da Fabrik.",
        ],
      },
    ],
  },
  ouraConsent: {
    title: "Consentimento Oura Ring",
    subtitle: "Escopo de dados usados para recuperação, sono e prontidão.",
    icon: Activity,
    sections: [
      {
        title: "Dados solicitados",
        body: [
          "O sistema pode solicitar dados de sono, prontidão, frequência cardíaca de repouso, HRV agregada, atividade, temperatura, SpO2 e métricas de recuperação disponibilizadas pela API do Oura.",
          "Dados agudos ou intradia dependem de disponibilidade real da API, permissões concedidas e sincronização do anel pelo aluno.",
        ],
      },
      {
        title: "Uso no treino",
        body: [
          "As métricas Oura são usadas como apoio para sinalizar recuperação, fadiga, estresse e necessidade de ajuste de carga.",
          "O sistema pode sugerir cautela, redução, recuperação ativa ou descanso, mas a decisão final continua sendo do treinador.",
        ],
      },
      {
        title: "Revogação",
        body: [
          "O aluno pode desconectar o Oura ou revogar a autorização a qualquer momento.",
          "Após revogação, novas sincronizações deixam de ocorrer, mas registros históricos podem permanecer no sistema para rastreabilidade operacional, salvo solicitação de exclusão aplicável.",
        ],
      },
    ],
  },
};

export default function LegalPage({ variant }: LegalPageProps) {
  const content = LEGAL_CONTENT[variant];
  const Icon = content.icon;

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground">
      <div className="mx-auto max-w-3xl">
        <Link to={ROUTES.auth} className="text-sm text-muted-foreground hover:text-primary">
          Voltar
        </Link>

        <Card className="mt-4">
          <CardHeader>
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon className="h-6 w-6" />
            </div>
            <CardTitle className="text-2xl">{content.title}</CardTitle>
            <p className="text-sm text-muted-foreground">{content.subtitle}</p>
            <p className="text-xs text-muted-foreground">Versão operacional: 30/04/2026</p>
          </CardHeader>

          <CardContent className="space-y-6">
            {content.sections.map((section) => (
              <section key={section.title} className="space-y-2">
                <h2 className="text-lg font-semibold">{section.title}</h2>
                {section.body.map((paragraph) => (
                  <p key={paragraph} className="text-sm leading-6 text-muted-foreground">
                    {paragraph}
                  </p>
                ))}
              </section>
            ))}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
