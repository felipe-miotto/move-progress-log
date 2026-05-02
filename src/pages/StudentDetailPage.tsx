import { useParams, useNavigate } from "react-router-dom";
import { ROUTES } from "@/constants/navigation";
import { useStudentById } from "@/hooks/useStudents";
import { useStudentPrescriptions, useSessionsWithExercises } from "@/hooks/useStudentDetail";
import { useDeletePrescriptionAssignment } from "@/hooks/usePrescriptions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Calendar, Activity, FileText, TrendingUp, Info, Mic, Users, Trash2, AlertCircle, User, Filter } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StudentAvatarImage } from "@/components/StudentAvatarImage";
import { Alert, AlertDescription } from "@/components/ui/alert";
import WorkoutCard from "@/components/WorkoutCard";
import ExerciseHistoryCard from "@/components/ExerciseHistoryCard";
import TrainingZonesCard from "@/components/TrainingZonesCard";
import ProtocolRecommendationsCard from "@/components/ProtocolRecommendationsCard";
import { OuraConnectionCard } from "@/components/OuraConnectionCard";
import OuraMetricsCard from "@/components/OuraMetricsCard";
import { OuraSleepDetailCard } from "@/components/OuraSleepDetailCard";
import { OuraActivityCard } from "@/components/OuraActivityCard";
import { OuraWorkoutsCard } from "@/components/OuraWorkoutsCard";
import { OuraStressCard } from "@/components/OuraStressCard";
import { OuraAdvancedMetricsCard } from "@/components/OuraAdvancedMetricsCard";
import { OuraApiDiagnosticsCard } from "@/components/OuraApiDiagnosticsCard";
import { OuraConnectionStatus } from "@/components/OuraConnectionStatus";
import { useIsAdmin } from "@/hooks/useUserRole";
import ManualProtocolRecommendationDialog from "@/components/ManualProtocolRecommendationDialog";
import PersonalizedTrainingDashboard from "@/components/PersonalizedTrainingDashboard";
import { StudentObservationsCard } from "@/components/StudentObservationsCard";
import { RecordIndividualSessionDialog } from "@/components/RecordIndividualSessionDialog";
import { EditSessionDialog } from "@/components/EditSessionDialog";
import { SessionDetailDialog } from "@/components/SessionDetailDialog";
import { EditStudentDialog } from "@/components/EditStudentDialog";
import { StudentOverviewDashboard } from "@/components/StudentOverviewDashboard";
import { useOuraMetrics, useLatestOuraMetrics } from "@/hooks/useOuraMetrics";
import { useOuraConnection } from "@/hooks/useOuraConnection";
import { useState, useMemo, useEffect } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useReopenWorkoutSession, useFinalizeWorkoutSession } from "@/hooks/useWorkoutSessions";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { NAV_LABELS } from "@/constants/navigation";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useSEOHead, SEO_PRESETS } from "@/hooks/useSEOHead";
import { useOpenGraph, FABRIK_OG_DEFAULTS } from "@/hooks/useOpenGraph";
import { StructuredData } from "@/components/StructuredData";
import { getOrganizationSchema, getWebPageSchema, getBreadcrumbSchema, getPersonSchema } from "@/utils/structuredData";
import { ErrorState } from "@/components/ErrorState";
import { PageLayout } from "@/components/PageLayout";
import { StudentHeaderSkeleton } from "@/components/skeletons/StudentHeaderSkeleton";
import { getObjectiveLabel } from "@/constants/objectives";
import { logger } from "@/utils/logger";
import { formatSessionTime } from "@/utils/sessionTime";
import { formatSessionDate } from "@/utils/sessionDate";

const StudentDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const studentId = id ?? "";
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("training");
  const needsSessions = activeTab === "overview" || activeTab === "sessions" || activeTab === "exercises";
  const needsAssignments = activeTab === "overview" || activeTab === "prescriptions";
  const needsOuraHistory = activeTab === "training" || activeTab === "oura";
  const needsLatestOura =
    activeTab === "training" || activeTab === "overview" || activeTab === "oura";

  const { data: student, isLoading: loadingStudent } = useStudentById(id ?? null);
  const { data: sessions, isLoading: loadingSessions } = useSessionsWithExercises(
    needsSessions ? studentId : ""
  );
  const { data: assignments, isLoading: loadingAssignments } = useStudentPrescriptions(
    needsAssignments ? studentId : ""
  );
  const { data: ouraMetrics, isLoading: loadingOuraMetrics } = useOuraMetrics(
    needsOuraHistory ? studentId : "",
    30
  );
  const { data: latestOuraMetrics } = useLatestOuraMetrics(needsLatestOura ? studentId : "");
  const { data: ouraConnection } = useOuraConnection(studentId);
  const { isAdmin } = useIsAdmin();
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
  const [recordSessionOpen, setRecordSessionOpen] = useState(false);
  const [sessionToReopen, setSessionToReopen] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [sessionTypeFilter, setSessionTypeFilter] = useState<'all' | 'individual' | 'group'>('all');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [editStudentOpen, setEditStudentOpen] = useState(false);
  const deleteAssignment = useDeletePrescriptionAssignment();
  const reopenSession = useReopenWorkoutSession();
  const finalizeSession = useFinalizeWorkoutSession();

  // Dynamic page title with student name
  const pageTitle = useMemo(() => {
    return student ? student.name : NAV_LABELS.students;
  }, [student]);
  
  usePageTitle(pageTitle);
  useSEOHead(SEO_PRESETS.private);
  useOpenGraph({
    ...FABRIK_OG_DEFAULTS,
    title: `${pageTitle} · Fabrik Performance`,
    description: student 
      ? `Perfil e acompanhamento de treino de ${student.name} no sistema Fabrik Performance.`
      : 'Perfil de aluno no sistema Fabrik Performance.',
    type: 'profile',
    url: true,
  });

  // Calculate age (must be before early returns to respect hooks order)
  const age = useMemo(() => {
    if (!student?.birth_date) return null;
    const today = new Date();
    const birthDate = new Date(student.birth_date);
    let calculatedAge = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      calculatedAge--;
    }
    return calculatedAge;
  }, [student?.birth_date]);

  if (loadingStudent) {
    return (
      <PageLayout>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </PageLayout>
    );
  }

  if (!student) {
    return (
      <PageLayout>
        <ErrorState
          title="Aluno não encontrado"
          description="O aluno que você está procurando não existe ou foi removido."
          onRetry={() => navigate(ROUTES.students)}
          retryLabel="Voltar para Alunos"
        />
      </PageLayout>
    );
  }

  // Get unique exercises from all sessions
  const uniqueExercises = Array.from(
    new Set(
      sessions?.flatMap((session) => 
        session.exercises?.map((ex) => ex.exercise_name) || []
      ) || []
    )
  );

  // Check for missing student data
  const getMissingFields = () => {
    const missing: string[] = [];
    
    if (!student.birth_date) missing.push('Data de nascimento');
    if (!student.fitness_level) missing.push('Nível de fitness');
    if (!student.objectives) missing.push('Objetivos');
    if (!student.weight_kg || !student.height_cm) missing.push('Peso/Altura');
    if (!student.max_heart_rate) missing.push('FC Máxima');
    
    return missing;
  };

  const missingFields = getMissingFields();
  const hasIncompleteData = missingFields.length > 0;

  return (
    <PageLayout
      structuredData={[
        { data: getWebPageSchema(student.name, `Perfil completo de ${student.name} - Métricas, sessões de treino, exercícios e dados Oura Ring`), id: "webpage-schema" },
        { data: getBreadcrumbSchema([{ label: "Home", href: "/" }, { label: NAV_LABELS.students, href: "/alunos" }, { label: student.name }]), id: "breadcrumb-schema" },
        { data: getPersonSchema({ name: student.name, description: `Aluno da Fabrik Performance${student.objectives ? ` - Objetivos: ${student.objectives}` : ''}` }), id: "person-schema" },
      ]}
    >
      <Breadcrumbs
        items={[
          { label: NAV_LABELS.students, href: "/alunos", icon: Users },
          { label: student.name }
        ]}
      />
      
      {loadingStudent ? (
        <StudentHeaderSkeleton />
      ) : (
        <Card className="bg-card border border-primary/15 shadow-sm rounded-xl mb-md animate-fade-in">
          <CardContent className="p-lg">
            <div className="flex flex-col md:flex-row items-start justify-between gap-lg">
              {/* Coluna 1: Perfil */}
              <div className="flex gap-md items-start w-full md:w-auto">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => navigate(ROUTES.students)} 
                  aria-label="Voltar para lista de alunos"
                  className="shrink-0"
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                
                <Avatar className="h-20 w-20 md:h-24 md:w-24 ring-4 ring-primary/20 ring-offset-4 ring-offset-background transition-transform duration-300 hover:scale-105 cursor-pointer shrink-0">
                  <StudentAvatarImage avatarUrl={student.avatar_url} className="object-cover" />
                  <AvatarFallback className="text-2xl md:text-3xl font-bold">
                    {student.name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                
                <div className="space-y-sm flex-1 min-w-0">
                  <div>
                    <h1 className="text-2xl md:text-3xl font-bold mb-xs break-words leading-tight">{student.name}</h1>
                    <div className="flex items-center gap-xs text-sm text-muted-foreground flex-wrap">
                      <Calendar className="h-4 w-4 shrink-0" />
                      <span>{age} anos</span>
                    </div>
                  </div>
                  
                  {/* Badges Row com stagger animation */}
                  <div className="flex flex-wrap gap-xs">
                    {student.fitness_level && (
                      <Badge 
                        variant="secondary" 
                        className="gap-xs animate-fade-in"
                        style={{ animationDelay: '0ms' }}
                      >
                        <TrendingUp className="h-3 w-3" />
                        {student.fitness_level}
                      </Badge>
                    )}
                    {ouraConnection?.is_active && (
                      <Badge 
                        variant="default" 
                        className="gap-xs animate-fade-in shimmer-border"
                        style={{ animationDelay: '100ms' }}
                      >
                        <Activity className="h-3 w-3 animate-pulse" />
                        Oura Conectado
                      </Badge>
                    )}
                    {student.objectives?.slice(0, 2).map((obj, index) => (
                      <Badge 
                        key={obj}
                        variant="outline" 
                        className="gap-xs animate-fade-in"
                        style={{ animationDelay: `${(index + 2) * 100}ms` }}
                      >
                        {getObjectiveLabel(obj)}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
              
              {/* Coluna 2: Ações */}
              <div className="flex flex-col sm:flex-row gap-sm w-full md:w-auto">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button 
                        onClick={() => navigate(ROUTES.studentReports(id!))} 
                        className="gap-2 w-full sm:w-auto"
                        variant="outline"
                        aria-label="Ver Relatórios"
                      >
                        <FileText className="h-4 w-4" />
                        Relatórios
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Visualizar e gerar relatórios periódicos de evolução</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button 
                        onClick={() => setRecordSessionOpen(true)} 
                       className="gap-2 w-full sm:w-auto"
                        variant="default"
                        aria-label={NAV_LABELS.recordSession}
                      >
                        <Mic className="h-4 w-4" />
                        {NAV_LABELS.recordSession}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Grave uma sessão de treino usando sua voz</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Alerta de Dados Incompletos - Detalhado */}
      {hasIncompleteData && (
        <Alert className="border-warning/30 bg-warning/5">
          <AlertCircle className="h-5 w-5 text-warning" />
          <AlertDescription className="text-foreground">
            <span className="font-semibold block mb-1">Dados incompletos detectados</span>
            <span className="text-sm text-muted-foreground">
              Complete os seguintes campos para melhor análise: <strong className="text-foreground">{missingFields.join(', ')}</strong>
            </span>
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList
          aria-label="Seções do perfil do aluno"
          className="flex h-auto w-full justify-start gap-1 overflow-x-auto p-1 sm:grid sm:grid-cols-3 lg:grid-cols-6"
        >
          <TabsTrigger className="min-h-11 min-w-max px-4" value="training">
            {NAV_LABELS.tabTraining}
          </TabsTrigger>
          <TabsTrigger className="min-h-11 min-w-max px-4" value="overview">
            {NAV_LABELS.tabOverview}
          </TabsTrigger>
          <TabsTrigger className="min-h-11 min-w-max px-4" value="sessions">
            {NAV_LABELS.tabSessions}
          </TabsTrigger>
          <TabsTrigger className="min-h-11 min-w-max px-4" value="exercises">
            {NAV_LABELS.tabExercises}
          </TabsTrigger>
          <TabsTrigger className="min-h-11 min-w-max px-4" value="prescriptions">
            {NAV_LABELS.tabPrescriptions}
          </TabsTrigger>
          <TabsTrigger className="min-h-11 min-w-max px-4" value="oura">
            {NAV_LABELS.tabOura}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="training" className="space-y-6 animate-fade-in">
          <PersonalizedTrainingDashboard
            latestMetrics={latestOuraMetrics}
            recentMetrics={ouraMetrics || []}
            studentName={student.name}
            studentId={student.id}
            onStartTraining={() => setRecordSessionOpen(true)}
          />
        </TabsContent>

        <TabsContent value="overview" className="space-y-6 animate-fade-in">
          <StudentOverviewDashboard
            student={student}
            sessions={sessions || []}
            assignments={assignments || []}
            latestOuraMetrics={latestOuraMetrics}
            ouraConnection={ouraConnection}
            onNavigateToOura={() => {
              const ouraTab = document.querySelector('[value="oura"]') as HTMLElement;
              if (ouraTab) ouraTab.click();
            }}
          />
        </TabsContent>

        <TabsContent value="sessions" className="space-y-4 animate-fade-in">
          {/* Filtros de tipo de sessão */}
          <Card className="p-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Filtrar por tipo:</span>
              </div>
              <div className="flex gap-2">
                <Button
                  variant={sessionTypeFilter === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSessionTypeFilter('all')}
                  className="gap-1.5"
                >
                  Todas
                  {sessions && (
                    <Badge variant={sessionTypeFilter === 'all' ? 'secondary' : 'outline'} className="ml-1">
                      {sessions.length}
                    </Badge>
                  )}
                </Button>
                <Button
                  variant={sessionTypeFilter === 'individual' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSessionTypeFilter('individual')}
                  className="gap-1.5"
                >
                  <User className="h-3.5 w-3.5" />
                  Individual
                  {sessions && (
                    <Badge variant={sessionTypeFilter === 'individual' ? 'secondary' : 'outline'} className="ml-1">
                      {sessions.filter(s => s.session_type === 'individual').length}
                    </Badge>
                  )}
                </Button>
                <Button
                  variant={sessionTypeFilter === 'group' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSessionTypeFilter('group')}
                  className="gap-1.5"
                >
                  <Users className="h-3.5 w-3.5" />
                  Grupo
                  {sessions && (
                    <Badge variant={sessionTypeFilter === 'group' ? 'secondary' : 'outline'} className="ml-1">
                      {sessions.filter(s => s.session_type === 'group').length}
                    </Badge>
                  )}
                </Button>
              </div>
            </div>
          </Card>

          {loadingSessions ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-32" />
              ))}
            </div>
          ) : sessions && sessions.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {sessions
                .filter(session => {
                  if (sessionTypeFilter === 'all') return true;
                  return session.session_type === sessionTypeFilter;
                })
                .map((session) => {
                const totalVolume = session.exercises?.reduce((sum, ex) => {
                  const volume = ex.reps && ex.load_kg 
                    ? ex.reps * ex.load_kg 
                    : 0;
                  return sum + volume;
                }, 0) || 0;

                return (
                  <WorkoutCard
                    key={session.id}
                    sessionId={session.id}
                    name={session.workout_name || `Treino - ${formatSessionTime(session.time)}`}
                    exercises={session.exercises?.length || 0}
                    date={session.date}
                    sessionType={session.session_type as 'individual' | 'group'}
                    totalVolume={totalVolume}
                    isFinalized={session.is_finalized}
                    canReopen={session.can_reopen}
                    onEdit={() => setEditingSessionId(session.id)}
                    onReopen={() => {
                      reopenSession.mutate(session.id, {
                        onSuccess: () => {
                          setSessionToReopen(session.id);
                          setRecordSessionOpen(true);
                        }
                      });
                    }}
                    onFinalize={() => finalizeSession.mutate(session.id)}
                    onClick={() => {
                      logger.log("CLICOU NO CARD - Session ID:", session.id, "Session:", session);
                      setSelectedSessionId(session.id);
                    }}
                  />
                );
              })}
            </div>
          ) : sessionTypeFilter !== 'all' ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 space-y-4">
                <div className="rounded-full bg-muted p-4">
                  <Calendar className="h-12 w-12 text-muted-foreground" />
                </div>
                <div className="text-center space-y-2">
                  <h3 className="text-lg font-semibold">
                    Nenhuma sessão {sessionTypeFilter === 'individual' ? 'individual' : 'em grupo'} encontrada
                  </h3>
                  <p className="text-muted-foreground text-sm max-w-md">
                    Não há sessões {sessionTypeFilter === 'individual' ? 'individuais' : 'em grupo'} registradas para este período
                  </p>
                </div>
                <Button 
                  variant="outline"
                  onClick={() => setSessionTypeFilter('all')}
                  className="gap-2 mt-4"
                >
                  Ver todas as sessões
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 space-y-4">
                <div className="rounded-full bg-primary/10 p-4">
                  <Calendar className="h-12 w-12 text-primary" />
                </div>
                <div className="text-center space-y-2">
                  <h3 className="text-lg font-semibold">Nenhuma sessão registrada</h3>
                  <p className="text-muted-foreground text-sm max-w-md">
                    Comece registrando a primeira sessão de treino de {student.name}
                  </p>
                </div>
                <Button 
                  onClick={() => setRecordSessionOpen(true)}
                  variant="default"
                  className="gap-2 mt-4"
                >
                  <Mic className="h-4 w-4" />
                  Registrar Primeira Sessão
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="exercises" className="space-y-4 animate-fade-in">
          <div className="mb-4">
            <h3 className="text-lg font-semibold mb-2">Selecione um exercício para ver o histórico:</h3>
            <div className="flex flex-wrap gap-2">
              {uniqueExercises.map((exercise) => (
                <Button
                  key={exercise}
                  variant={selectedExercise === exercise ? "default" : "outline"}
                  onClick={() => setSelectedExercise(exercise)}
                >
                  {exercise}
                </Button>
              ))}
            </div>
          </div>

          {selectedExercise ? (
            <ExerciseHistoryCard studentId={id!} exerciseName={selectedExercise} />
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <TrendingUp className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Selecione um exercício acima para ver o histórico</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="prescriptions" className="space-y-4 animate-fade-in">
          {loadingAssignments ? (
            <Skeleton className="h-32" />
          ) : assignments && assignments.length > 0 ? (
            <div className="grid gap-4">
              {assignments.map((assignment) => (
                <Card key={assignment.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle>{assignment.prescription?.name}</CardTitle>
                        {assignment.prescription?.objective && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {assignment.prescription.objective}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">
                          {formatSessionDate(assignment.start_date)}
                        </Badge>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              aria-label="Excluir atribuição"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                              <AlertDialogDescription>
                                Tem certeza que deseja excluir esta atribuição de prescrição? Esta ação não pode ser desfeita.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteAssignment.mutate(assignment.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Excluir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {assignment.custom_adaptations && (
                      <div className="mb-2">
                        <span className="font-semibold text-sm">Adaptações:</span>
                        <p className="text-sm text-muted-foreground">
                          {JSON.stringify(assignment.custom_adaptations)}
                        </p>
                      </div>
                    )}
                    {assignment.end_date && (
                      <div className="text-sm text-muted-foreground">
                        Término: {formatSessionDate(assignment.end_date)}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Nenhuma prescrição atribuída</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="oura" className="space-y-6 animate-fade-in">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-bold">Métricas do Oura Ring</h3>
              <p className="text-muted-foreground">Dados completos de recuperação, atividade e sono</p>
            </div>
            <ManualProtocolRecommendationDialog studentId={id!} />
          </div>

          <OuraConnectionCard studentId={id!} studentName={student?.name} />
          
          {/* Status de conexão discreto apenas para alunos */}
          {!isAdmin && (
            <OuraConnectionStatus 
              studentId={id!} 
              hasConnection={!!ouraConnection} 
            />
          )}
          
          {/* Diagnóstico técnico apenas para admins */}
          {isAdmin && (
            <OuraApiDiagnosticsCard studentId={id!} />
          )}

          {loadingOuraMetrics ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardContent className="p-6 space-y-4">
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-20 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : ouraMetrics && ouraMetrics.length > 0 ? (
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="grid w-full grid-cols-6">
                <TabsTrigger value="overview">Resumo Oura</TabsTrigger>
                <TabsTrigger value="activity">Atividade</TabsTrigger>
                <TabsTrigger value="sleep">Sono</TabsTrigger>
                <TabsTrigger value="stress">Estresse</TabsTrigger>
                <TabsTrigger value="workouts">Treinos</TabsTrigger>
                <TabsTrigger value="advanced">Avançado</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4 mt-6 animate-fade-in">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {ouraMetrics.slice(0, 7).map((metrics) => (
                    <OuraMetricsCard key={metrics.id} metrics={metrics} />
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="activity" className="space-y-4 mt-6 animate-fade-in">
                {ouraMetrics[0] && <OuraActivityCard metrics={ouraMetrics[0]} />}
                {ouraMetrics.length > 1 && (
                  <div className="mt-4">
                    <h4 className="text-lg font-semibold mb-4">Histórico de Atividade</h4>
                    <div className="grid gap-4 md:grid-cols-2">
                      {ouraMetrics.slice(1, 7).map((metrics) => (
                        <OuraActivityCard key={metrics.id} metrics={metrics} />
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="sleep" className="space-y-4 mt-6 animate-fade-in">
                {ouraMetrics[0] && <OuraSleepDetailCard metrics={ouraMetrics[0]} />}
                {ouraMetrics.length > 1 && (
                  <div className="mt-4">
                    <h4 className="text-lg font-semibold mb-4">Histórico de Sono</h4>
                    <div className="grid gap-4 md:grid-cols-2">
                      {ouraMetrics.slice(1, 7).map((metrics) => (
                        <OuraSleepDetailCard key={metrics.id} metrics={metrics} />
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="stress" className="space-y-4 mt-6 animate-fade-in">
                {ouraMetrics[0] && <OuraStressCard metrics={ouraMetrics[0]} />}
                {ouraMetrics.length > 1 && (
                  <div className="mt-4">
                    <h4 className="text-lg font-semibold mb-4">Histórico de Estresse</h4>
                    <div className="grid gap-4 md:grid-cols-2">
                      {ouraMetrics.slice(1, 7).map((metrics) => (
                        <OuraStressCard key={metrics.id} metrics={metrics} />
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="workouts" className="space-y-4 mt-6 animate-fade-in">
                <OuraWorkoutsCard studentId={id!} limit={20} />
              </TabsContent>

              <TabsContent value="advanced" className="space-y-4 mt-6 animate-fade-in">
                {ouraMetrics[0] && <OuraAdvancedMetricsCard metrics={ouraMetrics[0]} />}
                {ouraMetrics.length > 1 && (
                  <div className="mt-4">
                    <h4 className="text-lg font-semibold mb-4">Histórico de Métricas Avançadas</h4>
                    <div className="grid gap-4 md:grid-cols-2">
                      {ouraMetrics.slice(1, 7).map((metrics) => (
                        <OuraAdvancedMetricsCard key={metrics.id} metrics={metrics} />
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Activity className="h-12 w-12 text-muted-foreground mb-4" />
                {ouraConnection ? (
                  <>
                    <Alert className="mb-4">
                      <Info className="h-4 w-4" />
                      <AlertDescription>
                        Oura Ring conectado, mas ainda não há dados disponíveis.
                        Os dados são processados pelo Oura após você acordar e sincronizar seu anel.
                        Use o botão "Sincronizar" acima para buscar novos dados.
                      </AlertDescription>
                    </Alert>
                  </>
                ) : (
                  <>
                    <p className="text-muted-foreground">Nenhuma métrica do Oura Ring disponível</p>
                    <p className="text-sm text-muted-foreground mt-2">
                      Conecte o Oura Ring do aluno para visualizar dados de recuperação
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <RecordIndividualSessionDialog
        open={recordSessionOpen}
        onOpenChange={(open) => {
          setRecordSessionOpen(open);
          if (!open) setSessionToReopen(null);
        }}
        studentId={id!}
        studentName={student.name}
        existingSessionId={sessionToReopen}
      />

      <EditSessionDialog
        open={!!editingSessionId}
        onOpenChange={(open) => !open && setEditingSessionId(null)}
        sessionId={editingSessionId}
        onSuccess={() => {
          // Não fazer reload - as queries são invalidadas automaticamente
          setEditingSessionId(null);
        }}
        onReopenForRecording={(sessionId) => {
          setEditingSessionId(null);
          setSessionToReopen(sessionId);
          setRecordSessionOpen(true);
        }}
      />

      <SessionDetailDialog
        sessionId={selectedSessionId}
        open={!!selectedSessionId}
        onOpenChange={(open) => {
          logger.log("DIALOG ONCHANGE - open:", open, "selectedSessionId:", selectedSessionId);
          if (!open) setSelectedSessionId(null);
        }}
        onReopenSession={(sessionId) => {
          reopenSession.mutate(sessionId, {
            onSuccess: () => {
              setSessionToReopen(sessionId);
              setRecordSessionOpen(true);
            }
          });
        }}
        onEditSession={(sessionId) => {
          setSelectedSessionId(null);
          setEditingSessionId(sessionId);
        }}
      />

      <EditStudentDialog
        student={student}
        open={editStudentOpen}
        onOpenChange={setEditStudentOpen}
      />
    </PageLayout>
  );
};

export default StudentDetailPage;
