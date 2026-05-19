import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StudentAvatarImage } from "@/components/StudentAvatarImage";
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
import { supabase } from "@/integrations/supabase/client";
import { notify } from "@/lib/notify";
import { Trash, Loader2, Mic, BookOpen } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQueryClient } from "@tanstack/react-query";
import { formatSessionTime } from "@/utils/sessionTime";
import { formatSessionDate } from "@/utils/sessionDate";
import { buildErrorDescription } from "@/utils/errorParsing";
import { invalidateSessionQueries } from "@/hooks/sessionQueryInvalidation";
import { ExerciseSelectionDialog } from "./ExerciseSelectionDialog";

interface EditSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string | null;
  onSuccess?: () => void;
  onReopenForRecording?: (sessionId: string) => void;
}

interface Exercise {
  id: string;
  exercise_library_id: string | null;
  exercise_name: string;
  sets: number;
  reps: number;
  // Reserva (repetições em reserva) — texto livre por design (ex.: 0, 2-3, RM, 4+).
  // Persistido em `public.exercises.reserve_reps`. Não substitui `reps`.
  reserve_reps: string | null;
  load_kg: number | null;
  load_breakdown: string;
  observations: string | null;
  is_best_set: boolean;
}

interface SessionData {
  id: string;
  date: string;
  time: string;
  session_type: string;
  workout_name: string | null;
  trainer_name: string | null;
  room_name: string | null;
  is_finalized: boolean;
  student: {
    id: string;
    name: string;
    avatar_url: string | null;
  } | null;
}

export function EditSessionDialog({
  open,
  onOpenChange,
  sessionId,
  onSuccess,
  onReopenForRecording,
}: EditSessionDialogProps) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [showFinalizeConfirm, setShowFinalizeConfirm] = useState(false);
  const [exerciseSelectionTarget, setExerciseSelectionTarget] = useState<{
    index: number;
    currentName: string;
  } | null>(null);

  const loadSessionData = useCallback(async () => {
    if (!sessionId) return;

    setLoading(true);
    try {
      const { data: session, error: sessionError } = await supabase
        .from('workout_sessions')
        .select(`
          id,
          date,
          time,
          session_type,
          workout_name,
          trainer_name,
          room_name,
          is_finalized,
          student:students!student_id (
            id,
            name,
            avatar_url
          )
        `)
        .eq('id', sessionId)
        .single();

      if (sessionError) throw sessionError;

      const { data: exercisesData, error: exercisesError } = await supabase
        .from('exercises')
        .select('id, exercise_library_id, exercise_name, sets, reps, reserve_reps, load_kg, load_breakdown, observations, is_best_set')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (exercisesError) throw exercisesError;

      setSessionData(session);
      setExercises(exercisesData || []);
    } catch (error: unknown) {
      notify.error("Erro ao carregar sessão", {
        description: buildErrorDescription(error) || "Erro desconhecido",
      });
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (open && sessionId) {
      loadSessionData();
    }
  }, [open, sessionId, loadSessionData]);

  const updateExercise = (index: number, field: keyof Exercise, value: string | number | boolean | null) => {
    const updated = [...exercises];
    updated[index] = { ...updated[index], [field]: value };
    setExercises(updated);
  };

  const removeExercise = (index: number) => {
    setExercises(exercises.filter((_, i) => i !== index));
  };

  const openExerciseSelection = (index: number) => {
    const exercise = exercises[index];
    if (!exercise) return;

    setExerciseSelectionTarget({
      index,
      currentName: exercise.exercise_name,
    });
  };

  const handleExerciseSelected = (exerciseId: string, exerciseName: string) => {
    if (!exerciseSelectionTarget) return;

    const updated = [...exercises];
    updated[exerciseSelectionTarget.index] = {
      ...updated[exerciseSelectionTarget.index],
      exercise_library_id: exerciseId,
      exercise_name: exerciseName,
    };

    setExercises(updated);
    setExerciseSelectionTarget(null);
  };

  const invalidateAllSessionQueries = () => {
    void invalidateSessionQueries(queryClient, {
      includeStudentsData: true,
      studentId: sessionData?.student?.id ?? undefined,
    });
  };

  const deleteRemovedExercises = async (currentIds: string[]) => {
    if (currentIds.length > 0) {
      // Usar formato correto para o operador NOT IN
      const { error } = await supabase
        .from('exercises')
        .delete()
        .eq('session_id', sessionId!)
        .not('id', 'in', `(${currentIds.join(',')})`);

      if (error && error.code !== 'PGRST116') throw error;
    } else {
      // Se não há exercícios para manter, deletar todos da sessão
      const { error } = await supabase
        .from('exercises')
        .delete()
        .eq('session_id', sessionId!);

      if (error) throw error;
    }
  };

  const updateExistingExercises = async () => {
    for (const exercise of exercises) {
      if (!exercise.id) continue;
      
      const { error } = await supabase
        .from('exercises')
        .update({
          exercise_library_id: exercise.exercise_library_id,
          exercise_name: exercise.exercise_name,
          sets: exercise.sets,
          reps: exercise.reps,
          // Preserva `reserve_reps` no update — sem isso, reabrir uma
          // sessão e salvar zerava silenciosamente a Reserva.
          reserve_reps: exercise.reserve_reps ?? null,
          load_kg: exercise.load_kg,
          load_breakdown: exercise.load_breakdown,
          observations: exercise.observations,
          is_best_set: exercise.is_best_set,
        })
        .eq('id', exercise.id);

      if (error) throw error;
    }
  };

  const handleSave = async (finalize: boolean = false) => {
    if (!sessionId) return;

    const unlinkedExercise = exercises.find(exercise => !exercise.exercise_library_id);
    if (unlinkedExercise) {
      notify.error("Vincule todos os exercícios ao catálogo", {
        description: `Selecione um exercício cadastrado para "${unlinkedExercise.exercise_name}".`,
      });
      return;
    }

    setLoading(true);
    try {
      const currentExerciseIds = exercises.map(ex => ex.id).filter(Boolean);
      
      await deleteRemovedExercises(currentExerciseIds);
      await updateExistingExercises();

      if (finalize) {
        const { error: updateError } = await supabase
          .from('workout_sessions')
          .update({ 
            is_finalized: true,
            updated_at: new Date().toISOString()
          })
          .eq('id', sessionId);

        if (updateError) throw updateError;
      }

      invalidateAllSessionQueries();

      notify.success(finalize ? "Sessão finalizada" : "Sessão atualizada", {
        description: finalize 
          ? "A sessão foi salva e finalizada com sucesso."
          : "As alterações foram salvas com sucesso.",
      });

      onSuccess?.();
      onOpenChange(false);
    } catch (error: unknown) {
      notify.error("Erro ao salvar alterações", {
        description: buildErrorDescription(error) || "Erro desconhecido",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFinalizeClick = () => {
    setShowFinalizeConfirm(true);
  };

  const handleConfirmFinalize = () => {
    setShowFinalizeConfirm(false);
    handleSave(true);
  };

  const studentName = sessionData?.student?.name || 'Aluno';

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          {loading && !exercises.length ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : sessionData ? (
            <>
              <DialogHeader>
                <div className="flex items-start gap-4">
                  <Avatar className="h-16 w-16">
                    <StudentAvatarImage avatarUrl={sessionData.student?.avatar_url} />
                    <AvatarFallback className="bg-primary/10 text-primary text-lg">
                      {sessionData.student?.name?.substring(0, 2).toUpperCase() || "??"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <DialogTitle className="text-2xl mb-2">
                      Editar Sessão de {studentName}
                    </DialogTitle>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={sessionData.session_type === "individual" ? "default" : "secondary"}>
                        {sessionData.session_type === "individual" ? "Individual" : "Grupo"}
                      </Badge>
                      <Badge variant={sessionData.is_finalized ? "outline" : "default"}>
                        {sessionData.is_finalized ? "Finalizada" : "Em edição"}
                      </Badge>
                    </div>
                  </div>
                </div>
              </DialogHeader>

              <ScrollArea className="max-h-[calc(90vh-200px)] pr-4 mt-6">
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Informações da Sessão</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="font-semibold">Data:</span>{" "}
                          {formatSessionDate(sessionData.date)}
                        </div>
                        <div>
                          <span className="font-semibold">Horário:</span> {formatSessionTime(sessionData.time)}
                        </div>
                        {sessionData.workout_name && (
                          <div className="col-span-2">
                            <span className="font-semibold">Treino:</span> {sessionData.workout_name}
                          </div>
                        )}
                        {sessionData.trainer_name && (
                          <div className="col-span-2">
                            <span className="font-semibold">Treinador:</span> {sessionData.trainer_name}
                          </div>
                        )}
                        {sessionData.room_name && (
                          <div className="col-span-2">
                            <span className="font-semibold">Sala:</span> {sessionData.room_name}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  <div className="space-y-4">
                    <Label className="text-base">Exercícios ({exercises.length})</Label>
                    {exercises.map((exercise, idx) => {
                      const needsAttention = exercise.sets === 0 || exercise.reps === 0;
                      return (
                        <Card key={exercise.id} className={needsAttention ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/20' : ''}>
                          <CardHeader>
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-sm">Exercício {idx + 1}</CardTitle>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => removeExercise(idx)}
                                className="h-6 w-6 p-0 text-destructive"
                              >
                                <Trash className="h-3 w-3" />
                              </Button>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            {needsAttention && (
                              <div className="mb-3 text-sm text-amber-600 dark:text-amber-400 font-medium flex items-center gap-2">
                                ⚠️ Exercício não registrado no áudio - preencher manualmente
                              </div>
                            )}
                            <div className="space-y-2">
                              <Label className="text-xs">Nome do Exercício *</Label>
                              <div className="flex gap-2">
                                <Input
                                  value={exercise.exercise_name}
                                  readOnly
                                  placeholder="Selecione um exercício cadastrado"
                                  className={!exercise.exercise_library_id ? "border-destructive" : ""}
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  onClick={() => openExerciseSelection(idx)}
                                  aria-label="Substituir por exercício cadastrado"
                                  title="Substituir por exercício cadastrado"
                                >
                                  <BookOpen className="h-4 w-4" />
                                </Button>
                              </div>
                              {!exercise.exercise_library_id && (
                                <p className="text-xs text-destructive">
                                  Selecione um exercício cadastrado antes de salvar.
                                </p>
                              )}
                            </div>

                            <div className="grid gap-3 md:grid-cols-4">
                              <div className="space-y-2">
                                <Label className="text-xs">Séries</Label>
                                <Input
                                  type="number"
                                  value={exercise.sets}
                                  onChange={(e) => updateExercise(idx, 'sets', parseInt(e.target.value) || 0)}
                                  min="1"
                                />
                              </div>

                              <div className="space-y-2">
                                <Label className="text-xs">Reps</Label>
                                <Input
                                  type="number"
                                  value={exercise.reps}
                                  onChange={(e) => updateExercise(idx, 'reps', parseInt(e.target.value) || 0)}
                                  min="1"
                                />
                              </div>

                              <div className="space-y-2">
                                <Label className="text-xs">Carga (kg)</Label>
                                <Input
                                  type="number"
                                  step="0.1"
                                  value={exercise.load_kg || ''}
                                  onChange={(e) => updateExercise(idx, 'load_kg', parseFloat(e.target.value) || null)}
                                />
                              </div>

                              <div className="space-y-2">
                                <Label className="text-xs">Descrição Carga</Label>
                                <Input
                                  value={exercise.load_breakdown}
                                  onChange={(e) => updateExercise(idx, 'load_breakdown', e.target.value)}
                                  placeholder="Ex: 20kg"
                                />
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label className="text-xs">Observações</Label>
                              <Textarea
                                value={exercise.observations || ''}
                                onChange={(e) => updateExercise(idx, 'observations', e.target.value)}
                                placeholder="Observações sobre a execução..."
                                rows={2}
                              />
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              </ScrollArea>
            </>
          ) : (
            <DialogHeader>
              <DialogTitle>Editar Sessão</DialogTitle>
            </DialogHeader>
          )}

          <DialogFooter className="gap-2 flex-wrap">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            {onReopenForRecording && sessionId && (
              <Button
                variant="secondary"
                onClick={() => {
                  onReopenForRecording(sessionId);
                  onOpenChange(false);
                }}
                disabled={loading}
              >
                <Mic className="h-4 w-4 mr-2" />
                Adicionar Gravações
              </Button>
            )}
            <Button variant="outline" onClick={() => handleSave(false)} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Salvar Rascunho"
              )}
            </Button>
            {sessionData && !sessionData.is_finalized && (
              <Button onClick={handleFinalizeClick} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Finalizando...
                  </>
                ) : (
                  "Finalizar Sessão"
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showFinalizeConfirm} onOpenChange={setShowFinalizeConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finalizar sessão?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja finalizar esta sessão de <strong>{studentName}</strong>? 
              Após finalizar, você ainda poderá reabrir a sessão se necessário.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmFinalize}>
              Finalizar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ExerciseSelectionDialog
        open={!!exerciseSelectionTarget}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setExerciseSelectionTarget(null);
        }}
        currentExerciseName={exerciseSelectionTarget?.currentName || ""}
        onExerciseSelected={handleExerciseSelected}
        autoSuggest
      />
    </>
  );
}
