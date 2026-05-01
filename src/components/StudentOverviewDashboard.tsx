import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dumbbell, Calendar, TrendingUp, Target, AlertCircle, Activity, X } from "lucide-react";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Student } from "@/hooks/useStudents";
import StatCard from "./StatCard";
import TrainingZonesCard from "./TrainingZonesCard";
import { StudentObservationsCard } from "./StudentObservationsCard";
import ProtocolRecommendationsCard from "./ProtocolRecommendationsCard";
import { useMemo, useState, useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";

interface SessionWithExercises {
  id: string;
  date: string;
  time: string;
  session_type: string;
  is_finalized?: boolean;
  exercises?: Array<{ exercise_name: string; load_kg?: number | null; sets?: number | null; reps?: number | null }>;
}

interface PrescriptionAssignment {
  id: string;
  start_date: string;
  end_date: string | null;
  prescription_id: string;
}

interface OuraMetricsSnapshot {
  date: string;
  readiness_score: number | null;
  sleep_score: number | null;
  activity_score: number | null;
  stress_high_time: number | null;
  resting_heart_rate: number | null;
  average_sleep_hrv: number | null;
}

interface OuraConnectionInfo {
  is_active: boolean;
  last_sync_at: string | null;
}

interface StudentOverviewDashboardProps {
  student: Student;
  sessions: SessionWithExercises[];
  assignments: PrescriptionAssignment[];
  latestOuraMetrics: OuraMetricsSnapshot | null;
  ouraConnection: OuraConnectionInfo | null;
  onNavigateToOura: () => void;
}

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08
    }
  }
};

const cardVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: { 
    y: 0, 
    opacity: 1,
    transition: {
      type: "spring",
      stiffness: 100,
      damping: 15
    }
  }
};

const reducedContainerVariants = {
  hidden: { opacity: 1 },
  visible: { opacity: 1, transition: { duration: 0 } },
};

const reducedCardVariants = {
  hidden: { y: 0, opacity: 1 },
  visible: { y: 0, opacity: 1, transition: { duration: 0 } },
};

