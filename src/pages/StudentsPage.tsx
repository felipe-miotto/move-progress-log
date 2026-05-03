import { useState, memo, useMemo } from "react";
import { useStudents, useDeleteStudent } from "@/hooks/useStudents";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import i18n from "@/i18n/pt-BR.json";
import EmptyState from "@/components/EmptyState";
import { StudentCardSkeleton } from "@/components/skeletons/StudentCardSkeleton";
import { Users, Edit, Trash2, Eye, GitCompare, Plus, Link2, Mic, UserPlus, Info, AlertCircle, Search, Shield, NotebookPen, MoreVertical, RefreshCw, Activity, X, UserX, TrendingDown } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ROUTES } from "@/constants/navigation";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StudentAvatarImage } from "@/components/StudentAvatarImage";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EditStudentDialog } from "@/components/EditStudentDialog";
import { AddStudentDialog } from "@/components/AddStudentDialog";
import { GenerateInviteLinkDialog } from "@/components/GenerateInviteLinkDialog";
import { RecordIndividualSessionDialog } from "@/components/RecordIndividualSessionDialog";
import { RecordGroupSessionDialog } from "@/components/RecordGroupSessionDialog";
import { StudentObservationsDialog } from "@/components/StudentObservationsDialog";
import { SendOuraConnectDialog } from "@/components/SendOuraConnectDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useStudentsCardData, StudentCardData } from "@/hooks/useStudentsCardData";
import { useStudentsActivityFilter, type StudentsActivityFilter } from "@/hooks/useStudentsActivityFilter";
import type { Student } from "@/hooks/useStudents";
import { PageLayout } from "@/components/PageLayout";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";

import { useOuraSyncAll } from "@/hooks/useOuraSyncAll";
import { useIsAdmin } from "@/hooks/useUserRole";
import { NAV_LABELS } from "@/constants/navigation";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useSEOHead, SEO_PRESETS } from "@/hooks/useSEOHead";
import { useOpenGraph, FABRIK_OG_DEFAULTS } from "@/hooks/useOpenGraph";
import { getWebPageSchema, getBreadcrumbSchema, getItemListSchema } from "@/utils/structuredData";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Funções auxiliares movidas para fora do componente (otimização)
const getReadinessColor = (score: number | null | undefined) => {
  if (!score) return 'text-muted-foreground';
  if (score >= 85) return 'text-success';
  if (score >= 70) return 'text-warning';
  return 'text-destructive';
};

const getReadinessLabel = (score: number | null | undefined) => {
  if (!score) return 'Sem dados';
  if (score >= 85) return 'Ótimo';
  if (score >= 70) return 'Bom';
  if (score >= 55) return 'Regular';
  return 'Crítico';
};

const getMissingFields = (student: Student) => {
  const missing: string[] = [];
  if (!student.birth_date) missing.push('Data de nascimento');
  if (!student.fitness_level) missing.push('Nível de fitness');
  if (!student.objectives) missing.push('Objetivos');
  if (!student.weight_kg || !student.height_cm) missing.push('Peso/Altura');
  if (!student.max_heart_rate) missing.push('FC Máxima');
  return missing;
};

// Interface para props do StudentCard
interface StudentCardProps {
  student: Student;
  cardData: StudentCardData | undefined;
  onEdit: (student: Student) => void;
  onDelete: (id: string) => void;
  onRecordSession: (id: string, name: string) => void;
  onOpenGroupSession: () => void;
  onOuraConnect: (id: string, name: string) => void;
}

// Componente StudentCard otimizado - recebe dados via props em vez de fazer queries
const StudentCard = memo(({ 
  student, 
  cardData, 
  onEdit, 
  onDelete, 
  onRecordSession,
  onOpenGroupSession,
  onOuraConnect 
}: StudentCardProps) => {
  const navigate = useNavigate();
  const [showObservationsDialog, setShowObservationsDialog] = useState(false);
  
  // Dados vindos do batch hook (sem queries individuais)
  const readinessScore = cardData?.ouraMetrics?.readiness_score ?? null;
  const importantObservations = cardData?.importantObservations ?? [];
  const ouraStatus = cardData?.ouraStatus ?? { isConnected: false, hasIssues: false };
  const hasImportantObservations = importantObservations.length > 0;
  
  const missingFields = getMissingFields(student);
  const hasIncompleteData = missingFields.length > 0;

  return (
    <>
      <Card className="card-interactive overflow-hidden">
        <CardHeader className="space-y-md pb-sm">
          <CardTitle className="flex items-center justify-between gap-sm">
            <div className="flex items-center gap-sm">
              <Avatar className="h-16 w-16">
                <StudentAvatarImage avatarUrl={student.avatar_url} />
                <AvatarFallback className="bg-primary/10 text-foreground text-lg font-semibold">
                  {student.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col">
                <span className="text-lg font-semibold">{student.name}</span>
                {student.fitness_level && (
                  <Badge variant="outline" className="text-xs capitalize w-fit mt-1 opacity-70">
                    {student.fitness_level}
                  </Badge>
                )}
              </div>
            </div>
            
            {hasIncompleteData && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => onEdit(student)}
                      className="inline-flex items-center justify-center rounded-full p-2 hover:bg-warning/10 transition-colors border border-warning/20"
                      aria-label="Dados incompletos - clique para completar"
                    >
                      <AlertCircle className="h-4 w-4 text-warning" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-xs">
                    <div className="space-y-2">
                      <p className="font-semibold text-xs">Campos a preencher:</p>
                      <ul className="text-xs space-y-1">
                        {missingFields.map((field) => (
                          <li key={field} className="flex items-start gap-1">
                            <span className="text-warning">•</span>
                            <span>{field}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="text-xs text-muted-foreground italic pt-1">
                        Clique para editar o perfil
                      </p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </CardTitle>
          
          <div className="space-y-sm">
            {readinessScore ? (
              <div className="flex items-center justify-between py-sm border-b border-border/50">
                <div className="flex flex-col gap-xs">
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">Prontidão</span>
                  <span className={`text-2xl font-semibold tabular-nums ${getReadinessColor(readinessScore)}`}>
                    {readinessScore}%
                  </span>
                </div>
                <Badge variant="outline" className="text-xs">
                  {getReadinessLabel(readinessScore)}
                </Badge>
              </div>
            ) : ouraStatus.isConnected && ouraStatus.hasIssues ? (
              <Alert className="border-muted bg-transparent py-xs px-sm">
                <AlertCircle className="h-3 w-3 text-muted-foreground" />
                <AlertDescription className="text-xs text-muted-foreground">
                  Dados Oura indisponíveis
                </AlertDescription>
              </Alert>
            ) : ouraStatus.isConnected ? (
              <div className="flex items-center justify-between py-xs px-sm rounded-md border border-dashed">
                <span className="text-xs text-muted-foreground">Aguardando dados Oura</span>
              </div>
            ) : null}
            
            {hasImportantObservations && (
              <Button
                variant="outline"
                size="sm"
                className="w-full h-9 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                onClick={() => setShowObservationsDialog(true)}
                aria-label={`Ver ${importantObservations.length} observações importantes`}
              >
                <Info className="h-3 w-3 mr-2" />
                <span className="text-xs">
                  {importantObservations.length} observação{importantObservations.length !== 1 ? 'ões' : ''}
                </span>
              </Button>
            )}
          </div>
        </CardHeader>
        
        <CardContent className="pt-sm pb-md">
          <div className="flex gap-xs">
            <Button
              variant="default"
              size="default"
              className="flex-1 shadow-sm hover:shadow-md transition-shadow"
              onClick={() => navigate(ROUTES.studentDetail(student.id))}
              aria-label={`Ver detalhes de ${student.name}`}
            >
              <Eye className="h-4 w-4 mr-2" />
              Detalhes
            </Button>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Mais ações">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => onRecordSession(student.id, student.name)}>
                  <Mic className="h-4 w-4 mr-2" />
                  Registro por Voz
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onOpenGroupSession}>
                  <NotebookPen className="h-4 w-4 mr-2" />
                  Registro Manual
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onEdit(student)}>
                  <Edit className="h-4 w-4 mr-2" />
                  Editar Aluno
                </DropdownMenuItem>
                {!ouraStatus.isConnected && (
                  <DropdownMenuItem onClick={() => onOuraConnect(student.id, student.name)}>
                    <Activity className="h-4 w-4 mr-2" />
                    Conectar Oura Ring
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={() => onDelete(student.id)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Excluir Aluno
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardContent>
      </Card>
      
      <StudentObservationsDialog
        open={showObservationsDialog}
        onOpenChange={setShowObservationsDialog}
        studentName={student.name}
        observations={importantObservations}
      />
    </>
  );
}, (prevProps, nextProps) => {
  return prevProps.student.id === nextProps.student.id &&
    prevProps.student.name === nextProps.student.name &&
    prevProps.student.updated_at === nextProps.student.updated_at &&
    prevProps.cardData === nextProps.cardData;
});

StudentCard.displayName = 'StudentCard';

// Componente principal da página
const StudentsPage = () => {
  usePageTitle(NAV_LABELS.students);
  useSEOHead(SEO_PRESETS.private);
  useOpenGraph({
    ...FABRIK_OG_DEFAULTS,
    title: `${NAV_LABELS.students} · Fabrik Performance`,
    description: 'Gestão de alunos e acompanhamento de treinos personalizados no sistema Fabrik Performance.',
    type: 'website',
    url: true,
  });
  
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: students, isLoading } = useStudents();
  const { isAdmin } = useIsAdmin();
  const { mutate: syncAll, isPending: isSyncing } = useOuraSyncAll();
  const deleteStudent = useDeleteStudent();
  
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [deletingStudentId, setDeletingStudentId] = useState<string | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [recordingStudentId, setRecordingStudentId] = useState<string | null>(null);
  const [recordingStudentName, setRecordingStudentName] = useState<string>("");
  const [isGroupSessionDialogOpen, setIsGroupSessionDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [ouraConnectStudentId, setOuraConnectStudentId] = useState<string | null>(null);
  const [ouraConnectStudentName, setOuraConnectStudentName] = useState<string>("");

  // Batch hook - busca dados de todos os alunos em 3 queries em vez de N*3
  const studentIds = useMemo(() => students?.map(s => s.id) ?? [], [students]);
  const { data: studentsCardData } = useStudentsCardData(studentIds);

  // Drill-down filter from dashboard KPIs (?inactive=N | ?dropping=true)
  const activityFilter = useMemo<StudentsActivityFilter>(() => {
    const inactiveParam = searchParams.get("inactive");
    const droppingParam = searchParams.get("dropping");
    if (inactiveParam) {
      const days = Number.parseInt(inactiveParam, 10);
      if (Number.isFinite(days) && days > 0) {
        return { kind: "inactive", days };
      }
    }
    if (droppingParam === "true") {
      return { kind: "dropping" };
    }
    return { kind: "none" };
  }, [searchParams]);

  const {
    data: activityFilterSet,
    isLoading: isActivityFilterLoading,
    isError: isActivityFilterError,
  } = useStudentsActivityFilter(activityFilter);

  const clearActivityFilter = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("inactive");
    next.delete("dropping");
    setSearchParams(next, { replace: true });
  };

  const handleDelete = async (id: string) => {
    await deleteStudent.mutateAsync(id);
    setDeletingStudentId(null);
  };

  const handleRecordSession = (id: string, name: string) => {
    setRecordingStudentId(id);
    setRecordingStudentName(name);
  };

  // While the activity filter is loading, hide the full list to avoid the
  // flash of "all students" before the drill-down narrows it down.
  const isApplyingActivityFilter =
    activityFilter.kind !== "none" && isActivityFilterLoading;

  const filteredStudents = students?.filter(student => {
    const matchesSearch = student.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesActivity = activityFilterSet ? activityFilterSet.has(student.id) : true;
    return matchesSearch && matchesActivity;
  });

  const activityFilterCount = activityFilterSet?.size ?? null;
  const activityFilterLabel =
    activityFilter.kind === "inactive"
      ? `Sem treinar há ${activityFilter.days}+ dias`
      : activityFilter.kind === "dropping"
        ? "Frequência caindo"
        : null;
  const ActivityFilterIcon =
    activityFilter.kind === "inactive"
      ? UserX
      : activityFilter.kind === "dropping"
        ? TrendingDown
        : null;

  return (
    <PageLayout
      className="animate-fade-in"
      structuredData={[
        { data: getWebPageSchema(NAV_LABELS.students, "Gerencie os dados dos seus alunos, acompanhe métricas Oura Ring e registre sessões de treino"), id: "webpage-schema" },
        { data: getBreadcrumbSchema([{ label: "Home", href: "/" }, { label: NAV_LABELS.students, href: "/alunos" }]), id: "breadcrumb-schema" },
        ...(students && students.length > 0 ? [{ data: getItemListSchema(students.map(s => ({ name: s.name, url: `/alunos/${s.id}` })), "Lista de Alunos"), id: "students-list-schema" }] : []),
      ]}
    >
        <PageHeader
          title={NAV_LABELS.students}
          breadcrumbs={[{ label: NAV_LABELS.students, href: "/alunos", icon: Users }]}
          actions={
            <>
              <Button variant="default" onClick={() => setIsAddDialogOpen(true)} aria-label={NAV_LABELS.addStudent}>
                <Plus className="h-4 w-4 mr-2" />
                {NAV_LABELS.addStudent}
              </Button>
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" aria-label="Mais ações">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-popover">
                  <DropdownMenuItem 
                    onClick={() => syncAll()}
                    disabled={isSyncing}
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
                    {isSyncing ? 'Sincronizando...' : 'Sincronizar Todos Agora'}
                  </DropdownMenuItem>
                  
                  {isAdmin && (
                    <DropdownMenuItem asChild>
                      <Link to="/admin/diagnostico-oura" className="flex items-center w-full">
                        <Shield className="h-4 w-4 mr-2" />
                        {NAV_LABELS.adminDiagnostics}
                      </Link>
                    </DropdownMenuItem>
                  )}
                  
                  <DropdownMenuItem onClick={() => setIsGroupSessionDialogOpen(true)}>
                    <UserPlus className="h-4 w-4 mr-2" />
                    {NAV_LABELS.groupSession}
                  </DropdownMenuItem>
                  
                  <DropdownMenuItem onClick={() => setIsInviteDialogOpen(true)}>
                    <Link2 className="h-4 w-4 mr-2" />
                    {NAV_LABELS.generateInvite}
                  </DropdownMenuItem>
                  
                  <DropdownMenuItem asChild>
                    <Link to="/alunos-comparacao" className="flex items-center w-full">
                      <GitCompare className="h-4 w-4 mr-2" />
                      {NAV_LABELS.studentsComparison}
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          }
        />

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Buscar aluno por nome..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {activityFilterLabel && ActivityFilterIcon && (
          <div
            className={`flex items-center gap-sm rounded-md border px-md py-sm text-sm ${
              isActivityFilterError
                ? "border-destructive/30 bg-destructive/5"
                : "border-warning/30 bg-warning/5"
            }`}
          >
            <ActivityFilterIcon
              className={`h-4 w-4 ${isActivityFilterError ? "text-destructive" : "text-warning"}`}
              aria-hidden="true"
            />
            <span className="font-medium">
              {isActivityFilterError
                ? "Erro ao aplicar filtro do dashboard"
                : isApplyingActivityFilter
                  ? `Aplicando filtro: ${activityFilterLabel.toLowerCase()}…`
                  : activityFilterCount !== null
                    ? `${activityFilterCount} aluno${activityFilterCount === 1 ? "" : "s"}: ${activityFilterLabel.toLowerCase()}`
                    : `Filtro ativo: ${activityFilterLabel.toLowerCase()}`}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearActivityFilter}
              className="ml-auto h-7 px-sm"
              aria-label="Limpar filtro de atividade"
            >
              <X className="h-3 w-3 mr-1" />
              Limpar filtro
            </Button>
          </div>
        )}

        {isLoading || isApplyingActivityFilter ? (
          <div className="grid gap-md md:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <StudentCardSkeleton key={i} />
            ))}
          </div>
        ) : filteredStudents && filteredStudents.length > 0 ? (
          <div className="grid gap-md md:grid-cols-2 lg:grid-cols-3">
            {filteredStudents.map((student) => (
              <StudentCard 
                key={student.id} 
                student={student}
                cardData={studentsCardData?.[student.id]}
                onEdit={setEditingStudent}
                onDelete={setDeletingStudentId}
                onRecordSession={handleRecordSession}
                onOpenGroupSession={() => setIsGroupSessionDialogOpen(true)}
                onOuraConnect={(id, name) => {
                  setOuraConnectStudentId(id);
                  setOuraConnectStudentName(name);
                }}
              />
            ))}
          </div>
        ) : searchTerm ? (
          <EmptyState
            icon={<Search className="h-6 w-6" />}
            title="Nenhum aluno encontrado"
            description="Nenhum aluno corresponde aos termos de busca. Verifique a ortografia ou limpe a busca para ver todos os alunos cadastrados."
            primaryAction={{
              label: "Limpar busca",
              onClick: () => setSearchTerm(""),
            }}
          />
        ) : activityFilter.kind !== "none" ? (
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title="Nenhum aluno corresponde ao filtro"
            description={
              activityFilter.kind === "inactive"
                ? `Não há alunos sem treinar há ${activityFilter.days}+ dias. Tudo certo por aqui!`
                : "Não há alunos com frequência em queda nas últimas 4 semanas."
            }
            primaryAction={{
              label: "Limpar filtro",
              onClick: clearActivityFilter,
            }}
          />
        ) : (
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title="Adicione seu primeiro aluno"
            description="Cadastre alunos para começar a criar prescrições personalizadas, registrar sessões de treino e acompanhar a evolução com dados do Oura Ring. Seu hub completo de gestão de alunos."
            primaryAction={{
              label: i18n.actions.create,
              onClick: () => setIsAddDialogOpen(true)
            }}
            secondaryAction={{
              label: i18n.actions.import,
              onClick: () => setIsInviteDialogOpen(true)
            }}
          />
        )}

      <AddStudentDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
      />

      <EditStudentDialog
        student={editingStudent}
        open={!!editingStudent}
        onOpenChange={(open) => !open && setEditingStudent(null)}
      />

      <GenerateInviteLinkDialog
        open={isInviteDialogOpen}
        onOpenChange={setIsInviteDialogOpen}
      />

      <RecordIndividualSessionDialog
        open={!!recordingStudentId}
        onOpenChange={(open) => {
          if (!open) {
            setRecordingStudentId(null);
            setRecordingStudentName("");
          }
        }}
        studentId={recordingStudentId || ""}
        studentName={recordingStudentName}
      />

      <RecordGroupSessionDialog
        open={isGroupSessionDialogOpen}
        onOpenChange={setIsGroupSessionDialogOpen}
        prescriptionId={null}
      />

      <AlertDialog open={!!deletingStudentId} onOpenChange={(open) => !open && setDeletingStudentId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{i18n.modules.students.confirmDelete}</AlertDialogTitle>
            <AlertDialogDescription>
              {i18n.modules.students.deleteWarning}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{i18n.actions.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingStudentId && handleDelete(deletingStudentId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {i18n.actions.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {ouraConnectStudentId && (
        <SendOuraConnectDialog
          open={!!ouraConnectStudentId}
          onOpenChange={(open) => {
            if (!open) {
              setOuraConnectStudentId(null);
              setOuraConnectStudentName("");
            }
          }}
          studentId={ouraConnectStudentId}
          studentName={ouraConnectStudentName}
        />
      )}
    </PageLayout>
  );
};

export default StudentsPage;
