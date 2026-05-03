import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useSEOHead, SEO_PRESETS } from "@/hooks/useSEOHead";
import { useOpenGraph, FABRIK_OG_DEFAULTS } from "@/hooks/useOpenGraph";
import { getWebPageSchema, getBreadcrumbSchema } from "@/utils/structuredData";
import { PageLayout } from "@/components/PageLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StudentAvatarImage } from "@/components/StudentAvatarImage";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  ClipboardList, 
  Plus, 
  Filter, 
  X, 
  Calendar as CalendarIcon,
  Clock,
  Search,
  MoreVertical,
  Eye,
  Edit,
  RotateCcw,
  Users as UsersIcon,
  User as UserIcon,
  Dumbbell,
} from "lucide-react";
import { endOfWeek, format, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAllSessionsPaginated, SessionWithDetails } from "@/hooks/useAllSessions";
import { useStudents } from "@/hooks/useStudents";
import { usePrescriptions } from "@/hooks/usePrescriptions";
import { useReopenWorkoutSession } from "@/hooks/useWorkoutSessions";
import { SessionDetailDialog } from "@/components/SessionDetailDialog";
import { RecordGroupSessionDialog } from "@/components/RecordGroupSessionDialog";
import { EditSessionDialog } from "@/components/EditSessionDialog";
import EmptyState from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { NAV_LABELS } from "@/constants/navigation";
import { cn } from "@/lib/utils";
import { formatSessionTime } from "@/utils/sessionTime";
import { formatSessionDate } from "@/utils/sessionDate";
import { logger } from "@/utils/logger";

