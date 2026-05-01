import { useState, useEffect } from "react";
import { Card } from "./ui/card";
import { logger } from "@/utils/logger";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { AlertCircle, Activity, Heart, Moon, TrendingUp, Target, Zap } from "lucide-react";
import { OuraMetrics } from "@/hooks/useOuraMetrics";
import { useTrainingRecommendation } from "@/hooks/useTrainingRecommendation";
import { useOuraBaseline } from "@/hooks/useOuraBaseline";
import { useLatestOuraAcuteMetrics } from "@/hooks/useOuraAcuteMetrics";
import { useLoadSuggestions } from "@/hooks/useLoadSuggestions";
import { useTrainingContext } from "@/contexts/TrainingContext";
import { Alert, AlertDescription } from "./ui/alert";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from "./ui/alert-dialog";

interface PersonalizedTrainingDashboardProps {
  latestMetrics: OuraMetrics | null;
  recentMetrics: OuraMetrics[];
  studentName: string;
  studentId: string;
  onStartTraining?: () => void;
}

const PersonalizedTrainingDashboard = ({
  latestMetrics,
  recentMetrics,
  studentName,
  studentId,
  onStartTraining
}: PersonalizedTrainingDashboardProps) => {
  const { baseline } = useOuraBaseline(studentId);
  const { data: latestAcuteMetrics } = useLatestOuraAcuteMetrics(studentId);
  const recommendation = useTrainingRecommendation(latestMetrics, recentMetrics, baseline, undefined, latestAcuteMetrics);
  const { data: loadSuggestions } = useLoadSuggestions(studentId, recommendation);
  const [showAlternatives, setShowAlternatives] = useState(false);
  const { selectedAlternative, setSelectedAlternative } = useTrainingContext();

  // AUD-003: Sincronizar alternativa selecionada com contexto global
  useEffect(() => {
    if (selectedAlternative && recommendation) {
      // Aplicar alternativa selecionada à recomendação atual
      logger.log('Alternativa persistida:', selectedAlternative);
    }
  }, [selectedAlternative, recommendation]);

  if (!latestMetrics || !recommendation) {
    return (
      <Card className="p-6">
        <div className="text-center text-muted-foreground">
          <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Aguardando sincronização dos dados do Oura Ring para gerar recomendações personalizadas.</p>
        </div>
      </Card>
    );
  }

  const getScoreColor = (score: number | null) => {
    if (score === null) return "secondary";
    if (score >= 80) return "default";
    if (score >= 65) return "outline";
    return "destructive";
  };

  const formatDuration = (seconds: number | null) => {
    if (seconds === null) return "--";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}min`;
  };

  const formatValue = (
    value: number | null | undefined,
    unit?: string,
    decimals = 1
  ) => {
    if (value === null || value === undefined) return "--";
    return `${value.toFixed(decimals)}${unit ? ` ${unit}` : ""}`;
  };

  const formatAcuteDate = (value: string | null | undefined) => {
    if (!value) return "--";
    const normalized = value.trim();
    const dateOnlyMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnlyMatch) {
      const [, year, month, day] = dateOnlyMatch;
      return `${day}/${month}/${year}`;
    }

    const parsed = parseISO(normalized.replace(" ", "T"));
    if (Number.isNaN(parsed.getTime())) {
      const fallback = new Date(normalized);
      if (Number.isNaN(fallback.getTime())) {
        return normalized;
      }
      return format(fallback, "dd/MM/yyyy", { locale: ptBR });
    }

    return format(parsed, "dd/MM/yyyy", { locale: ptBR });
  };

  const hasAcuteHrvData =
    !!latestAcuteMetrics && latestAcuteMetrics.samples_count_hrv > 0;
  const hasAcuteHeartRateData =
    !!latestAcuteMetrics && latestAcuteMetrics.samples_count_hr_day > 0;
  const hasAcuteData = hasAcuteHrvData || hasAcuteHeartRateData;

  const getTrainingAlternatives = (rs: number) => {
    if (rs >= 85) {
      return [
        { 
          emoji: "🔥",
          type: "Desafio Máximo Recomendado", 
          description: "Dia perfeito para buscar novos recordes pessoais! Seu corpo está totalmente recuperado." 
        },
        { 
          emoji: "💪",
          type: "Treino Normal Intenso", 
          description: "Execute treinos de alta intensidade com confiança. Sistema nervoso e muscular prontos." 
        },
        { 
          emoji: "🎯",
          type: "Volume Alto", 
          description: "Ótimo dia para treinos longos ou múltiplas sessões." 
        }
      ];
    } else if (rs >= 65) {
      return [
        { 
          emoji: "💪",
          type: "Treino Completo (Recomendado)", 
          description: "Execute o treino programado normalmente. Corpo bem recuperado para cargas habituais." 
        },
        { 
          emoji: "⚡",
          type: "Redução Leve (10%)", 
          description: "Se sentir fadiga durante o treino, reduza levemente o volume ou intensidade." 
        },
        { 
          emoji: "🧘",
          type: "Foco Técnico", 
          description: "Priorize qualidade de movimento sobre carga máxima." 
        }
      ];
    } else if (rs >= 45) {
      return [
        { 
          emoji: "⚠️",
          type: "Redução Moderada (Recomendado)", 
          description: "Reduza 20-30% do volume ou intensidade. Corpo precisa de carga mais leve para continuar progredindo." 
        },
        { 
          emoji: "🚶",
          type: "Recuperação Ativa", 
          description: "Alternativa mais segura: mobilidade leve, yoga ou caminhada. Mantém movimento sem estresse adicional." 
        },
        { 
          emoji: "❌",
          type: "Descanso Completo", 
          description: "Se sentir sintomas de overtraining (fadiga intensa, dor persistente), opte por descanso." 
        }
      ];
    } else if (rs >= 25) {
      return [
        { 
          emoji: "🚶",
          type: "Recuperação Ativa (Recomendado)", 
          description: "Movimento leve apenas: alongamento dinâmico, yoga suave ou caminhada de 20-30 min." 
        },
        { 
          emoji: "🛌",
          type: "Descanso Completo", 
          description: "Se sentir muito cansado, priorize descanso total. Corpo precisa de recuperação urgente." 
        },
        { 
          emoji: "🧊",
          type: "Protocolos de Recuperação", 
          description: "Foque nos protocolos recomendados abaixo (crioterapia, respiração, mindfulness)." 
        }
      ];
    } else {
      return [
        { 
          emoji: "🛑",
          type: "Descanso Obrigatório (CRÍTICO)", 
          description: "Seu sistema nervoso está severamente sobrecarregado. Treinar hoje aumenta risco de lesão e piora a recuperação." 
        },
        { 
          emoji: "🧊",
          type: "Protocolos de Recuperação Urgente", 
          description: "Foque 100% nos 4 protocolos prioritários listados abaixo. Eles têm efeito mensurável em 24-72h." 
        },
        { 
          emoji: "🩺",
          type: "Avaliação Médica", 
          description: "Se RS crítico persistir por 3+ dias, considere consultar médico/fisioterapeuta." 
        }
      ];
    }
  };

  const zoneLabelMap: Record<string, string> = {
    green_high: "Verde Alta",
    green: "Verde",
    yellow: "Amarela",
    orange: "Laranja",
    red: "Vermelha",
  };

  const sourceLabelMap: Record<string, string> = {
    last_valid: "Última carga válida",
    best_recent_equivalent: "Melhor recente equivalente",
    same_block: "Última do bloco atual",
    fallback_keep: "Fallback manter carga",
    insufficient: "Dados insuficientes",
  };

  const formatLoad = (value: number | null | undefined) => {
    if (value === null || value === undefined) return "--";
    return `${value.toFixed(1)} kg`;
  };

  const formatAdjustmentPercent = (value: number | null) => {
    if (value === null) return "--";
    return `${value > 0 ? "+" : ""}${value}%`;
  };

  const getSuggestionStatusLabel = (status: string) => {
    if (status === "automatic") return "Sugestão automática";
    if (status === "assisted") return "Sugestão assistida";
    return "Dados insuficientes";
  };

  return (
    <div className="space-y-6">
      {/* Status de Recuperação Principal */}
      <Card className="p-6 bg-gradient-to-br from-background to-muted/20">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold mb-2">
              {recommendation.emoji} Olá, {studentName}!
            </h2>
            <p className="text-lg text-muted-foreground">{recommendation.reason}</p>
          </div>
          <Badge variant={getScoreColor(recommendation.recoveryScore)} className="text-lg px-4 py-2">
            Recuperação: {recommendation.recoveryScore}/100
          </Badge>
        </div>
        {recommendation.overrideApplied && (
          <Alert className="mt-2 border-amber-500/40 bg-amber-500/10">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Override agudo ativo: a zona de treino foi reduzida em 1 nível para proteção.
            </AlertDescription>
          </Alert>
        )}

        {/* Scores Principais */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <div className="flex items-center space-x-3 p-4 rounded-lg bg-background border">
            <Zap className={`w-8 h-8 ${latestMetrics.readiness_score !== null && latestMetrics.readiness_score >= 70 ? 'text-primary' : 'text-muted-foreground'}`} />
            <div>
              <p className="text-sm text-muted-foreground">Prontidão</p>
              <p className="text-2xl font-bold">{latestMetrics.readiness_score ?? '--'}</p>
            </div>
          </div>
          <div className="flex items-center space-x-3 p-4 rounded-lg bg-background border">
            <Moon className={`w-8 h-8 ${latestMetrics.sleep_score !== null && latestMetrics.sleep_score >= 70 ? 'text-primary' : 'text-muted-foreground'}`} />
            <div>
              <p className="text-sm text-muted-foreground">Sono</p>
              <p className="text-2xl font-bold">{latestMetrics.sleep_score ?? '--'}</p>
            </div>
          </div>
          <div className="flex items-center space-x-3 p-4 rounded-lg bg-background border">
            <Heart className={`w-8 h-8 ${latestMetrics.resting_heart_rate !== null ? 'text-primary' : 'text-muted-foreground'}`} />
            <div>
              <p className="text-sm text-muted-foreground">FCR</p>
              <p className="text-2xl font-bold">
                {latestMetrics.resting_heart_rate !== null ? (
                  <>
                    {latestMetrics.resting_heart_rate} <span className="text-sm">bpm</span>
                  </>
                ) : (
                  "--"
                )}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Recomendação de Treino */}
      <Card className="p-6">
        <div className="flex items-center space-x-2 mb-4">
          <Target className="w-6 h-6 text-primary" />
          <h3 className="text-xl font-bold">Treino Recomendado para Hoje</h3>
        </div>
        
        <div className="bg-muted/30 rounded-lg p-6 space-y-4">
          <div>
            <h4 className="text-2xl font-bold text-primary mb-2">{recommendation.trainingType}</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <p className="text-sm text-muted-foreground">Intensidade</p>
                <p className="text-lg font-semibold">{recommendation.intensity}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Duração</p>
                <p className="text-lg font-semibold">{recommendation.duration}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2 pt-4 border-t">
            <TrendingUp className="w-5 h-5 text-muted-foreground" />
            <p className="text-sm">
              Confiança da recomendação: <span className="font-semibold">{recommendation.confidence}%</span>
            </p>
          </div>

          <div className="flex gap-3 pt-4">
            <Button 
              className="flex-1"
              onClick={() => onStartTraining?.()}
            >
              Iniciar Treino
            </Button>
            <Button 
              variant="outline" 
              className="flex-1"
              onClick={() => setShowAlternatives(true)}
            >
              Ver Alternativas
            </Button>
          </div>
        </div>
      </Card>

      {/* Protocolos Prioritários de Recuperação (RS < 25) */}
      {recommendation.priorityProtocols && recommendation.priorityProtocols.length > 0 && (
        <Card className="p-6 border-2 border-destructive/50 bg-destructive/5">
          <div className="flex items-center space-x-2 mb-4">
            <AlertCircle className="w-6 h-6 text-destructive" />
            <h3 className="text-xl font-bold text-destructive">
              Protocolos Prioritários de Recuperação
            </h3>
          </div>
          
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>
              <strong>⚠️ Situação Crítica:</strong> Seu corpo precisa de recuperação urgente. 
              Os protocolos abaixo são validados cientificamente e têm efeitos mensuráveis em 24-72h. 
              Priorize-os hoje.
            </AlertDescription>
          </Alert>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {recommendation.priorityProtocols.map((protocol) => (
              <div 
                key={protocol.order}
                className="p-5 rounded-lg border-2 border-muted bg-background hover:border-primary/50 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <Badge variant="outline" className="text-lg font-bold">
                      {protocol.order}
                    </Badge>
                    <h4 className="text-lg font-bold">{protocol.name}</h4>
                  </div>
                </div>
                
                <div className="space-y-2 text-sm">
                  <div className="flex items-center space-x-2">
                    <span className="text-muted-foreground">⏱️ Duração:</span>
                    <span className="font-semibold">{protocol.duration}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-muted-foreground">🕐 Melhor Horário:</span>
                    <span className="font-semibold">{protocol.timing}</span>
                  </div>
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {protocol.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 p-4 bg-muted/30 rounded-lg">
            <p className="text-sm text-muted-foreground">
              <strong>💡 Dica:</strong> Estes protocolos foram selecionados com base em meta-análises 
              peer-reviewed. Siga a ordem recomendada para máxima eficácia. Se o Readiness Score 
              crítico persistir por 3+ dias, consulte um profissional de saúde.
            </p>
          </div>
        </Card>
      )}

      {/* Alertas */}
      {recommendation.alerts.length > 0 && (
        <div className="space-y-3">
          {recommendation.alerts.map((alert, idx) => (
            <Alert 
              key={idx} 
              variant={alert.level === 'CRITICAL' ? 'destructive' : 'default'}
            >
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{alert.message}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {loadSuggestions && loadSuggestions.length > 0 && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold">Sugestão Assistida de Carga</h3>
            <Badge variant="outline">
              Zona {zoneLabelMap[recommendation.zone] ?? recommendation.zone}
            </Badge>
          </div>

          <p className="text-sm text-muted-foreground mb-4">
            Referência por histórico real do aluno. A sugestão deve ser validada pelo coach antes da execução.
          </p>

          <div className="space-y-3">
            {loadSuggestions.map((item) => (
              <div key={item.exerciseName} className="rounded-lg border p-4 bg-muted/20">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <h4 className="font-semibold">{item.exerciseName}</h4>
                    <p className="text-xs text-muted-foreground">
                      Referência: {formatLoad(item.referenceLoadKg)} @ {item.referenceReps ?? "--"} reps
                    </p>
                  </div>
                  <Badge variant={item.status === "insufficient" ? "destructive" : "secondary"}>
                    {getSuggestionStatusLabel(item.status)}
                  </Badge>
                </div>

                <div className="md:hidden space-y-3">
                  <div className="rounded-md bg-background/70 border p-3">
                    <p className="text-xs text-muted-foreground">Carga sugerida</p>
                    <p className="text-2xl font-bold">{formatLoad(item.suggestedLoadKg)}</p>
                  </div>

                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>Última: {formatLoad(item.lastLoadKg)}</span>
                    <span>Reps: {item.referenceReps ?? "--"}</span>
                    <span>Zona: {zoneLabelMap[recommendation.zone] ?? recommendation.zone}</span>
                  </div>

                  <details className="rounded-md border bg-background/50 px-3 py-2">
                    <summary className="cursor-pointer text-sm font-medium text-primary">
                      Ver detalhes da regra
                    </summary>
                    <div className="mt-3 grid grid-cols-1 gap-2 text-sm">
                      <div>
                        <p className="text-muted-foreground">Regra aplicada</p>
                        <p className="font-semibold">{item.ruleApplied}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Ajuste</p>
                        <p className="font-semibold">{formatAdjustmentPercent(item.adjustmentPercent)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Incremento</p>
                        <p className="font-semibold">{item.incrementKg} kg</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Fonte</p>
                        <p className="font-semibold">{sourceLabelMap[item.source] ?? item.source}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {item.guardrails.includes("pain_recent") && (
                          <Badge variant="destructive">Guardrail: dor recente</Badge>
                        )}
                        {item.guardrails.includes("technique_inconsistent") && (
                          <Badge variant="outline">Guardrail: técnica inconsistente</Badge>
                        )}
                      </div>
                    </div>
                  </details>
                </div>

                <div className="hidden md:grid md:grid-cols-5 gap-2 text-sm">
                  <div>
                    <p className="text-muted-foreground">Última carga válida</p>
                    <p className="font-semibold">{formatLoad(item.lastLoadKg)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Regra aplicada</p>
                    <p className="font-semibold">{item.ruleApplied}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Ajuste</p>
                    <p className="font-semibold">{formatAdjustmentPercent(item.adjustmentPercent)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Carga sugerida</p>
                    <p className="font-semibold">{formatLoad(item.suggestedLoadKg)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Incremento</p>
                    <p className="font-semibold">{item.incrementKg} kg</p>
                  </div>
                </div>
                <div className="mt-2 hidden md:flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>Fonte: {sourceLabelMap[item.source] ?? item.source}</span>
                  {item.guardrails.includes("pain_recent") && (
                    <Badge variant="destructive">Guardrail: dor recente</Badge>
                  )}
                  {item.guardrails.includes("technique_inconsistent") && (
                    <Badge variant="outline">Guardrail: técnica inconsistente</Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
      {loadSuggestions && loadSuggestions.length === 0 && (
        <Card className="p-6">
          <h3 className="text-xl font-bold mb-2">Sugestão Assistida de Carga</h3>
          <p className="text-sm text-muted-foreground">
            Dados insuficientes de histórico para sugerir carga numérica neste momento.
          </p>
        </Card>
      )}

      {/* Detalhes de Recuperação */}
      <div
        className={`grid grid-cols-1 md:grid-cols-2 ${
          hasAcuteData ? "xl:grid-cols-4" : "xl:grid-cols-3"
        } gap-4`}
      >
        <Card className="p-4">
          <h4 className="font-semibold mb-3 flex items-center">
            <Moon className="w-4 h-4 mr-2" />
            Sono Ontem
          </h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Duração Total</span>
              <span className="font-semibold">{formatDuration(latestMetrics.total_sleep_duration)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sono Profundo</span>
              <span className="font-semibold">{formatDuration(latestMetrics.deep_sleep_duration)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sono REM</span>
              <span className="font-semibold">{formatDuration(latestMetrics.rem_sleep_duration)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Eficiência</span>
              <span className="font-semibold">{latestMetrics.sleep_efficiency ? `${latestMetrics.sleep_efficiency}%` : '--'}</span>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <h4 className="font-semibold mb-3 flex items-center">
            <Heart className="w-4 h-4 mr-2" />
            Sinais Vitais
          </h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">HRV</span>
              <span className="font-semibold">
                {latestMetrics.average_sleep_hrv !== null ? `${latestMetrics.average_sleep_hrv.toFixed(1)} ms` : '--'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">FC Repouso</span>
              <span className="font-semibold">
                {latestMetrics.resting_heart_rate !== null ? `${latestMetrics.resting_heart_rate} bpm` : '--'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Temperatura</span>
              <span className="font-semibold">
                {latestMetrics.temperature_deviation !== null
                  ? `${latestMetrics.temperature_deviation > 0 ? '+' : ''}${latestMetrics.temperature_deviation.toFixed(1)}°C`
                  : '--'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Nível de Fadiga</span>
              <span className="font-semibold capitalize">{recommendation.fatigueLevel}</span>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <h4 className="font-semibold mb-3 flex items-center">
            <Activity className="w-4 h-4 mr-2" />
            Atividade Recente
          </h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Calorias Ativas</span>
              <span className="font-semibold">
                {latestMetrics.active_calories !== null ? `${latestMetrics.active_calories} kcal` : '--'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Passos</span>
              <span className="font-semibold">
                {latestMetrics.steps !== null ? latestMetrics.steps.toLocaleString() : '--'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Score Atividade</span>
              <span className="font-semibold">{latestMetrics.activity_score ?? '--'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">MET Minutos</span>
              <span className="font-semibold">{latestMetrics.met_minutes ?? '--'}</span>
            </div>
          </div>
        </Card>

        {hasAcuteData && (
          <Card className="p-4">
            <h4 className="font-semibold mb-3 flex items-center">
              <Heart className="w-4 h-4 mr-2" />
              Sinais Agudos (HRV/FC)
            </h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Data</span>
                <span className="font-semibold">
                  {formatAcuteDate(latestAcuteMetrics?.date)}
                </span>
              </div>

              {hasAcuteHrvData ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">HRV Último Bloco</span>
                    <span className="font-semibold">
                      {formatValue(latestAcuteMetrics?.hrv_night_last, "ms", 1)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">HRV Mínimo Noite</span>
                    <span className="font-semibold">
                      {formatValue(latestAcuteMetrics?.hrv_night_min, "ms", 1)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Amostras HRV</span>
                    <span className="font-semibold">
                      {latestAcuteMetrics?.samples_count_hrv ?? "--"}
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  HRV aguda indisponível nesta conta Oura.
                </p>
              )}

              <div className="flex justify-between">
                <span className="text-muted-foreground">FC Média Dia</span>
                <span className="font-semibold">
                  {formatValue(latestAcuteMetrics?.hr_day_avg, "bpm", 0)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amostras FC Dia</span>
                <span className="font-semibold">
                  {latestAcuteMetrics?.samples_count_hr_day ?? "--"}
                </span>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Dialog de Alternativas de Treino */}
      <AlertDialog open={showAlternatives} onOpenChange={setShowAlternatives}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>🎯 Alternativas de Treino</AlertDialogTitle>
            <AlertDialogDescription>
              Com base no seu Readiness Score de <strong>{recommendation.recoveryScore}</strong>, 
              aqui estão as opções disponíveis:
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="space-y-3 my-4">
            {getTrainingAlternatives(recommendation.recoveryScore).map((alt, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setSelectedAlternative(alt);
                  setShowAlternatives(false);
                }}
                className="w-full p-4 border rounded-lg hover:bg-muted/50 transition-colors text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                aria-label={`Selecionar alternativa: ${alt.type}`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl" aria-hidden="true">{alt.emoji}</span>
                  <div>
                    <h4 className="font-semibold text-base">{alt.type}</h4>
                    <p className="text-sm text-muted-foreground mt-1">{alt.description}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
          
          <AlertDialogFooter>
            <AlertDialogAction>Entendi</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PersonalizedTrainingDashboard;
