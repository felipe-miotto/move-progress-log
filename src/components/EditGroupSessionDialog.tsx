import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { notify } from "@/lib/notify";
import { Trash, Loader2, Mic, ChevronLeft, ChevronRight, BookOpen } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { buildErrorDescription } from "@/utils/errorParsing";
import { ExerciseSelectionDialog } from "./ExerciseSelectionDialog";

interface EditGroupSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prescriptionId: string | null;
  date: string;
  time: string;
  onSuccess?: () => void;
  onReopenForRecording?: (prescriptionId: string, date: string, time: string) => void;
}

interface Student {
  id: string;
  name: string;
}

interface Exercise {
  id: string;
  exercise_library_id: string | null;
  exercise_name: string;
  sets: number;
  reps: number;
  // Reserva — texto livre por design (ex.: 0, 2-3, RM, 4+).
  // Persistido em `public.exercises.reserve_reps`.
  reserve_reps: string | null;
  load_kg: number | null;
  load_breakdown: string;
  observations: string | null;
  is_best_set: boolean;
}

interface SessionData {
  sessionId: string;
  studentId: string;
  studentName: string;
  exercises: Exercise[];
}

export function EditGroupSessionDialog({
  open,
  onOpenChange,
  prescriptionId,
  date,
  time,
  onSuccess,
  onReopenForRecording,
}: EditGroupSessionDialogProps) {
  const [loading, setLoading] = useState(false);
  const [sessionsData, setSessionsData] = useState<SessionData[]>([]);
  const [currentStudentIndex, setCurrentStudentIndex] = useState(0);
  const [editableExercises, setEditableExercises] = useState<Exercise[]>([]);
  const [exerciseSelectionTarget, setExerciseSelectionTarget] = useState<{
    index: number;
    currentName: string;
  } | null>(null);

  const loadSessionsData = useCallback(async () => {
    if (!prescriptionId || !date || !time) return;

    setLoading(true);
    try {
      // Buscar todas as sessões do grupo (mesma prescrição, data e hora)
      const { data: sessions, error: sessionsError } = await supabase
        .from('workout_sessions')
        .select('id, student_id, students!inner(name)')
        .eq('prescription_id', prescriptionId)
        .eq('date', date)
        .eq('time', time)
        .order('students(name)', { ascending: true });

      if (sessionsError) throw sessionsError;

      if (!sessions || sessions.length === 0) {
        notify.warning("Nenhuma sessão encontrada", {
          description: "Não foram encontradas sessões para editar neste grupo.",
        });
        onOpenChange(false);
        return;
      }

      const sessionIds = sessions.map((session: { id: string }) => session.id);
      const { data: allExercises, error: exercisesError } = await supabase
        .from('exercises')
        .select(`
          id,
          session_id,
          exercise_library_id,
          exercise_name,
          sets,
          reps,
          reserve_reps,
          load_kg,
          load_breakdown,
          observations,
          is_best_set
        `)
        .in('session_id', sessionIds)
        .order('created_at', { ascending: true });

      if (exercisesError) throw exercisesError;

      const exercisesBySession = (allExercises || []).reduce<Record<string, Exercise[]>>((acc, exercise) => {
        const sessionKey = String(exercise.session_id || "");
        if (!sessionKey) return acc;
        if (!acc[sessionKey]) acc[sessionKey] = [];
        acc[sessionKey].push({
          id: exercise.id,
          exercise_library_id: exercise.exercise_library_id,
          exercise_name: exercise.exercise_name,
          sets: exercise.sets ?? 0,
          reps: exercise.reps ?? 0,
          // Preserva valor salvo (não inferir).
          reserve_reps: (exercise as { reserve_reps?: string | null }).reserve_reps ?? null,
          load_kg: exercise.load_kg,
          load_breakdown: exercise.load_breakdown ?? "",
          observations: exercise.observations,
          is_best_set: exercise.is_best_set ?? false,
        });
        return acc;
      }, {});

      const sessionsWithExercises = sessions.map((session: { id: string; student_id: string; students: { name: string } }) => ({
        sessionId: session.id,
        studentId: session.student_id,
        studentName: session.students.name,
        exercises: exercisesBySession[session.id] || [],
      }));

      setSessionsData(sessionsWithExercises);
      setCurrentStudentIndex(0);
    } catch (error: unknown) {
      notify.error("Erro ao carregar sessões", {
        description: buildErrorDescription(error) || "Erro desconhecido",
      });
    } finally {
      setLoading(false);
    }
  }, [date, onOpenChange, prescriptionId, time]);

  useEffect(() => {
    if (open && prescriptionId && date && time) {
      loadSessionsData();
    }
  }, [open, prescriptionId, date, time, loadSessionsData]);

  useEffect(() => {
    if (sessionsData.length > 0 && currentStudentIndex < sessionsData.length) {
      setEditableExercises([...sessionsData[currentStudentIndex].exercises]);
    }
  }, [currentStudentIndex, sessionsData]);

  const updateExercise = (index: number, field: keyof Exercise, value: Exercise[keyof Exercise]) => {
    const updated = [...editableExercises];
    updated[index] = { ...updated[index], [field]: value };
    setEditableExercises(updated);
  };

  const removeExercise = (index: number) => {
    setEditableExercises(editableExercises.filter((_, i) => i !== index));
  };

  const openExerciseSelection = (index: number) => {
    const exercise = editableExercises[index];
    if (!exercise) return;

    setExerciseSelectionTarget({
      index,
      currentName: exercise.exercise_name,
    });
  };

  const handleExerciseSelected = (exerciseId: string, exerciseName: string) => {
    if (!exerciseSelectionTarget) return;

    const updated = [...editableExercises];
    updated[exerciseSelectionTarget.index] = {
      ...updated[exerciseSelectionTarget.index],
      exercise_library_id: exerciseId,
      exercise_name: exerciseName,
    };

    setEditableExercises(updated);
    setExerciseSelectionTarget(null);
  };

  const handleSaveCurrentStudent = async () => {
    if (sessionsData.length === 0) return;

    const currentSession = sessionsData[currentStudentIndex];
    const unlinkedExercise = editableExercises.find((exercise) => !exercise.exercise_library_id);
    if (unlinkedExercise) {
      notify.error("Vincule todos os exercícios ao catálogo", {
        description: `Selecione um exercício cadastrado para "${unlinkedExercise.exercise_name}".`,
      });
      return;
    }
    
    setLoading(true);
    try {
      // Deletar exercícios removidos
      const currentExerciseIds = editableExercises.map(ex => ex.id).filter(Boolean);
      
      if (currentExerciseIds.length > 0) {
        const { error: deleteError } = await supabase
          .from('exercises')
          .delete()
          .eq('session_id', currentSession.sessionId)
          .not('id', 'in', `(${currentExerciseIds.join(',')})`);

        if (deleteError && deleteError.code !== 'PGRST116') throw deleteError;
      } else {
        // Se não há exercícios com ID, deletar todos
        const { error: deleteError } = await supabase
          .from('exercises')
          .delete()
          .eq('session_id', currentSession.sessionId);

        if (deleteError) throw deleteError;
      }

      // Atualizar exercícios existentes e inserir novos
      for (const exercise of editableExercises) {
        if (exercise.id) {
          // Atualizar existente
          const { error } = await supabase
            .from('exercises')
            .update({
              exercise_library_id: exercise.exercise_library_id,
              exercise_name: exercise.exercise_name,
              sets: exercise.sets,
              reps: exercise.reps,
              // Preserva Reserva no update — sem isso, edição zerava o campo.
              reserve_reps: exercise.reserve_reps ?? null,
              load_kg: exercise.load_kg,
              load_breakdown: exercise.load_breakdown,
              observations: exercise.observations,
              is_best_set: exercise.is_best_set,
            })
            .eq('id', exercise.id);

          if (error) throw error;
        } else {
          // Inserir novo
          const { error } = await supabase
            .from('exercises')
            .insert({
              session_id: currentSession.sessionId,
              exercise_library_id: exercise.exercise_library_id,
              exercise_name: exercise.exercise_name,
              sets: exercise.sets,
              reps: exercise.reps,
              reserve_reps: exercise.reserve_reps ?? null,
              load_kg: exercise.load_kg,
              load_breakdown: exercise.load_breakdown,
              observations: exercise.observations,
              is_best_set: exercise.is_best_set,
            });

          if (error) throw error;
        }
      }

      // Atualizar os dados da sessão no estado
      const updatedSessionsData = [...sessionsData];
      updatedSessionsData[currentStudentIndex].exercises = editableExercises;
      setSessionsData(updatedSessionsData);

      notify.success("Alterações salvas", {
        description: `Sessão de ${currentSession.studentName} atualizada.`,
      });

      // Se for o último aluno, fechar o diálogo
      if (currentStudentIndex === sessionsData.length - 1) {
        onSuccess?.();
        onOpenChange(false);
      } else {
        // Avançar para o próximo aluno
        setCurrentStudentIndex(prev => prev + 1);
      }
    } catch (error: unknown) {
      notify.error("Erro ao salvar alterações", {
        description: buildErrorDescription(error) || "Erro desconhecido",
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePrevious = () => {
    if (currentStudentIndex > 0) {
      setCurrentStudentIndex(prev => prev - 1);
    }
  };

  const handleNext = () => {
    if (currentStudentIndex < sessionsData.length - 1) {
      setCurrentStudentIndex(prev => prev + 1);
    }
  };

  const currentStudent = sessionsData[currentStudentIndex];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Editar Sessão em Grupo</DialogTitle>
          {sessionsData.length > 0 && (
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="outline">
                Aluno {currentStudentIndex + 1} de {sessionsData.length}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {currentStudent?.studentName}
              </span>
            </div>
          )}
        </DialogHeader>

        {loading && sessionsData.length === 0 ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : currentStudent ? (
          <ScrollArea className="max-h-[calc(90vh-250px)] pr-4">
            <div className="space-y-4">
              <Label className="text-base">Exercícios ({editableExercises.length})</Label>
              {editableExercises.map((exercise, idx) => (
                <Card key={exercise.id || idx}>
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
              ))}
            </div>
          </ScrollArea>
        ) : null}

        <DialogFooter className="gap-2">
          <div className="flex items-center justify-between w-full">
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handlePrevious}
                disabled={currentStudentIndex === 0 || loading}
              >
                <ChevronLeft className="h-4 w-4 mr-2" />
                Anterior
              </Button>
              <Button
                variant="outline"
                onClick={handleNext}
                disabled={currentStudentIndex === sessionsData.length - 1 || loading}
              >
                Próximo
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </div>

            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              {onReopenForRecording && prescriptionId && (
                <Button
                  variant="outline"
                  onClick={() => {
                    onReopenForRecording(prescriptionId, date, time);
                    onOpenChange(false);
                  }}
                  disabled={loading}
                >
                  <Mic className="h-4 w-4 mr-2" />
                  Adicionar Gravações
                </Button>
              )}
              <Button onClick={handleSaveCurrentStudent} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : currentStudentIndex === sessionsData.length - 1 ? (
                  "Salvar e Concluir"
                ) : (
                  "Salvar e Avançar"
                )}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>

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
