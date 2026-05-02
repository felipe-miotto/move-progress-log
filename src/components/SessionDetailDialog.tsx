import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StudentAvatarImage } from "@/components/StudentAvatarImage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSessionDetail } from "@/hooks/useSessionDetail";
import { useExercisesLibrary } from "@/hooks/useExercisesLibrary";
import { Calendar, Clock, Users, Dumbbell, TrendingUp, User, Award, Filter } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { LoadingState } from "./LoadingState";
import { ErrorState } from "./ErrorState";
import { useState, useMemo, useCallback } from "react";
import { formatSessionTime } from "@/utils/sessionTime";
import { formatSessionDate } from "@/utils/sessionDate";
import { calculateLoadFromBreakdown } from "@/utils/loadCalculation";
import { MOVEMENT_PATTERNS } from "@/constants/backToBasics";

interface SessionDetailDialogProps {
  sessionId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReopenSession?: (sessionId: string) => void;
  onEditSession?: (sessionId: string) => void;
}

interface SessionExercise {
  id: string;
  exercise_library_id: string | null;
  exercise_name: string;
  sets: number | null;
  reps: number | null;
  load_kg: number | null;
  load_description: string | null;
  load_breakdown: string | null;
  observations: string | null;
  is_best_set: boolean | null;
  exercise_library: {
    id: string;
    movement_pattern: string | null;
  } | null;
}

const resolveExerciseLoad = (exercise: SessionExercise): { kg: number | null; text: string | null } => {
  if (exercise.load_kg !== null && exercise.load_kg !== undefined) {
    return {
      kg: exercise.load_kg,
      text: exercise.load_breakdown || exercise.load_description || null,
    };
  }

  const textCandidates = [
    exercise.load_breakdown?.trim(),
    exercise.load_description?.trim(),
    exercise.observations?.trim(),
  ].filter((value): value is string => Boolean(value));

  for (const candidate of textCandidates) {
    const parsed = calculateLoadFromBreakdown(candidate);
    if (parsed !== null) {
      return { kg: parsed, text: candidate };
    }
  }

  return { kg: null, text: textCandidates[0] || null };
};

const UNCLASSIFIED_PATTERN = "__unclassified";

const normalizeComparableText = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, " ");

const formatMovementPatternLabel = (pattern: string): string =>
  MOVEMENT_PATTERNS[pattern as keyof typeof MOVEMENT_PATTERNS] || pattern;

