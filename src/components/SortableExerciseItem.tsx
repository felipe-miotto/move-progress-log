import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TRAINING_METHODS } from "@/constants/trainingMethods";
import { GripVertical, Trash2, ChevronDown, ChevronUp, Sparkles, Plus } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ExerciseCombobox } from "@/components/ExerciseCombobox";

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

interface SortableExerciseItemProps {
  exercise: Exercise;
  index: number;
  total: number;
  prescriptionType?: 'group' | 'individual';
  exercisesLibrary: Array<{ id: string; name: string }>;
  onUpdate: (field: keyof Exercise, value: Exercise[keyof Exercise]) => void;
  onRemove: () => void;
  onToggleAdaptations: () => void;
  onAddAdaptation: () => void;
  onRemoveAdaptation: (adaptIndex: number) => void;
  onUpdateAdaptation: (adaptIndex: number, exerciseId: string) => void;
  onSuggestRegressions: () => void;
  loadingRegressions: boolean;
  onAddExerciseBelow?: () => void;
  onFocus?: () => void;
  isFocused?: boolean;
}

export function SortableExerciseItem({
  exercise,
  index,
  total,
  prescriptionType = 'group',
  exercisesLibrary,
  onUpdate,
  onRemove,
  onToggleAdaptations,
  onAddAdaptation,
  onRemoveAdaptation,
  onUpdateAdaptation,
  onSuggestRegressions,
  loadingRegressions,
  onAddExerciseBelow,
  onFocus,
  isFocused,
}: SortableExerciseItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: exercise.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-exercise-item
      className={`space-y-md p-lg border rounded-radius-lg bg-muted/30 transition-smooth ${
        isFocused ? 'ring-2 ring-primary shadow-premium' : ''
      }`}
      onClick={onFocus}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1">
          <button
            className="mt-1 cursor-grab active:cursor-grabbing touch-none"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-5 w-5 text-muted-foreground hover:text-foreground transition-colors" />
          </button>
          <div className="flex flex-col gap-3 flex-1">
            <span className="text-sm font-medium text-muted-foreground">
              Exercício {index + 1}
            </span>
            {index > 0 && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`group-${exercise.id}`}
                  checked={exercise.group_with_previous}
                  onCheckedChange={(checked) =>
                    onUpdate("group_with_previous", checked === true)
                  }
                />
                <Label
                  htmlFor={`group-${exercise.id}`}
                  className="text-sm font-normal cursor-pointer"
                >
                  Agrupar com exercício anterior
                </Label>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Checkbox
                id={`track-${exercise.id}`}
                checked={exercise.should_track}
                onCheckedChange={(checked) =>
                  onUpdate("should_track", checked === true)
                }
              />
              <Label
                htmlFor={`track-${exercise.id}`}
                className="text-sm font-normal cursor-pointer flex items-center gap-2"
              >
                Registrar desempenho deste exercício
                {!exercise.should_track && (
                  <Badge variant="outline" className="text-xs">
                    Apenas prescrito
                  </Badge>
                )}
              </Label>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {onAddExerciseBelow && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddExerciseBelow();
                  }}
                  className="h-9 w-9 p-0"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Adicionar exercício abaixo</p>
              </TooltipContent>
            </Tooltip>
          )}
          {total > 1 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove();
                  }}
                  className="h-9 w-9 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Excluir exercício</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Exercício *</Label>
          <ExerciseCombobox
            exercises={exercisesLibrary}
            value={exercise.exercise_library_id}
            onValueChange={(value) => onUpdate("exercise_library_id", value)}
            placeholder="Digite para buscar..."
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-2">
            <Label>Sets *</Label>
            <Input
              value={exercise.sets}
              onChange={(e) => onUpdate("sets", e.target.value)}
              placeholder="4"
            />
          </div>
          <div className="space-y-2">
            <Label>Reps *</Label>
            <Input
              value={exercise.reps}
              onChange={(e) => onUpdate("reps", e.target.value)}
              placeholder="10-8"
            />
          </div>
          <div className="space-y-2">
            <Label>Int (s)</Label>
            <Input
              type="number"
              value={exercise.interval_seconds}
              onChange={(e) => onUpdate("interval_seconds", e.target.value)}
              placeholder="60"
            />
          </div>
        </div>

        {prescriptionType === 'individual' ? (
          <>
            <div className="space-y-2">
              <Label>Carga</Label>
              <Input
                value={exercise.load}
                onChange={(e) => onUpdate("load", e.target.value)}
                placeholder="Ex: 20kg, Leve"
              />
            </div>
            <div className="space-y-2">
              <Label>RR</Label>
              <Input
                value={exercise.rir}
                onChange={(e) => onUpdate("rir", e.target.value)}
                placeholder="Ex: 2, 3"
              />
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <Label>PSE</Label>
            <Input
              value={exercise.pse}
              onChange={(e) => onUpdate("pse", e.target.value)}
              placeholder="Ex: 7, ~85%"
            />
          </div>
        )}

        <div className="space-y-2">
          <Label>Método</Label>
          <TooltipProvider>
            <Select
              value={exercise.training_method}
              onValueChange={(value) => onUpdate("training_method", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione método" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TRAINING_METHODS).map(([key, method]) => (
                  <Tooltip key={key}>
                    <TooltipTrigger asChild>
                      <SelectItem value={key}>{method.name}</SelectItem>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-sm">
                      <p className="font-semibold">{method.indication}</p>
                      <p className="text-xs mt-1">{method.description}</p>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </SelectContent>
            </Select>
          </TooltipProvider>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Observações</Label>
        <Textarea
          value={exercise.observations}
          onChange={(e) => onUpdate("observations", e.target.value)}
          placeholder="Controle da pelve, carga leve..."
          rows={2}
        />
      </div>

      <div className="space-y-2">
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onToggleAdaptations}
            className="gap-2 flex-1"
          >
            {exercise.showAdaptations ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
            Regressões ({exercise.adaptations.length}/3)
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={onSuggestRegressions}
                disabled={!exercise.exercise_library_id || loadingRegressions}
                className="gap-2"
              >
                <Sparkles className="h-4 w-4" />
                {loadingRegressions ? "..." : "IA"}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Sugerir regressões com IA</p>
            </TooltipContent>
          </Tooltip>
        </div>

        {exercise.showAdaptations && (
          <div className="space-y-2 pl-4 border-l-2">
            {exercise.adaptations.map((adaptation, adaptIndex) => (
              <div key={adaptIndex} className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground min-w-[100px]">
                  Regressão {adaptIndex + 1}
                </span>
                <ExerciseCombobox
                  exercises={exercisesLibrary}
                  value={adaptation.exercise_library_id}
                  onValueChange={(value) => onUpdateAdaptation(adaptIndex, value)}
                  placeholder="Digite para buscar..."
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemoveAdaptation(adaptIndex)}
                  className="h-9 w-9 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}

            {exercise.adaptations.length < 3 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onAddAdaptation}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Adicionar Regressão
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
