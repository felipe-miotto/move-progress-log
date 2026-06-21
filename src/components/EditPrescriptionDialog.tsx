import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUpdatePrescription, usePrescriptionDetails } from "@/hooks/usePrescriptions";
import { useExercisesLibrary } from "@/hooks/useExercisesLibrary";
import { usePrescriptionDraft, type PrescriptionDraft } from "@/hooks/usePrescriptionDraft";
import { Plus, Save, History, Trash2 } from "lucide-react";
import { PrescriptionDraftHistoryDialog } from "@/components/PrescriptionDraftHistoryDialog";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Separator } from "@/components/ui/separator";
import { TooltipProvider } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";
import { notify } from "@/lib/notify";
import { buildErrorDescription } from "@/utils/errorParsing";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { SortableExerciseItem } from "@/components/SortableExerciseItem";

interface Exercise {
  id: string;
  exercise_library_id: string;
  sets: string;
  reps: string;
  interval_seconds: string;
  pse: string;
  load: string;
  rir: string;
  training_method: string;
  observations: string;
  group_with_previous: boolean;
  should_track: boolean;
  adaptations: Array<{
    type: "regression_1" | "regression_2" | "regression_3";
    exercise_library_id: string;
  }>;
  showAdaptations: boolean;
}

interface EditPrescriptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prescriptionId: string | null;
}