export const SessionDetailDialog = ({ 
  sessionId, 
  open, 
  onOpenChange,
  onReopenSession,
  onEditSession,
}: SessionDetailDialogProps) => {
  const navigate = useNavigate();
  const { data: session, isLoading, error } = useSessionDetail(sessionId);
  const { data: exercisesLibrary } = useExercisesLibrary();
  
  const [movementPatternFilter, setMovementPatternFilter] = useState<string>("all");
  const [intensityFilter, setIntensityFilter] = useState<string>("all");

  const exercisePatternByName = useMemo(() => {
    const map = new Map<string, string>();
    exercisesLibrary?.forEach((exercise) => {
      if (!exercise.name || !exercise.movement_pattern) return;
      map.set(normalizeComparableText(exercise.name), exercise.movement_pattern);
    });
    return map;
  }, [exercisesLibrary]);

  const getExerciseMovementPattern = useCallback(
    (exercise: SessionExercise): string | null =>
      exercise.exercise_library?.movement_pattern ||
      exercisePatternByName.get(normalizeComparableText(exercise.exercise_name)) ||
      null,
    [exercisePatternByName]
  );

  const handleGoToStudent = () => {
    if (session?.student.id) {
      onOpenChange(false);
      navigate(`/alunos/${session.student.id}`);
    }
  };

  const handleReopen = () => {
    if (sessionId && onReopenSession) {
      onReopenSession(sessionId);
      onOpenChange(false);
    }
  };

  const handleEdit = () => {
    if (sessionId && onEditSession) {
      onEditSession(sessionId);
      onOpenChange(false);
    }
  };

  const calculateTotalVolume = (): number => {
    if (!session?.exercises) return 0;
    return session.exercises.reduce((total, exercise) => {
      const load = resolveExerciseLoad(exercise).kg || 0;
      const sets = exercise.sets || 0;
      const reps = exercise.reps || 0;
      return total + (load * sets * reps);
    }, 0);
  };

  const getIntensityBadge = (volume: number) => {
    if (volume > 5000) return { label: "Alta", variant: "destructive" as const };
    if (volume > 2000) return { label: "Moderada", variant: "default" as const };
    return { label: "Leve", variant: "secondary" as const };
  };

  const getExerciseIntensity = (exercise: SessionExercise): string => {
    const volume = (resolveExerciseLoad(exercise).kg || 0) * (exercise.sets || 0) * (exercise.reps || 0);
    if (volume > 500) return "alta";
    if (volume > 200) return "moderada";
    return "leve";
  };

  const filteredExercises = useMemo(() => {
    if (!session?.exercises) return [];
    
    let filtered = [...session.exercises];

    if (movementPatternFilter !== "all") {
      filtered = filtered.filter(ex => {
        const pattern = getExerciseMovementPattern(ex);
        if (movementPatternFilter === UNCLASSIFIED_PATTERN) return !pattern;
        return pattern === movementPatternFilter;
      });
    }

    if (intensityFilter !== "all") {
      filtered = filtered.filter(ex => getExerciseIntensity(ex) === intensityFilter);
    }

    return filtered;
  }, [session?.exercises, movementPatternFilter, intensityFilter, getExerciseMovementPattern]);

  const movementPatterns = useMemo(() => {
    if (!session?.exercises) return [];
    const patterns = new Set<string>();
    session.exercises.forEach(ex => {
      const pattern = getExerciseMovementPattern(ex);
      if (pattern) patterns.add(pattern);
    });
    return Array.from(patterns);
  }, [session?.exercises, getExerciseMovementPattern]);

  const hasUnclassifiedExercises = useMemo(() => {
    if (!session?.exercises || !exercisesLibrary) return false;
    return session.exercises.some((exercise) => !getExerciseMovementPattern(exercise));
  }, [session?.exercises, exercisesLibrary, getExerciseMovementPattern]);

  const renderExerciseNameCell = (exercise: SessionExercise) => {
    const pattern = getExerciseMovementPattern(exercise);

    return (
      <div className="flex items-center gap-2">
        <div className="min-w-0">
          <p>{exercise.exercise_name}</p>
          <p className="mt-0.5 text-xs font-normal text-muted-foreground">
            {pattern
              ? formatMovementPatternLabel(pattern)
              : exercisesLibrary
              ? "Sem padrão cadastrado"
              : "Carregando padrão..."}
          </p>
        </div>
        {exercise.is_best_set && (
          <Badge variant="secondary" className="text-xs">
            Best Set
          </Badge>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        {isLoading && (
          <div className="py-8">
            <LoadingState text="Carregando detalhes da sessão..." />
          </div>
        )}

        {error && (
          <div className="py-8">
            <ErrorState 
              title="Erro ao carregar sessão"
              description="Não foi possível carregar os detalhes desta sessão."
            />
          </div>
        )}

        {!isLoading && !error && !session && (
          <div className="py-8">
            <ErrorState
              title="Sessão não encontrada"
              description="Não foi possível encontrar os dados desta sessão. Tente novamente ou recarregue a página."
            />
          </div>
        )}

        {session && (
          <>
            <DialogHeader>
              <div className="flex items-start gap-4">
                <Avatar className="h-16 w-16">
                  <StudentAvatarImage avatarUrl={session.student.avatar_url} />
                  <AvatarFallback className="bg-primary/10 text-primary text-lg">
                    {session.student.name.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <DialogTitle className="text-2xl mb-2">
                    Sessão de {session.student.name}
                  </DialogTitle>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={session.session_type === "individual" ? "default" : "secondary"}>
                      {session.session_type === "individual" ? "Individual" : "Grupo"}
                    </Badge>
                    <Badge variant={session.is_finalized ? "outline" : "default"}>
                      {session.is_finalized ? "Finalizada" : "Em andamento"}
                    </Badge>
                  </div>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-6 mt-6">
              {/* Informações Contextuais */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    Informações da Sessão
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Data</p>
                      <p className="font-medium">
                        {formatSessionDate(session.date)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Horário</p>
                      <p className="font-medium">{formatSessionTime(session.time)}</p>
                    </div>
                  </div>
                  {session.trainer_name && (
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Treinador</p>
                        <p className="font-medium">{session.trainer_name}</p>
                      </div>
                    </div>
                  )}
                  {session.room_name && (
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Sala</p>
                        <p className="font-medium">{session.room_name}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Métricas Agregadas */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="p-3 rounded-md bg-primary/10">
                        <Dumbbell className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Total de Exercícios</p>
                        <p className="text-2xl font-bold">{session.exercises.length}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="p-3 rounded-md bg-secondary/10">
                        <TrendingUp className="h-6 w-6 text-secondary" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Volume Total</p>
                        <p className="text-2xl font-bold">{calculateTotalVolume().toFixed(0)} kg</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="p-3 rounded-md bg-accent/10">
                        <Award className="h-6 w-6 text-accent" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Intensidade</p>
                        <Badge {...getIntensityBadge(calculateTotalVolume())} className="mt-1">
                          {getIntensityBadge(calculateTotalVolume()).label}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Lista de Exercícios */}
              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Filter className="h-5 w-5" />
                      Exercícios Realizados
                    </CardTitle>
                    <div className="grid grid-cols-1 gap-2 sm:flex sm:items-center">
                      <Select value={movementPatternFilter} onValueChange={setMovementPatternFilter}>
                        <SelectTrigger className="w-full sm:w-[180px]">
                          <SelectValue placeholder="Padrão de movimento" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos os padrões</SelectItem>
                          {movementPatterns.map((pattern) => (
                            <SelectItem key={pattern} value={pattern}>
                              {formatMovementPatternLabel(pattern)}
                            </SelectItem>
                          ))}
                          {hasUnclassifiedExercises && (
                            <SelectItem value={UNCLASSIFIED_PATTERN}>Sem padrão</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      <Select value={intensityFilter} onValueChange={setIntensityFilter}>
                        <SelectTrigger className="w-full sm:w-[150px]">
                          <SelectValue placeholder="Intensidade" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todas</SelectItem>
                          <SelectItem value="alta">Alta</SelectItem>
                          <SelectItem value="moderada">Moderada</SelectItem>
                          <SelectItem value="leve">Leve</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {filteredExercises.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">
                      {session.exercises.length === 0 
                        ? "Nenhum exercício registrado nesta sessão."
                        : "Nenhum exercício corresponde aos filtros selecionados."}
                    </p>
                  ) : (
                    <>
                      <div className="space-y-3 lg:hidden">
                        {filteredExercises.map((exercise) => {
                          const pattern = getExerciseMovementPattern(exercise);
                          const resolvedLoad = resolveExerciseLoad(exercise);
                          const intensity = getExerciseIntensity(exercise);

                          return (
                            <div key={exercise.id} className="rounded-lg border bg-muted/20 p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="font-semibold leading-tight">{exercise.exercise_name}</p>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {pattern
                                      ? formatMovementPatternLabel(pattern)
                                      : exercisesLibrary
                                      ? "Sem padrão cadastrado"
                                      : "Carregando padrão..."}
                                  </p>
                                </div>
                                <div className="flex shrink-0 flex-col items-end gap-2">
                                  {exercise.is_best_set && (
                                    <Badge variant="secondary" className="text-xs">
                                      Best Set
                                    </Badge>
                                  )}
                                  <Badge
                                    variant={
                                      intensity === "alta"
                                        ? "destructive"
                                        : intensity === "moderada"
                                        ? "default"
                                        : "secondary"
                                    }
                                    className="capitalize"
                                  >
                                    {intensity}
                                  </Badge>
                                </div>
                              </div>

                              <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                                <div className="rounded-md bg-background/70 p-3">
                                  <p className="text-xs text-muted-foreground">Séries</p>
                                  <p className="mt-1 font-semibold">{exercise.sets || "-"}</p>
                                </div>
                                <div className="rounded-md bg-background/70 p-3">
                                  <p className="text-xs text-muted-foreground">Reps</p>
                                  <p className="mt-1 font-semibold">{exercise.reps || "-"}</p>
                                </div>
                                <div className="rounded-md bg-background/70 p-3">
                                  <p className="text-xs text-muted-foreground">Carga</p>
                                  <p className="mt-1 font-semibold">
                                    {resolvedLoad.kg !== null
                                      ? `${resolvedLoad.kg} kg`
                                      : resolvedLoad.text || "-"}
                                  </p>
                                </div>
                              </div>

                              {resolvedLoad.kg !== null && resolvedLoad.text && (
                                <p className="mt-3 text-xs text-muted-foreground">{resolvedLoad.text}</p>
                              )}

                              {exercise.observations && (
                                <div className="mt-3 rounded-md bg-background/70 p-3">
                                  <p className="text-xs text-muted-foreground">Observações</p>
                                  <p className="mt-1 text-sm">{exercise.observations}</p>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <div className="hidden overflow-x-auto lg:block">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Exercício</TableHead>
                              <TableHead className="text-center">Séries</TableHead>
                              <TableHead className="text-center">Reps</TableHead>
                              <TableHead className="text-center">Carga</TableHead>
                              <TableHead className="text-center">Intensidade</TableHead>
                              <TableHead>Observações</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredExercises.map((exercise) => (
                              <TableRow key={exercise.id}>
                                <TableCell className="font-medium">
                                  {renderExerciseNameCell(exercise)}
                                </TableCell>
                                <TableCell className="text-center">
                                  {exercise.sets || "-"}
                                </TableCell>
                                <TableCell className="text-center">
                                  {exercise.reps || "-"}
                                </TableCell>
                                <TableCell className="text-center">
                                  <div>
                                    {(() => {
                                      const resolvedLoad = resolveExerciseLoad(exercise);
                                      return (
                                        <>
                                          <p className="font-medium">
                                            {resolvedLoad.kg !== null
                                              ? `${resolvedLoad.kg} kg`
                                              : resolvedLoad.text || "-"}
                                          </p>
                                          {resolvedLoad.kg !== null && resolvedLoad.text && (
                                            <p className="text-xs text-muted-foreground">
                                              {resolvedLoad.text}
                                            </p>
                                          )}
                                        </>
                                      );
                                    })()}
                                  </div>
                                </TableCell>
                                <TableCell className="text-center">
                                  <Badge
                                    variant={
                                      getExerciseIntensity(exercise) === "alta" ? "destructive" :
                                      getExerciseIntensity(exercise) === "moderada" ? "default" :
                                      "secondary"
                                    }
                                    className="capitalize"
                                  >
                                    {getExerciseIntensity(exercise)}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  {exercise.observations ? (
                                    <p className="text-sm text-muted-foreground max-w-xs truncate">
                                      {exercise.observations}
                                    </p>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2 mt-6">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
              <Button variant="secondary" onClick={handleGoToStudent}>
                Ver Perfil do Aluno
              </Button>
              {!session.is_finalized && onEditSession && (
                <Button variant="outline" onClick={handleEdit}>
                  Editar Sessão
                </Button>
              )}
              {session.is_finalized && session.can_reopen && onReopenSession && (
                <Button variant="default" onClick={handleReopen}>
                  Reabrir Sessão
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
