import { useState, useEffect, useMemo, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreatePrescription } from "@/hooks/usePrescriptions";
import { useExercisesLibrary } from "@/hooks/useExercisesLibrary";
import { usePrescriptionDraft } from "@/hooks/usePrescriptionDraft";
import { Plus, Save, History, Trash2, Folder } from "lucide-react";
import { useFolders, flattenFolderTree } from "@/hooks/useFolders";
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

interface CreatePrescriptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreatePrescriptionDialog({ open, onOpenChange }: CreatePrescriptionDialogProps) {
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
  const draftRestoredRef = useRef(false);

  const { data: exercisesLibrary } = useExercisesLibrary();
  const createPrescription = useCreatePrescription();
  const { draft, saveDraft, clearDraft, restoreDraft, isSaving, lastSaved } = usePrescriptionDraft();
  // Destination folder. null = root (no folder). Not persisted in the draft.
  const [folderId, setFolderId] = useState<string | null>(null);
  const { data: folders } = useFolders();
  const flatFolders = useMemo(
    () => (folders ? flattenFolderTree(folders) : []),
    [folders],
  );

  // Carregar rascunho ao abrir dialog — apenas uma vez por abertura
  useEffect(() => {
    if (open && draft && !draftRestoredRef.current) {
      setName(draft.name);
      setObjective(draft.objective);
      setExercises(draft.exercises.map((ex: Partial<Exercise>) => ({ ...ex, load: ex.load || "", rir: ex.rir || "" }) as Exercise));
      draftRestoredRef.current = true;
    }
    if (!open) {
      draftRestoredRef.current = false;
    }
  }, [open, draft]);

  // Auto-save quando dados mudarem
  useEffect(() => {
    if (open && (name || objective || exercises.some(ex => ex.exercise_library_id))) {
      saveDraft({ name, objective, exercises });
    }
  }, [name, objective, exercises, open, saveDraft]);

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

    const scrollToFirstEmpty = (updatedExercises: Exercise[]) => {
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
    // Validação de nome
    if (!name.trim()) {
      notify.error("Nome obrigatório", {
        description: "Por favor, informe o nome da prescrição antes de salvar."
      });
      return;
    }

    // Validação detalhada de exercícios e adaptações
    const validationErrors: string[] = [];
    
    exercises.forEach((ex, index) => {
      const exerciseName = exercisesLibrary?.find(e => e.id === ex.exercise_library_id)?.name || `Exercício ${index + 1}`;
      
      if (!ex.exercise_library_id) {
        validationErrors.push(`${exerciseName}: selecione um exercício`);
      } else if (!ex.sets) {
        validationErrors.push(`${exerciseName}: informe as séries`);
      } else if (!ex.reps) {
        validationErrors.push(`${exerciseName}: informe as repetições`);
      }
      
      // Validação de adaptações: se showAdaptations está ativo, todas as adaptações devem ter exercício selecionado
      if (ex.showAdaptations && ex.adaptations.length > 0) {
        ex.adaptations.forEach((adaptation, adaptIndex) => {
          if (!adaptation.exercise_library_id) {
            const adaptationLabel = adaptation.type === "regression_1" ? "Regressão 1" 
              : adaptation.type === "regression_2" ? "Regressão 2" 
              : "Regressão 3";
            validationErrors.push(`${exerciseName} - ${adaptationLabel}: selecione um exercício de adaptação`);
          }
        });
      }
    });

    if (validationErrors.length > 0) {
      notify.error("Campos incompletos", {
        description: `Corrija os seguintes campos:\n${validationErrors.slice(0, 3).join('\n')}${validationErrors.length > 3 ? `\n...e mais ${validationErrors.length - 3}` : ''}`
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
      await createPrescription.mutateAsync({
        name,
        objective,
        prescription_type: prescriptionType,
        folder_id: folderId,
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

      setName("");
      setObjective("");
      setFolderId(null);
      setExercises([
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
      onOpenChange(false);
    } catch (error: unknown) {
      notify.error("Erro ao criar prescrição", {
        description: buildErrorDescription(error) || "Ocorreu um erro inesperado. Tente novamente."
      });
    }
  };

  const handleClose = () => {
    const hasContent = name || objective || exercises.some(ex => ex.exercise_library_id);
    
    if (hasContent) {
      const confirmed = confirm(
        'Você tem dados não salvos. Seu rascunho foi salvo automaticamente. Deseja sair?'
      );
      if (!confirmed) return;
    }
    
    onOpenChange(false);
  };

  const handleRestoreDraft = (draftData: { timestamp: string; name: string; objective: string; exercises: Array<{ id: string; exercise_library_id: string; sets: string; reps: string; interval_seconds: string; pse: string; training_method: string; observations: string; group_with_previous: boolean; should_track: boolean; adaptations: Array<{ type: "regression_1" | "regression_2" | "regression_3"; exercise_library_id: string }>; showAdaptations: boolean }> }) => {
    setName(draftData.name);
    setObjective(draftData.objective);
    setExercises(draftData.exercises.map(ex => ({ ...ex, load: "", rir: "" })));
    restoreDraft(draftData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Criar Nova Prescrição</DialogTitle>
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

                <div className="space-y-sm">
                  <Label
                    htmlFor="create-prescription-folder"
                    className="flex items-center gap-1.5"
                  >
                    <Folder className="h-3.5 w-3.5" />
                    Pasta destino
                  </Label>
                  <Select
                    value={folderId ?? "root"}
                    onValueChange={(value) => setFolderId(value === "root" ? null : value)}
                  >
                    <SelectTrigger id="create-prescription-folder">
                      <SelectValue placeholder="Raiz (sem pasta)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="root">📁 Raiz (sem pasta)</SelectItem>
                      {flatFolders.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          <span style={{ paddingLeft: `${f.level * 12}px` }}>
                            {f.level > 0 && "└ "}
                            {f.full_path || f.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-sm">
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

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={createPrescription.isPending}>
            {createPrescription.isPending ? "Criando..." : "Criar Prescrição"}
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