export function EditPrescriptionDialog({ open, onOpenChange, prescriptionId }: EditPrescriptionDialogProps) {
  const [name, setName] = useState("");
  const [prescriptionType, setPrescriptionType] = useState<'group' | 'individual'>('group');
  const [objective, setObjective] = useState("");
  const [exercises, setExercises] = useState<Exercise[]>([
    {
      id: crypto.randomUUID(),
      exercise_library_id: "",
      sets: "",
      reps: "",
      interval_seconds: "",
      pse: "",
      load: "",
      rir: "",
      training_method: "",
      observations: "",
      group_with_previous: false,
      should_track: true,
      adaptations: [],
      showAdaptations: false,
    },
  ]);
  const [loadingRegressions, setLoadingRegressions] = useState<number | null>(null);
  const [focusedExerciseIndex, setFocusedExerciseIndex] = useState<number | null>(null);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  const draftRestoredRef = useRef(false);

  const { data: prescriptionData } = usePrescriptionDetails(prescriptionId);
  const { data: exercisesLibrary } = useExercisesLibrary();
  const updatePrescription = useUpdatePrescription();
  
  const editEntityId = prescriptionId ? `edit-${prescriptionId}` : 'edit';
  const { draft, saveDraft, clearDraft, restoreDraft, isSaving, lastSaved } = usePrescriptionDraft(editEntityId);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setExercises((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  // Load prescription data when dialog opens
  useEffect(() => {
    if (prescriptionData && open && !dataLoaded) {
      setName(prescriptionData.name);
      setPrescriptionType(
        prescriptionData.prescription_type === "individual" ? "individual" : "group"
      );
      setObjective(prescriptionData.objective || "");
      
      if (prescriptionData.exercises && prescriptionData.exercises.length > 0) {
        setExercises(
          prescriptionData.exercises.map((ex: { id?: string; exercise_library_id: string; sets: string; reps: string; interval_seconds?: number | null; pse?: string | null; load?: string | null; rir?: string | null; training_method?: string | null; observations?: string | null; group_with_previous?: boolean; should_track?: boolean; adaptations?: Array<{ adaptation_type: string; exercise_library_id: string }> }) => ({
            id: ex.id || crypto.randomUUID(),
            exercise_library_id: ex.exercise_library_id,
            sets: ex.sets,
            reps: ex.reps,
            interval_seconds: ex.interval_seconds?.toString() || "",
            pse: ex.pse || "",
            load: ex.load || "",
            rir: ex.rir || "",
            training_method: ex.training_method || "",
            observations: ex.observations || "",
            group_with_previous: ex.group_with_previous || false,
            should_track: ex.should_track ?? true,
            adaptations: (ex.adaptations || []).map((adapt: { adaptation_type: string; exercise_library_id: string }) => ({
              type: adapt.adaptation_type as "regression_1" | "regression_2" | "regression_3",
              exercise_library_id: adapt.exercise_library_id,
            })),
            showAdaptations: (ex.adaptations || []).length > 0,
          }))
        );
      }
      setDataLoaded(true);
    }
  }, [prescriptionData, open, dataLoaded]);

  // Carregar rascunho após dados originais (sobrescreve se houver) — apenas uma vez
  useEffect(() => {
    if (open && dataLoaded && draft && !draftRestoredRef.current) {
      setName(draft.name);
      setObjective(draft.objective);
      setExercises(draft.exercises.map((ex: Partial<Exercise>) => ({ ...ex, load: ex.load || "", rir: ex.rir || "" }) as Exercise));
      if (draft.prescriptionType === 'group' || draft.prescriptionType === 'individual') {
        setPrescriptionType(draft.prescriptionType);
      }
      draftRestoredRef.current = true;
    }
  }, [open, dataLoaded, draft]);

  // Resetar estado ao fechar
  useEffect(() => {
    if (!open) {
      setDataLoaded(false);
      draftRestoredRef.current = false;
    }
  }, [open]);

  // Auto-save quando dados mudarem
  useEffect(() => {
    if (open && dataLoaded && (name || objective || exercises.some(ex => ex.exercise_library_id))) {
      saveDraft({ name, objective, exercises, prescriptionType });
    }
  }, [name, objective, exercises, prescriptionType, open, dataLoaded, saveDraft]);

  // Proteção ao navegar
  useEffect(() => {
    if (!open) return;

    const handler = (e: BeforeUnloadEvent) => {
      if (name || objective || exercises.some(ex => ex.exercise_library_id)) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [open, name, objective, exercises]);

  const addExercise = (afterIndex?: number) => {
    const newExercise = {
      id: crypto.randomUUID(),
      exercise_library_id: "",
      sets: "",
      reps: "",
      interval_seconds: "",
      pse: "",
      load: "",
      rir: "",
      training_method: "",
      observations: "",
      group_with_previous: false,
      should_track: true,
      adaptations: [],
      showAdaptations: false,
    };

    const scrollToFirstEmpty = (updatedExercises: typeof exercises) => {
      setTimeout(() => {
        const emptyIndex = updatedExercises.findIndex(ex => !ex.exercise_library_id);
        if (emptyIndex === -1) return;
        setFocusedExerciseIndex(emptyIndex);
        const container = scrollContainerRef.current;
        if (container) {
          const items = container.querySelectorAll('[data-exercise-item]');
          const target = items[emptyIndex];
          target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 50);
    };

    if (afterIndex !== undefined && afterIndex >= 0) {
      const newExercises = [...exercises];
      newExercises.splice(afterIndex + 1, 0, newExercise);
      setExercises(newExercises);
      scrollToFirstEmpty(newExercises);
    } else {
      const newExercises = [...exercises, newExercise];
      setExercises(newExercises);
      scrollToFirstEmpty(newExercises);
    }
  };

  const removeExercise = (index: number) => {
    setExercises(exercises.filter((_, i) => i !== index));
  };

  const updateExercise = (index: number, field: keyof Exercise, value: Exercise[keyof Exercise]) => {
    const updated = [...exercises];
    updated[index] = { ...updated[index], [field]: value };
    setExercises(updated);
  };

  const toggleAdaptations = (index: number) => {
    updateExercise(index, "showAdaptations", !exercises[index].showAdaptations);
  };

  const addAdaptation = (exerciseIndex: number) => {
    const exercise = exercises[exerciseIndex];
    if (exercise.adaptations.length >= 3) return;

    const adaptationType =
      exercise.adaptations.length === 0
        ? "regression_1"
        : exercise.adaptations.length === 1
        ? "regression_2"
        : "regression_3";

    updateExercise(exerciseIndex, "adaptations", [
      ...exercise.adaptations,
      { type: adaptationType as "regression_1" | "regression_2" | "regression_3", exercise_library_id: "" },
    ]);
  };

  const removeAdaptation = (exerciseIndex: number, adaptIndex: number) => {
    const exercise = exercises[exerciseIndex];
    updateExercise(
      exerciseIndex,
      "adaptations",
      exercise.adaptations.filter((_, i) => i !== adaptIndex)
    );
  };

  const updateAdaptation = (
    exerciseIndex: number,
    adaptIndex: number,
    exerciseId: string
  ) => {
    const exercise = exercises[exerciseIndex];
    const updated = [...exercise.adaptations];
    updated[adaptIndex] = { ...updated[adaptIndex], exercise_library_id: exerciseId };
    updateExercise(exerciseIndex, "adaptations", updated);
  };

  const suggestRegressions = async (exerciseIndex: number) => {
    const exercise = exercises[exerciseIndex];
    if (!exercise.exercise_library_id || !exercisesLibrary) return;

    const selectedExercise = exercisesLibrary.find((ex) => ex.id === exercise.exercise_library_id);
    if (!selectedExercise) return;

    setLoadingRegressions(exerciseIndex);
    
    const loadingToastId = sonnerToast.loading("Gerando sugestões de regressões...", {
      description: "A IA está analisando o exercício e buscando alternativas adequadas."
    });

    try {
      const { data, error } = await supabase.functions.invoke("suggest-exercise-alternatives", {
        body: {
          exerciseId: selectedExercise.id,
          exerciseName: selectedExercise.name,
          movementPattern: selectedExercise.movement_pattern,
          movementPlane: selectedExercise.movement_plane,
          laterality: selectedExercise.laterality,
          functionalGroup: selectedExercise.functional_group,
          direction: 'regression',
          availableExercises: exercisesLibrary.map((ex) => ({
            id: ex.id,
            name: ex.name,
            movement_pattern: ex.movement_pattern,
            movement_plane: ex.movement_plane,
            laterality: ex.laterality,
            numeric_level: ex.numeric_level,
          })),
        },
      });

      if (error) throw error;

      const suggestions = data.regressions.map((r: { exercise_id: string }, i: number) => ({
        type: (i === 0 ? "regression_1" : i === 1 ? "regression_2" : "regression_3") as "regression_1" | "regression_2" | "regression_3",
        exercise_library_id: r.exercise_id,
      }));

      updateExercise(exerciseIndex, "adaptations", suggestions);
      updateExercise(exerciseIndex, "showAdaptations", true);

      sonnerToast.dismiss(loadingToastId);
      toast({
        title: "Regressões sugeridas com sucesso!",
        description: "A IA sugeriu 3 exercícios de regressão baseados no padrão de movimento.",
      });
    } catch (error: unknown) {
      sonnerToast.dismiss(loadingToastId);
      toast({
        title: "Erro ao sugerir regressões",
        description: buildErrorDescription(error) || "Tente novamente mais tarde.",
        variant: "destructive",
      });
    } finally {
      setLoadingRegressions(null);
    }
  };

  const handleSubmit = async () => {
    
    // Validação de ID da prescrição
    if (!prescriptionId) {
      notify.error("Erro interno", {
        description: "ID da prescrição não encontrado. Recarregue a página e tente novamente."
      });
      return;
    }

    // Validação de nome
    if (!name.trim()) {
      notify.error("Nome obrigatório", {
        description: "Por favor, informe o nome da prescrição antes de salvar."
      });
      return;
    }

    // Validação detalhada de exercícios
    const invalidExercises: string[] = [];
    
    exercises.forEach((ex, index) => {
      const exerciseName = exercisesLibrary?.find(e => e.id === ex.exercise_library_id)?.name || `Exercício ${index + 1}`;
      
      if (!ex.exercise_library_id) {
        invalidExercises.push(`${exerciseName}: selecione um exercício`);
      } else if (!ex.sets) {
        invalidExercises.push(`${exerciseName}: informe as séries`);
      } else if (!ex.reps) {
        invalidExercises.push(`${exerciseName}: informe as repetições`);
      }
    });

    if (invalidExercises.length > 0) {
      notify.error("Exercícios incompletos", {
        description: `Corrija os seguintes campos:\n${invalidExercises.slice(0, 3).join('\n')}${invalidExercises.length > 3 ? `\n...e mais ${invalidExercises.length - 3}` : ''}`
      });
      return;
    }

    // Validação de adaptações: se showAdaptations está ativo, todas as adaptações devem ter exercício selecionado
    const incompleteAdaptations: string[] = [];
    exercises.forEach((ex, index) => {
      if (ex.showAdaptations && ex.adaptations.length > 0) {
        const exerciseName = exercisesLibrary?.find(e => e.id === ex.exercise_library_id)?.name || `Exercício ${index + 1}`;
        const missingAdaptations = ex.adaptations.filter(a => !a.exercise_library_id);
        if (missingAdaptations.length > 0) {
          incompleteAdaptations.push(`${exerciseName}: ${missingAdaptations.length} adaptação(ões) sem exercício selecionado`);
        }
      }
    });

    if (incompleteAdaptations.length > 0) {
      notify.error("Adaptações incompletas", {
        description: `Selecione os exercícios para todas as adaptações ou desative-as:\n${incompleteAdaptations.slice(0, 3).join('\n')}${incompleteAdaptations.length > 3 ? `\n...e mais ${incompleteAdaptations.length - 3}` : ''}`
      });
      return;
    }

    const validExercises = exercises.filter((ex) => ex.exercise_library_id && ex.sets && ex.reps);

    if (validExercises.length === 0) {
      notify.error("Exercícios obrigatórios", {
        description: "Adicione pelo menos um exercício válido com nome, séries e repetições."
      });
      return;
    }

    try {
      await updatePrescription.mutateAsync({
        id: prescriptionId,
        name,
        objective,
        prescription_type: prescriptionType,
        exercises: validExercises.map((ex, index) => ({
          exercise_library_id: ex.exercise_library_id,
          sets: ex.sets,
          reps: ex.reps,
          interval_seconds: ex.interval_seconds ? parseInt(ex.interval_seconds) : undefined,
          pse: prescriptionType === 'group' ? (ex.pse || undefined) : undefined,
          load: prescriptionType === 'individual' ? (ex.load || undefined) : undefined,
          rir: prescriptionType === 'individual' ? (ex.rir || undefined) : undefined,
          training_method: ex.training_method || undefined,
          observations: ex.observations || undefined,
          group_with_previous: index > 0 ? ex.group_with_previous : false,
          should_track: ex.should_track ?? true,
          adaptations: ex.adaptations.filter((a) => a.exercise_library_id),
        })),
      });

      // Limpar rascunho após sucesso
      clearDraft();
      
      onOpenChange(false);
    } catch (error: unknown) {
      notify.error("Erro ao atualizar prescrição", {
        description: buildErrorDescription(error) || "Ocorreu um erro inesperado. Tente novamente."
      });
    }
  };

  const handleClose = () => {
    const hasContent = name || objective || exercises.some(ex => ex.exercise_library_id);
    
    if (hasContent) {
      const confirmed = confirm(
        'Você tem alterações não salvas. Seu rascunho foi salvo automaticamente. Deseja sair?'
      );
      if (!confirmed) return;
    }
    
    onOpenChange(false);
  };

  const handleRestoreDraft = (draftData: PrescriptionDraft) => {
    setName(draftData.name);
    setObjective(draftData.objective);
    setExercises(draftData.exercises.map(ex => ({ ...ex, load: ex.load ?? "", rir: ex.rir ?? "" }) as Exercise));
    if (draftData.prescriptionType === 'group' || draftData.prescriptionType === 'individual') {
      setPrescriptionType(draftData.prescriptionType);
    }
    restoreDraft(draftData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Editar Prescrição</DialogTitle>
            <div className="flex items-center gap-xs">
              {lastSaved && (
                <Badge variant="outline" className="gap-1">
                  <Save className="h-3 w-3" />
                  {formatDistanceToNow(lastSaved, { locale: ptBR, addSuffix: true })}
                </Badge>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setHistoryDialogOpen(true)}
                className="gap-2"
              >
                <History className="h-4 w-4" />
                Histórico
              </Button>
              {draft && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearDraft}
                  className="gap-2 text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                  Limpar
                </Button>
              )}
            </div>
          </div>
          {exercises.length > 0 && (
            <div className="flex items-center gap-xs pt-xs">
              <Badge variant="secondary" className="text-sm">
                {exercises.filter(ex => ex.should_track !== false).length} de {exercises.length} exercício(s) para registro
              </Badge>
              {exercises.filter(ex => ex.should_track !== false).length === 0 && (
                <Badge variant="destructive" className="text-xs">
                  Atenção: Nenhum exercício marcado para registro
                </Badge>
              )}
            </div>
          )}
        </DialogHeader>

        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto pr-md">
          <TooltipProvider>
            <div className="space-y-lg">
            <div className="space-y-md">
              <div className="space-y-sm">
                <Label htmlFor="name">Nome da Prescrição *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Treino 1 - Potência/Força"
                />
              </div>

              <div className="space-y-sm">
                <Label>Tipo de Prescrição</Label>
                <Select value={prescriptionType} onValueChange={(v) => setPrescriptionType(v as 'group' | 'individual')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="group">Grupo (PSE)</SelectItem>
                    <SelectItem value="individual">Individual (Carga)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="objective">Objetivo</Label>
                <Textarea
                  id="objective"
                  value={objective}
                  onChange={(e) => setObjective(e.target.value)}
                  placeholder="Ex: Desenvolvimento de potência e força com ênfase em membros inferiores"
                  rows={2}
                />
              </div>
            </div>

            <Separator />

            <div className="space-y-md">
              <div className="flex items-center justify-between sticky top-0 z-10 bg-background py-sm -mx-md px-md border-b border-border/50">
                <Label className="text-base">Exercícios</Label>
                <Button 
                  onClick={() => addExercise(focusedExerciseIndex ?? undefined)} 
                  variant="outline" 
                  size="sm" 
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Adicionar Exercício
                </Button>
              </div>


              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={exercises.map((ex) => ex.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {exercises.map((exercise, exerciseIndex) => (
                    <SortableExerciseItem
                      key={exercise.id}
                      exercise={exercise}
                      index={exerciseIndex}
                      total={exercises.length}
                      prescriptionType={prescriptionType}
                      exercisesLibrary={exercisesLibrary?.map((ex) => ({ id: ex.id, name: ex.name })) || []}
                      onUpdate={(field, value) => updateExercise(exerciseIndex, field, value)}
                      onRemove={() => removeExercise(exerciseIndex)}
                      onToggleAdaptations={() => toggleAdaptations(exerciseIndex)}
                      onAddAdaptation={() => addAdaptation(exerciseIndex)}
                      onRemoveAdaptation={(adaptIndex) => removeAdaptation(exerciseIndex, adaptIndex)}
                      onUpdateAdaptation={(adaptIndex, exerciseId) => updateAdaptation(exerciseIndex, adaptIndex, exerciseId)}
                      onSuggestRegressions={() => suggestRegressions(exerciseIndex)}
                      loadingRegressions={loadingRegressions === exerciseIndex}
                      onAddExerciseBelow={() => addExercise(exerciseIndex)}
                      onFocus={() => setFocusedExerciseIndex(exerciseIndex)}
                      isFocused={focusedExerciseIndex === exerciseIndex}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </div>
            </div>
          </TooltipProvider>
        </div>

        <DialogFooter className="mt-md">
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={updatePrescription.isPending}>
            {updatePrescription.isPending ? "Salvando..." : "Salvar Alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>

      <PrescriptionDraftHistoryDialog
        open={historyDialogOpen}
        onOpenChange={setHistoryDialogOpen}
        onRestoreDraft={handleRestoreDraft}
      />
    </Dialog>
  );
}