export default function SessionsPage() {
  usePageTitle(NAV_LABELS.sessions);
  useSEOHead(SEO_PRESETS.private);
  useOpenGraph({
    ...FABRIK_OG_DEFAULTS,
    title: `${NAV_LABELS.sessions} · Fabrik Performance`,
    description: NAV_LABELS.subtitleSessions,
    type: 'website',
    url: true,
  });

  const [searchParams, setSearchParams] = useSearchParams();

  // Filters state
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [selectedPrescriptionIds, setSelectedPrescriptionIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState<Date | undefined>(() => {
    if (searchParams.get("week") === "current") {
      return startOfWeek(new Date(), { locale: ptBR });
    }
    return undefined;
  });
  const [endDate, setEndDate] = useState<Date | undefined>(() => {
    if (searchParams.get("week") === "current") {
      return endOfWeek(new Date(), { locale: ptBR });
    }
    return undefined;
  });
  const [startTime, setStartTime] = useState<string>("");
  const [endTime, setEndTime] = useState<string>("");
  const [sessionType, setSessionType] = useState<"all" | "individual" | "group">("all");
  const [finalizedFilter, setFinalizedFilter] = useState<"all" | "editing" | "finalized">("all");
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Search states
  const [studentSearchTerm, setStudentSearchTerm] = useState("");
  const [prescriptionSearchTerm, setPrescriptionSearchTerm] = useState("");

  // Strip the ?week=current marker after consuming it so the user can clear
  // the date range normally and the URL stays clean.
  useEffect(() => {
    if (searchParams.get("week") === "current") {
      const next = new URLSearchParams(searchParams);
      next.delete("week");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Dialog states
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [studentSelectionOpen, setStudentSelectionOpen] = useState(false);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);

  // Data queries
  const { data: students } = useStudents();
  const { data: prescriptions } = usePrescriptions();
  const {
    data: sessionsPages,
    isLoading,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useAllSessionsPaginated({
    studentIds: selectedStudentIds.length > 0 ? selectedStudentIds : undefined,
    prescriptionIds: selectedPrescriptionIds.length > 0 ? selectedPrescriptionIds : undefined,
    startDate,
    endDate,
    startTime: startTime || undefined,
    endTime: endTime || undefined,
    sessionType,
    finalized:
      finalizedFilter === "all"
        ? undefined
        : finalizedFilter === "finalized",
  });
  const sessions = useMemo(
    () =>
      (sessionsPages?.pages ?? []).flatMap(
        (page) => page.sessions as SessionWithDetails[]
      ),
    [sessionsPages]
  );

  const reopenMutation = useReopenWorkoutSession();

  // Filter student list based on search
  const filteredStudents = useMemo(() => {
    if (!students) return [];
    if (!studentSearchTerm) return students;
    return students.filter(s => 
      s.name.toLowerCase().includes(studentSearchTerm.toLowerCase())
    );
  }, [students, studentSearchTerm]);

  // Filter prescription list based on search
  const filteredPrescriptions = useMemo(() => {
    if (!prescriptions) return [];
    if (!prescriptionSearchTerm) return prescriptions;
    return prescriptions.filter(p => 
      p.name.toLowerCase().includes(prescriptionSearchTerm.toLowerCase())
    );
  }, [prescriptions, prescriptionSearchTerm]);

  // Calculate total volume for a session
  const calculateTotalVolume = (session: SessionWithDetails) => {
    if (!session.exercises || session.exercises.length === 0) return 0;
    return session.exercises.reduce((sum, ex) => sum + (ex.load_kg || 0), 0);
  };

  // Clear all filters
  const handleClearFilters = () => {
    setSelectedStudentIds([]);
    setSelectedPrescriptionIds([]);
    setStartDate(undefined);
    setEndDate(undefined);
    setStartTime("");
    setEndTime("");
    setSessionType("all");
    setFinalizedFilter("all");
  };

  const applyTodayPreset = () => {
    const today = new Date();
    setStartDate(today);
    setEndDate(today);
  };

  const applyWeekPreset = () => {
    const today = new Date();
    setStartDate(startOfWeek(today, { locale: ptBR }));
    setEndDate(endOfWeek(today, { locale: ptBR }));
  };

  const formatDateKey = (date?: Date) =>
    date ? format(date, "yyyy-MM-dd") : "";

  const todayKey = format(new Date(), "yyyy-MM-dd");
  const weekStartKey = formatDateKey(startOfWeek(new Date(), { locale: ptBR }));
  const weekEndKey = formatDateKey(endOfWeek(new Date(), { locale: ptBR }));
  const startDateKey = formatDateKey(startDate);
  const endDateKey = formatDateKey(endDate);
  const isTodayPresetActive = startDateKey === todayKey && endDateKey === todayKey;
  const isWeekPresetActive = startDateKey === weekStartKey && endDateKey === weekEndKey;

  const hasActiveFilters = 
    selectedStudentIds.length > 0 ||
    selectedPrescriptionIds.length > 0 ||
    startDate ||
    endDate ||
    startTime ||
    endTime ||
    sessionType !== "all" ||
    finalizedFilter !== "all";

  const handleViewDetails = (sessionId: string) => {
    setSelectedSessionId(sessionId);
    setDetailDialogOpen(true);
  };

  const handleEditSession = (sessionId: string) => {
    setSelectedSessionId(sessionId);
    setEditDialogOpen(true);
  };

  const handleReopen = async (sessionId: string) => {
    try {
      await reopenMutation.mutateAsync(sessionId);
    } catch (error) {
      // Mutation onError already shows user-facing feedback.
      logger.warn("[SessionsPage] Failed to reopen session", error);
    }
  };

  if (isLoading) {
    return (
      <PageLayout>
        <LoadingState text="Carregando sessões..." />
      </PageLayout>
    );
  }

  if (error) {
    return (
      <PageLayout>
        <ErrorState 
          title="Erro ao carregar sessões" 
          description={error.message}
          onRetry={refetch}
        />
      </PageLayout>
    );
  }

  return (
    <PageLayout
      structuredData={[
        { data: getWebPageSchema(NAV_LABELS.sessions, NAV_LABELS.subtitleSessions), id: "webpage-schema" },
        { data: getBreadcrumbSchema([{ label: "Home", href: "/" }, { label: NAV_LABELS.sessions, href: "/sessoes" }]), id: "breadcrumb-schema" },
      ]}
    >
      <PageHeader
        title={NAV_LABELS.sessions}
        description={NAV_LABELS.subtitleSessions}
        breadcrumbs={[
          { label: NAV_LABELS.sessions },
        ]}
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="gap-xs">
                <Plus className="h-4 w-4" />
                {NAV_LABELS.recordSession}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setStudentSelectionOpen(true)}>
                <UserIcon className="h-4 w-4 mr-2" />
                Individual
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setGroupDialogOpen(true)}>
                <UsersIcon className="h-4 w-4 mr-2" />
                Grupo
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      <div className="space-y-lg">
        {/* Filters Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filtros
              {hasActiveFilters && (
                <Badge variant="secondary" className="ml-2">
                  {[
                    selectedStudentIds.length > 0 && `${selectedStudentIds.length} aluno(s)`,
                    selectedPrescriptionIds.length > 0 && `${selectedPrescriptionIds.length} prescrição(ões)`,
                    (startDate || endDate) && "data",
                    (startTime || endTime) && "horário",
                    sessionType !== "all" && "tipo",
                    finalizedFilter !== "all" && "status",
                  ].filter(Boolean).join(", ")}
                </Badge>
              )}
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFiltersOpen(!filtersOpen)}
            >
              {filtersOpen ? "Ocultar" : "Mostrar"}
            </Button>
          </CardHeader>

          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={isTodayPresetActive ? "default" : "outline"}
                size="sm"
                onClick={applyTodayPreset}
              >
                Hoje
              </Button>
              <Button
                type="button"
                variant={isWeekPresetActive ? "default" : "outline"}
                size="sm"
                onClick={applyWeekPreset}
              >
                Esta semana
              </Button>
              <Button
                type="button"
                variant={finalizedFilter === "editing" ? "default" : "outline"}
                size="sm"
                onClick={() => setFinalizedFilter("editing")}
              >
                Em edição
              </Button>
              <Button
                type="button"
                variant={sessionType === "individual" ? "default" : "outline"}
                size="sm"
                onClick={() => setSessionType("individual")}
              >
                Individual
              </Button>
              <Button
                type="button"
                variant={sessionType === "group" ? "default" : "outline"}
                size="sm"
                onClick={() => setSessionType("group")}
              >
                Grupo
              </Button>
              {hasActiveFilters && (
                <Button type="button" variant="ghost" size="sm" onClick={handleClearFilters}>
                  Limpar
                </Button>
              )}
            </div>
          </CardContent>

          {filtersOpen && (
            <CardContent className="space-y-md">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md">
                {/* Student Filter */}
                <div className="space-y-2">
                  <Label>Alunos (máx. 10)</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start">
                        <UsersIcon className="h-4 w-4 mr-2" />
                        {selectedStudentIds.length > 0 
                          ? `${selectedStudentIds.length} selecionado(s)`
                          : "Selecionar alunos"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80">
                      <div className="space-y-3">
                        <Input
                          placeholder="Buscar aluno..."
                          value={studentSearchTerm}
                          onChange={(e) => setStudentSearchTerm(e.target.value)}
                          className="mb-2"
                        />
                        <div className="max-h-64 overflow-y-auto space-y-2">
                          {filteredStudents?.map((student) => (
                            <div key={student.id} className="flex items-center space-x-2">
                              <Checkbox
                                id={`student-${student.id}`}
                                checked={selectedStudentIds.includes(student.id)}
                                disabled={!selectedStudentIds.includes(student.id) && selectedStudentIds.length >= 10}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setSelectedStudentIds([...selectedStudentIds, student.id]);
                                  } else {
                                    setSelectedStudentIds(selectedStudentIds.filter(id => id !== student.id));
                                  }
                                }}
                              />
                              <label
                                htmlFor={`student-${student.id}`}
                                className="text-sm cursor-pointer flex-1"
                              >
                                {student.name}
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Prescription Filter */}
                <div className="space-y-2">
                  <Label>Prescrições</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start">
                        <ClipboardList className="h-4 w-4 mr-2" />
                        {selectedPrescriptionIds.length > 0 
                          ? `${selectedPrescriptionIds.length} selecionada(s)`
                          : "Selecionar prescrições"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80">
                      <div className="space-y-3">
                        <Input
                          placeholder="Buscar prescrição..."
                          value={prescriptionSearchTerm}
                          onChange={(e) => setPrescriptionSearchTerm(e.target.value)}
                          className="mb-2"
                        />
                        <div className="max-h-64 overflow-y-auto space-y-2">
                          {filteredPrescriptions?.map((prescription) => (
                            <div key={prescription.id} className="flex items-center space-x-2">
                              <Checkbox
                                id={`prescription-${prescription.id}`}
                                checked={selectedPrescriptionIds.includes(prescription.id)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setSelectedPrescriptionIds([...selectedPrescriptionIds, prescription.id]);
                                  } else {
                                    setSelectedPrescriptionIds(selectedPrescriptionIds.filter(id => id !== prescription.id));
                                  }
                                }}
                              />
                              <label
                                htmlFor={`prescription-${prescription.id}`}
                                className="text-sm cursor-pointer flex-1"
                              >
                                {prescription.name}
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Session Type Filter */}
                <div className="space-y-2">
                  <Label>Tipo de Sessão</Label>
                  <RadioGroup value={sessionType} onValueChange={(v) => setSessionType(v as "all" | "individual" | "group")}>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="all" id="type-all" />
                      <Label htmlFor="type-all" className="cursor-pointer">Todas</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="individual" id="type-individual" />
                      <Label htmlFor="type-individual" className="cursor-pointer">Individual</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="group" id="type-group" />
                      <Label htmlFor="type-group" className="cursor-pointer">Grupo</Label>
                    </div>
                  </RadioGroup>
                </div>

                {/* Status Filter */}
                <div className="space-y-2">
                  <Label>Status</Label>
                  <RadioGroup
                    value={finalizedFilter}
                    onValueChange={(v) => setFinalizedFilter(v as "all" | "editing" | "finalized")}
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="all" id="status-all" />
                      <Label htmlFor="status-all" className="cursor-pointer">Todos</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="editing" id="status-editing" />
                      <Label htmlFor="status-editing" className="cursor-pointer">Em edição</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="finalized" id="status-finalized" />
                      <Label htmlFor="status-finalized" className="cursor-pointer">Finalizadas</Label>
                    </div>
                  </RadioGroup>
                </div>

                {/* Date Range */}
                <div className="space-y-2">
                  <Label>Data Início</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start">
                        <CalendarIcon className="h-4 w-4 mr-2" />
                        {startDate ? format(startDate, "dd/MM/yyyy", { locale: ptBR }) : "Selecionar"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={startDate}
                        onSelect={setStartDate}
                        locale={ptBR}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label>Data Fim</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start">
                        <CalendarIcon className="h-4 w-4 mr-2" />
                        {endDate ? format(endDate, "dd/MM/yyyy", { locale: ptBR }) : "Selecionar"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={endDate}
                        onSelect={setEndDate}
                        locale={ptBR}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Time Range */}
                <div className="space-y-2">
                  <Label>Horário Início</Label>
                  <Input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Horário Fim</Label>
                  <Input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-md border-t">
                <Button variant="outline" onClick={handleClearFilters} disabled={!hasActiveFilters}>
                  <X className="h-4 w-4 mr-2" />
                  Limpar Filtros
                </Button>
              </div>
            </CardContent>
          )}
        </Card>

        {/* Sessions Table */}
        <Card>
          <CardHeader>
            <CardTitle>
              {sessions.length} {sessions.length === 1 ? "sessão carregada" : "sessões carregadas"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {sessions.length === 0 ? (
              <EmptyState
                icon={<ClipboardList className="h-8 w-8 text-muted-foreground" />}
                title="Nenhuma sessão encontrada"
                description={hasActiveFilters 
                  ? "Tente ajustar os filtros para encontrar sessões."
                  : "Comece registrando a primeira sessão de treino."}
                primaryAction={{
                  label: "Registrar Sessão",
                  onClick: () => setGroupDialogOpen(true)
                }}
              />
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data/Hora</TableHead>
                      <TableHead>Aluno(s)</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sessions.map((session) => {
                      const totalVolume = calculateTotalVolume(session);
                      const exerciseCount = session.exercises?.length || 0;
                      
                      return (
                        <TableRow 
                          key={session.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => handleViewDetails(session.id)}
                        >
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                              {formatSessionDate(session.date)}
                              <Clock className="h-4 w-4 text-muted-foreground ml-2" />
                              {formatSessionTime(session.time)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Avatar className="h-8 w-8">
                                <StudentAvatarImage avatarUrl={session.student?.avatar_url} />
                                <AvatarFallback>
                                  {session.student?.name?.substring(0, 2).toUpperCase() || "??"}
                                </AvatarFallback>
                              </Avatar>
                              <span className="truncate max-w-[200px]">{session.student?.name}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={session.session_type === "individual" ? "secondary" : "default"}>
                              {session.session_type === "individual" ? (
                                <><UserIcon className="h-3 w-3 mr-1" /> Individual</>
                              ) : (
                                <><UsersIcon className="h-3 w-3 mr-1" /> Grupo</>
                              )}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {session.is_finalized ? (
                              <Badge variant="success">Finalizada</Badge>
                            ) : (
                              <Badge variant="warning">Em edição</Badge>
                            )}
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleViewDetails(session.id)}>
                                  <Eye className="h-4 w-4 mr-2" />
                                  Ver Detalhes
                                </DropdownMenuItem>
                                {!session.is_finalized && (
                                  <DropdownMenuItem onClick={() => handleEditSession(session.id)}>
                                    <Edit className="h-4 w-4 mr-2" />
                                    Editar Sessão
                                  </DropdownMenuItem>
                                )}
                                {session.is_finalized && session.can_reopen && (
                                  <DropdownMenuItem onClick={() => handleReopen(session.id)}>
                                    <RotateCcw className="h-4 w-4 mr-2" />
                                    Reabrir Sessão
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
            {hasNextPage && (
              <div className="mt-md flex justify-center">
                <Button
                  variant="outline"
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                >
                  {isFetchingNextPage ? "Carregando mais..." : "Carregar mais sessões"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialogs */}
      <SessionDetailDialog
        sessionId={selectedSessionId}
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        onReopenSession={() => {
          if (selectedSessionId) {
            handleReopen(selectedSessionId);
            setDetailDialogOpen(false);
          }
        }}
      />

      <EditSessionDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        sessionId={selectedSessionId}
        onSuccess={() => {
          setEditDialogOpen(false);
          refetch();
        }}
      />

      {/* Student Selection Dialog for Individual Sessions */}
      <Dialog open={studentSelectionOpen} onOpenChange={setStudentSelectionOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Selecionar Aluno</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Escolha um aluno para registrar a sessão individual. Para registrar sessões individuais, 
              navegue até a página do aluno específico.
            </p>
            <div className="max-h-96 overflow-y-auto space-y-2">
              {students?.map((student) => (
                <Button
                  key={student.id}
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => {
                    window.location.href = `/alunos/${student.id}`;
                  }}
                >
                  <Avatar className="h-8 w-8 mr-2">
                    <StudentAvatarImage avatarUrl={student.avatar_url} />
                    <AvatarFallback>
                      {student.name.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  {student.name}
                </Button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <RecordGroupSessionDialog
        open={groupDialogOpen}
        onOpenChange={setGroupDialogOpen}
      />
    </PageLayout>
  );
}