export const StudentOverviewDashboard = ({
  student,
  sessions,
  assignments,
  latestOuraMetrics,
  ouraConnection,
  onNavigateToOura,
}: StudentOverviewDashboardProps) => {
  const shouldReduceMotion = useReducedMotion();
  const activeContainerVariants = shouldReduceMotion ? reducedContainerVariants : containerVariants;
  const activeCardVariants = shouldReduceMotion ? reducedCardVariants : cardVariants;
  // Medical alert dismiss state
  const [medicalAlertDismissed, setMedicalAlertDismissed] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(`medical-alert-dismissed-${student.id}`);
    if (dismissed === 'true') {
      setMedicalAlertDismissed(true);
    }
  }, [student.id]);

  const handleDismissMedicalAlert = () => {
    localStorage.setItem(`medical-alert-dismissed-${student.id}`, 'true');
    setMedicalAlertDismissed(true);
  };

  // Format Oura date
  const ouraDateLabel = useMemo(() => {
    if (!latestOuraMetrics?.date) return null;
    
    const date = parseISO(latestOuraMetrics.date);
    if (isToday(date)) return "Hoje";
    if (isYesterday(date)) return "Ontem";
    return format(date, "d 'de' MMMM", { locale: ptBR });
  }, [latestOuraMetrics?.date]);

  // Key statistics
  const totalSessions = useMemo(() => sessions?.length || 0, [sessions]);
  
  const sessionsThisMonth = useMemo(() => {
    if (!sessions) return 0;
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return sessions.filter(s => new Date(s.date) >= firstDayOfMonth).length;
  }, [sessions]);

  // Calculate monthly goal and progress
  const monthlyGoal = student.weekly_sessions_proposed ? student.weekly_sessions_proposed * 4 : null;
  const monthlyProgress = monthlyGoal ? (sessionsThisMonth / monthlyGoal) * 100 : undefined;

  const uniqueExercises = useMemo(() => {
    if (!sessions) return 0;
    const exerciseNames = new Set<string>();
    sessions.forEach(session => {
      session.exercises?.forEach((ex) => {
        exerciseNames.add(ex.exercise_name);
      });
    });
    return exerciseNames.size;
  }, [sessions]);

  const activePrescriptions = useMemo(() => {
    if (!assignments) return 0;
    const today = format(new Date(), "yyyy-MM-dd");
    return assignments.filter(a => 
      a.start_date <= today && (!a.end_date || a.end_date >= today)
    ).length;
  }, [assignments]);

  return (
    <motion.div 
      variants={activeContainerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-lg"
    >
      {/* Oura Ring summary (compact to avoid duplicated dashboards) */}
      <motion.div variants={activeCardVariants}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-sm">
              <Activity className="h-5 w-5 text-primary" />
              💍 Oura Ring
            </CardTitle>
            <CardDescription>
              {ouraDateLabel || (ouraConnection?.is_active
                ? "Conectado, aguardando dados"
                : "Não conectado"
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {ouraConnection?.is_active ? (
              latestOuraMetrics ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-md">
                    <div className="rounded-lg border bg-muted/20 p-3">
                      <p className="text-xs text-muted-foreground">Prontidão</p>
                      <p className="text-lg font-semibold">{latestOuraMetrics.readiness_score ?? "--"}</p>
                    </div>
                    <div className="rounded-lg border bg-muted/20 p-3">
                      <p className="text-xs text-muted-foreground">Sono</p>
                      <p className="text-lg font-semibold">{latestOuraMetrics.sleep_score ?? "--"}</p>
                    </div>
                    <div className="rounded-lg border bg-muted/20 p-3">
                      <p className="text-xs text-muted-foreground">Atividade</p>
                      <p className="text-lg font-semibold">{latestOuraMetrics.activity_score ?? "--"}</p>
                    </div>
                    <div className="rounded-lg border bg-muted/20 p-3">
                      <p className="text-xs text-muted-foreground">Estresse Alto</p>
                      <p className="text-lg font-semibold">
                        {latestOuraMetrics.stress_high_time !== null
                          ? `${Math.round(latestOuraMetrics.stress_high_time / 60)} min`
                          : "--"}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <p className="text-xs text-muted-foreground">
                      Dados completos e tendência detalhada ficam na aba Oura - Histórico.
                    </p>
                    <Button variant="outline" size="sm" onClick={onNavigateToOura}>
                      Abrir Oura - Histórico
                    </Button>
                  </div>
                </>
              ) : (
                <div className="space-y-2 py-md">
                  <p className="text-sm text-muted-foreground">
                    Oura conectado, sem dados sincronizados no momento.
                  </p>
                  <Button variant="outline" size="sm" onClick={onNavigateToOura}>
                    Abrir Oura - Histórico
                  </Button>
                </div>
              )
            ) : (
              <button
                onClick={onNavigateToOura}
                className="w-full p-lg rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <Activity className="h-10 w-10 mx-auto mb-sm text-muted-foreground" />
                <p className="text-sm font-semibold">Conectar Oura Ring</p>
                <p className="text-xs text-muted-foreground mt-xs">Clique para configurar</p>
              </button>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Training Statistics - Rich Context */}
      <motion.div 
        variants={activeCardVariants}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-md"
      >
        <StatCard
          title="Total de Sessões"
          value={totalSessions}
          icon={Dumbbell}
          gradient
          subtitle={`${sessionsThisMonth} este mês`}
        />
        <StatCard
          title="Sessões este Mês"
          value={sessionsThisMonth}
          icon={Calendar}
          subtitle={monthlyGoal ? `Meta: ${monthlyGoal} sessões/mês` : undefined}
          progress={monthlyProgress}
          badge={
            monthlyGoal && sessionsThisMonth >= monthlyGoal 
              ? "🎯 Meta atingida!" 
              : sessionsThisMonth >= (monthlyGoal || 0) * 0.75 
                ? "🔥 Quase lá!" 
                : undefined
          }
        />
        <StatCard
          title="Exercícios Únicos"
          value={uniqueExercises}
          icon={TrendingUp}
          subtitle="Variedade no treinamento"
          badge={uniqueExercises > 50 ? "💪 Alta variedade" : undefined}
        />
        <StatCard
          title="Prescrições Ativas"
          value={activePrescriptions}
          icon={Target}
          subtitle="Planos de treino ativos"
        />
      </motion.div>

      {/* Important Observations */}
      <motion.div variants={activeCardVariants}>
        <StudentObservationsCard studentId={student.id} />
      </motion.div>

      {/* Training Zones and Protocol Recommendations */}
      <motion.div 
        variants={activeCardVariants}
        className="grid grid-cols-1 lg:grid-cols-2 gap-md"
      >
        <TrainingZonesCard maxHeartRate={student.max_heart_rate} />
        <ProtocolRecommendationsCard studentId={student.id} />
      </motion.div>

      {/* Medical Considerations - Premium Alert */}
      {(student.limitations || student.injury_history) && !medicalAlertDismissed && (
        <motion.div variants={activeCardVariants}>
          <Card className="relative overflow-hidden border-2 border-warning/50 bg-gradient-to-br from-warning/5 via-background to-warning/5">
            {/* Subtle Corner Shimmer */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-warning/20 via-transparent to-transparent motion-safe:animate-shimmer motion-reduce:hidden pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-gradient-to-tr from-warning/20 via-transparent to-transparent motion-safe:animate-shimmer motion-reduce:hidden pointer-events-none" />
            
            <CardHeader className="relative z-10">
              <div className="flex items-start justify-between gap-md">
                <CardTitle className="flex items-center gap-sm text-warning-foreground">
                  <div className="p-2 bg-warning/20 rounded-full">
                    <AlertCircle className="h-5 w-5 text-warning motion-safe:animate-pulse-slow" />
                  </div>
                  ⚠️ Considerações Médicas Importantes
                </CardTitle>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:text-foreground hover:bg-warning/10"
                  onClick={handleDismissMedicalAlert}
                  aria-label="Dispensar alerta"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-md relative z-10">
              {student.limitations && (
                <div className="p-md rounded-lg bg-background/70 border border-warning/30">
                  <h4 className="text-sm font-semibold mb-sm text-warning-foreground flex items-center gap-xs">
                    <AlertCircle className="h-4 w-4" />
                    Limitações:
                  </h4>
                  <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">{student.limitations}</p>
                </div>
              )}
              {student.injury_history && (
                <div className="p-md rounded-lg bg-background/70 border border-warning/30">
                  <h4 className="text-sm font-semibold mb-sm text-warning-foreground flex items-center gap-xs">
                    <AlertCircle className="h-4 w-4" />
                    Histórico de Lesões:
                  </h4>
                  <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">{student.injury_history}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}
    </motion.div>
  );
};
