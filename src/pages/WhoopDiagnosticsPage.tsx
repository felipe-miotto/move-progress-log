import { useStudents } from "@/hooks/useStudents";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageLoadingSkeleton } from "@/components/PageLoadingSkeleton";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Activity } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PageLayout } from "@/components/PageLayout";
import { PageHeader } from "@/components/PageHeader";
import { useIsAdmin } from "@/hooks/useUserRole";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { NAV_LABELS, ROUTES } from "@/constants/navigation";
import { usePageTitle } from "@/hooks/usePageTitle";
import { WhoopStudentDiagnosticsCard } from "@/components/WhoopStudentDiagnosticsCard";

const WhoopDiagnosticsPage = () => {
  usePageTitle(NAV_LABELS.adminWhoopDiagnostics);
  const navigate = useNavigate();
  const { data: students, isLoading } = useStudents();
  const { isAdmin, isLoading: isLoadingRole } = useIsAdmin();

  if (isLoadingRole) {
    return <PageLoadingSkeleton layout="list" />;
  }

  if (!isAdmin) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertDescription>
            Você não tem permissão para acessar esta página. Apenas administradores podem ver o diagnóstico do Whoop.
          </AlertDescription>
        </Alert>
        <Button onClick={() => navigate(ROUTES.students)} className="mt-4">
          Voltar para Alunos
        </Button>
      </div>
    );
  }

  return (
    <PageLayout>
      <PageHeader
        title={NAV_LABELS.adminWhoopDiagnostics}
        breadcrumbs={[
          { label: NAV_LABELS.students, href: "/alunos" },
          { label: NAV_LABELS.adminWhoopDiagnostics, icon: Activity },
        ]}
        actions={
          <Button variant="ghost" size="icon" onClick={() => navigate(ROUTES.students)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : students && students.length > 0 ? (
        <div className="space-y-4">
          {students.map((student) => (
            <WhoopStudentDiagnosticsCard key={student.id} studentId={student.id} studentName={student.name} />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-xl font-semibold text-muted-foreground">Nenhum aluno cadastrado</p>
          </CardContent>
        </Card>
      )}
    </PageLayout>
  );
};

export default WhoopDiagnosticsPage;
