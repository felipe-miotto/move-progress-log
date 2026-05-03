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

const ERROR_SUBTITLE = "Erro ao carregar KPI";
const ERROR_VALUE = "—";

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

  const errors = kpis?.errors ?? {};
  const inactive = kpis?.inactive7d ?? null;
  const dropping = kpis?.frequencyDropping ?? null;
  const adherence = kpis?.weekAdherence ?? null;
  const stagnant = kpis?.stagnant4w ?? null;

  const inactiveErrored = Boolean(errors.inactive7d);
  const droppingErrored = Boolean(errors.frequencyDropping);
  const adherenceErrored = Boolean(errors.weekAdherence);
  const stagnantErrored = Boolean(errors.stagnant4w);

  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-md">
      <StatCard
        title={NAV_LABELS.statInactive7d}
        value={inactiveErrored ? ERROR_VALUE : formatValueOrDash(inactive)}
        icon={UserX}
        subtitle={inactiveErrored ? ERROR_SUBTITLE : "Alunos sem sessão registrada"}
        tone={inactiveErrored ? "danger" : inactiveTone(inactive)}
        onClick={
          inactiveErrored ? undefined : () => navigate("/alunos?inactive=7")
        }
      />
      <StatCard
        title={NAV_LABELS.statFrequencyDropping}
        value={droppingErrored ? ERROR_VALUE : formatValueOrDash(dropping)}
        icon={TrendingDown}
        subtitle={droppingErrored ? ERROR_SUBTITLE : "Queda nas últimas 4 semanas"}
        tone={droppingErrored ? "danger" : droppingTone(dropping)}
        onClick={
          droppingErrored ? undefined : () => navigate("/alunos?dropping=true")
        }
      />
      <StatCard
        title={NAV_LABELS.statWeekAdherence}
        value={
          adherenceErrored
            ? ERROR_VALUE
            : adherence
              ? `${adherence.realized}/${adherence.prescribed}`
              : "—"
        }
        icon={CalendarCheck}
        subtitle={
          adherenceErrored
            ? ERROR_SUBTITLE
            : adherence
              ? `${adherence.percentage}% das sessões prescritas`
              : "Aguardando dados"
        }
        tone={adherenceErrored ? "danger" : adherenceTone(adherence?.percentage ?? null)}
        onClick={
          adherenceErrored ? undefined : () => navigate("/sessoes?week=current")
        }
      />
      <StatCard
        title={NAV_LABELS.statPrescriptionsStagnant}
        value={stagnantErrored ? ERROR_VALUE : formatValueOrDash(stagnant)}
        icon={FileWarning}
        subtitle={stagnantErrored ? ERROR_SUBTITLE : "Sem atualização há 4+ semanas"}
        tone={stagnantErrored ? "danger" : stagnantTone(stagnant)}
        onClick={
          stagnantErrored ? undefined : () => navigate("/prescricoes?stagnant=4")
        }
      />
    </section>
  );
};
