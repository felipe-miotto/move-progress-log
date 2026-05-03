import { useNavigate } from "react-router-dom";
import { UserX, TrendingDown, CalendarCheck, FileWarning } from "lucide-react";
import StatCard, { type StatCardTone } from "@/components/StatCard";
import { StatCardSkeleton } from "@/components/skeletons/StatCardSkeleton";
import { useDashboardKPIs } from "@/hooks/useDashboardKPIs";
import { NAV_LABELS } from "@/constants/navigation";

const formatValueOrDash = (value: number | null): string | number =>
  typeof value === "number" ? value : "—";

const inactiveTone = (n: number | null): StatCardTone => {
  if (n === null) return "default";
  if (n >= 20) return "danger";
  if (n >= 5) return "warning";
  return "success";
};

const droppingTone = (n: number | null): StatCardTone => {
  if (n === null) return "default";
  if (n >= 10) return "danger";
  if (n >= 3) return "warning";
  return "success";
};

const adherenceTone = (pct: number | null): StatCardTone => {
  if (pct === null) return "default";
  if (pct >= 75) return "success";
  if (pct >= 50) return "warning";
  return "danger";
};

const stagnantTone = (n: number | null): StatCardTone => {
  if (n === null) return "default";
  if (n >= 10) return "danger";
  if (n >= 3) return "warning";
  return "success";
};

export const StatsGrid = () => {
  const navigate = useNavigate();
  const { data: kpis, isLoading } = useDashboardKPIs();

  if (isLoading) {
    return (
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-md">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </section>
    );
  }

  const inactive = kpis?.inactive7d ?? null;
  const dropping = kpis?.frequencyDropping ?? null;
  const adherence = kpis?.weekAdherence ?? null;
  const stagnant = kpis?.stagnant4w ?? null;

  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-md">
      <StatCard
        title={NAV_LABELS.statInactive7d}
        value={formatValueOrDash(inactive)}
        icon={UserX}
        subtitle="Alunos sem sessão registrada"
        tone={inactiveTone(inactive)}
        onClick={() => navigate("/alunos?inactive=7")}
      />
      <StatCard
        title={NAV_LABELS.statFrequencyDropping}
        value={formatValueOrDash(dropping)}
        icon={TrendingDown}
        subtitle="Queda nas últimas 4 semanas"
        tone={droppingTone(dropping)}
        onClick={() => navigate("/alunos?dropping=true")}
      />
      <StatCard
        title={NAV_LABELS.statWeekAdherence}
        value={
          adherence
            ? `${adherence.realized}/${adherence.prescribed}`
            : "—"
        }
        icon={CalendarCheck}
        subtitle={
          adherence
            ? `${adherence.percentage}% das sessões prescritas`
            : "Aguardando dados"
        }
        tone={adherenceTone(adherence?.percentage ?? null)}
        onClick={() => navigate("/sessoes?week=current")}
      />
      <StatCard
        title={NAV_LABELS.statPrescriptionsStagnant}
        value={formatValueOrDash(stagnant)}
        icon={FileWarning}
        subtitle="Sem atualização há 4+ semanas"
        tone={stagnantTone(stagnant)}
        onClick={() => navigate("/prescricoes?stagnant=4")}
      />
    </section>
  );
};
