import { useNavigate } from "react-router-dom";
import { Dumbbell, TrendingUp, Calendar, Users } from "lucide-react";
import StatCard from "@/components/StatCard";
import { StatCardSkeleton } from "@/components/skeletons/StatCardSkeleton";
import { useStats } from "@/hooks/useStats";
import { NAV_LABELS } from "@/constants/navigation";

export const StatsGrid = () => {
  const navigate = useNavigate();
  const { data: stats, isLoading } = useStats();

  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-md">
      {isLoading ? (
        <>
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
        </>
      ) : (
        <>
          <StatCard
            title={NAV_LABELS.statTotalSessions}
            value={stats?.totalSessions || 0}
            icon={Dumbbell}
            subtitle="Total consolidado"
            gradient
            onClick={() => navigate('/sessoes')}
          />
          <StatCard
            title={NAV_LABELS.statThisMonth}
            value={stats?.thisMonth || 0}
            icon={Calendar}
            subtitle={`Sessões em ${new Date().toLocaleDateString('pt-BR', { month: 'long' })}`}
            onClick={() => navigate('/sessoes')}
          />
          <StatCard
            title={NAV_LABELS.statActiveStudents}
            value={stats?.activeStudents || 0}
            icon={Users}
            subtitle="Com treinos regulares"
            onClick={() => navigate('/alunos')}
          />
          <StatCard
            title={NAV_LABELS.statAvgLoad}
            value={`${stats?.avgLoad || 0}kg`}
            icon={TrendingUp}
            subtitle="Por sessão"
            onClick={() => navigate('/sessoes')}
          />
        </>
      )}
    </section>
  );
};
