import { Badge } from "@/components/ui/badge";
import { SessionExercise } from "@/types/sessionRecording";

interface ExercisePreviewCardProps {
  exercise: SessionExercise;
}

export function ExercisePreviewCard({ exercise: ex }: ExercisePreviewCardProps) {
  const needsManualInput =
    ex.needs_manual_input === true ||
    !ex.reps ||
    ex.reps === 0 ||
    (ex.observations && ex.observations.includes('🔴 EXERCÍCIO MENCIONADO SEM REPETIÇÕES'));

  return (
    <div
      className={`p-3 rounded-lg ${
        needsManualInput
          ? 'bg-amber-50 dark:bg-amber-950/20 border-2 border-amber-300 dark:border-amber-700'
          : 'bg-muted/50'
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold">{ex.executed_exercise_name}</p>
            {needsManualInput && (
              <Badge
                variant="outline"
                className="bg-amber-100 dark:bg-amber-900/30 text-amber-900 dark:text-amber-100 border-amber-400 dark:border-amber-600"
              >
                ⚠️ Preencher Manualmente
              </Badge>
            )}
          </div>
          {ex.prescribed_exercise_name &&
            ex.prescribed_exercise_name !== ex.executed_exercise_name && (
              <p className="text-xs text-muted-foreground">
                Substituindo: {ex.prescribed_exercise_name}
              </p>
            )}
        </div>
        {ex.is_best_set && (
          <Badge variant="secondary" className="text-xs">
            🏆 Melhor série
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2 text-sm">
        <div>
          <span className="text-muted-foreground">Séries: </span>
          <span className={`font-semibold ${needsManualInput ? 'text-amber-700 dark:text-amber-400' : ''}`}>
            {ex.sets !== null && ex.sets !== undefined ? (
              ex.sets
            ) : (
              <Badge variant="outline" className="text-xs">Prescrito</Badge>
            )}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Reps: </span>
          <span className={`font-semibold ${needsManualInput ? 'text-amber-700 dark:text-amber-400' : ''}`}>
            {ex.reps || '-'}
          </span>
        </div>
        <div>
          {/* PSE (Percepção Subjetiva de Esforço). Coluna DB segue
              sendo `reserve_reps` (texto livre); a semântica visual é
              PSE — vem de `prescription_exercises.pse` quando há
              pré-preenchimento. NÃO substitui Reps. */}
          <span className="text-muted-foreground">PSE: </span>
          <span className="font-semibold">
            {ex.reserve_reps && ex.reserve_reps.trim().length > 0 ? ex.reserve_reps : '-'}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Carga: </span>
          <div className="flex flex-col">
            {ex.load_kg !== null && ex.load_kg !== undefined ? (
              <span className={`font-bold ${needsManualInput ? 'text-amber-700 dark:text-amber-400' : 'text-primary'}`}>
                {ex.load_kg} kg
              </span>
            ) : needsManualInput ? (
              <span className="text-amber-700 dark:text-amber-400 font-semibold">-</span>
            ) : null}
            {ex.load_breakdown && (
              <span className="text-xs text-muted-foreground">{ex.load_breakdown}</span>
            )}
          </div>
        </div>
      </div>

      {ex.observations && (
        <p
          className={`text-xs mt-2 ${
            needsManualInput
              ? 'text-amber-900 dark:text-amber-100 font-medium'
              : 'text-muted-foreground'
          }`}
        >
          {ex.observations}
        </p>
      )}
    </div>
  );
}
