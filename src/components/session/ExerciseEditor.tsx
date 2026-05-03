import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Plus, Trash } from "lucide-react";
import { SessionExercise } from "@/types/sessionRecording";
import { calculateLoadFromBreakdown } from "@/utils/loadCalculation";
import { notify } from "@/lib/notify";

interface ExerciseEditorProps {
  exercises: SessionExercise[];
  onExercisesChange: (exercises: SessionExercise[]) => void;
  onOpenExerciseSelection: (index: number) => void;
  /** If true, sets are required (e.g. free session without prescription) */
  requireSets?: boolean;
  /** Whether to auto-calculate load from breakdown on change */
  autoCalculateLoad?: boolean;
}

export function ExerciseEditor({
  exercises,
  onExercisesChange,
  onOpenExerciseSelection,
  requireSets = false,
  autoCalculateLoad = false,
}: ExerciseEditorProps) {
  const updateExercise = (index: number, updates: Partial<SessionExercise>) => {
    const updated = [...exercises];
    updated[index] = { ...updated[index], ...updates };
    onExercisesChange(updated);
  };

  const removeExercise = (index: number) => {
    onExercisesChange(exercises.filter((_, i) => i !== index));
  };

  const addExercise = () => {
    onExercisesChange([
      ...exercises,
      {
        executed_exercise_name: '',
        sets: null,
        reps: null,
        load_kg: null,
        load_breakdown: '',
        observations: null,
        is_best_set: true,
      },
    ]);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center justify-between">
          💪 Exercícios Executados
          <Button size="sm" variant="outline" onClick={addExercise}>
            <Plus className="h-4 w-4 mr-2" />
            Adicionar Exercício
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {exercises.map((ex, idx) => (
          <div key={idx} className="p-4 border rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <Label className="font-semibold">Exercício {idx + 1}</Label>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeExercise(idx)}
                aria-label="Remover exercício"
                title="Remover exercício"
                className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <Trash className="h-4 w-4" />
              </Button>
            </div>

            {/* Name + Replace */}
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs">Nome do Exercício *</Label>
                <div className="flex gap-2">
                  <Input
                    value={ex.executed_exercise_name}
                    readOnly
                    className="flex-1"
                    title="Use o botão ao lado para substituir o exercício"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => onOpenExerciseSelection(idx)}
                    className="h-10 w-10 shrink-0"
                    aria-label="Substituir por exercício cadastrado"
                    title="Substituir por exercício cadastrado"
                  >
                    <BookOpen className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">
                  Repetições <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="number"
                  value={ex.reps ?? ''}
                  onChange={(e) =>
                    updateExercise(idx, {
                      reps: e.target.value ? parseInt(e.target.value) : null,
                    })
                  }
                  placeholder="Obrigatório"
                  className={
                    ex.reps === 0 || ex.reps === null
                      ? 'border-destructive focus:border-destructive'
                      : ''
                  }
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs flex items-center gap-1">
                  Séries
                  {requireSets && <span className="text-destructive">*</span>}
                </Label>
                <Input
                  type="number"
                  value={ex.sets ?? ''}
                  onChange={(e) =>
                    updateExercise(idx, {
                      sets: e.target.value ? parseInt(e.target.value) : null,
                    })
                  }
                  placeholder={requireSets ? 'Obrigatório' : 'Auto'}
                  className={
                    requireSets && (ex.sets === null || ex.sets === 0)
                      ? 'border-destructive focus:border-destructive'
                      : ''
                  }
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Carga (kg)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={ex.load_kg ?? ''}
                  onChange={(e) =>
                    updateExercise(idx, {
                      load_kg: e.target.value ? parseFloat(e.target.value) : null,
                    })
                  }
                />
              </div>
            </div>

            {/* Load Breakdown */}
            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-1">
                Descrição da Carga
                <span className="text-destructive">*</span>
              </Label>
              <div className="flex gap-2">
                <Input
                  value={ex.load_breakdown || ''}
                  onChange={(e) => {
                    const newBreakdown = e.target.value;
                    const updates: Partial<SessionExercise> = { load_breakdown: newBreakdown };
                    if (autoCalculateLoad) {
                      const calculated = calculateLoadFromBreakdown(newBreakdown);
                      if (calculated !== null) {
                        updates.load_kg = calculated;
                      }
                    }
                    updateExercise(idx, updates);
                  }}
                  placeholder="Ex: (25 lb + 2 kg) de cada lado + barra 10 kg"
                  className={
                    !ex.load_breakdown || ex.load_kg === null || ex.load_kg === 0
                      ? 'text-sm border-destructive focus:border-destructive'
                      : 'text-sm'
                  }
                />
                {!autoCalculateLoad && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (ex.load_breakdown) {
                        const calculated = calculateLoadFromBreakdown(ex.load_breakdown);
                        if (calculated !== null) {
                          updateExercise(idx, { load_kg: calculated });
                          notify.info('Carga calculada', { description: `${calculated} kg` });
                        }
                      }
                    }}
                  >
                    Calcular
                  </Button>
                )}
              </div>
              {ex.load_kg !== null && (
                <div className="flex items-center gap-2 p-2 bg-primary/10 rounded-md">
                  <span className="text-xs text-muted-foreground">Carga Total:</span>
                  <Badge variant="default" className="font-bold">
                    {ex.load_kg} kg
                  </Badge>
                </div>
              )}
            </div>

            {/* Observations */}
            <div className="space-y-2">
              <Label className="text-xs">Observações</Label>
              <Textarea
                value={ex.observations ?? ''}
                onChange={(e) =>
                  updateExercise(idx, { observations: e.target.value || null })
                }
                rows={2}
                placeholder="Observações técnicas..."
              />
            </div>

            {/* Best set + Delete */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={ex.is_best_set}
                  onChange={(e) => updateExercise(idx, { is_best_set: e.target.checked })}
                />
                <Label className="text-xs">Melhor série</Label>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
