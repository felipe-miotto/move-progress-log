import { useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X, Monitor } from "lucide-react";
import { WorkoutPrescription, PrescriptionExercise } from "@/hooks/usePrescriptions";
import { ExerciseLoadHistoryPopover } from "@/components/ExerciseLoadHistoryPopover";

interface PrescriptionTVModeProps {
  open: boolean;
  onClose: () => void;
  prescription: WorkoutPrescription;
  exercises: PrescriptionExercise[];
}

const groupExercises = (exercises: PrescriptionExercise[]) => {
  const groups: Array<{ exercises: PrescriptionExercise[]; isGroup: boolean }> = [];
  let currentGroup: PrescriptionExercise[] = [];

  exercises.forEach((exercise, index) => {
    if (index === 0) {
      currentGroup = [exercise];
    } else if (exercise.group_with_previous) {
      currentGroup.push(exercise);
    } else {
      if (currentGroup.length > 0) {
        groups.push({ exercises: currentGroup, isGroup: currentGroup.length > 1 });
      }
      currentGroup = [exercise];
    }
  });

  if (currentGroup.length > 0) {
    groups.push({ exercises: currentGroup, isGroup: currentGroup.length > 1 });
  }

  return groups;
};

export const PrescriptionTVMode = ({ open, onClose, prescription, exercises }: PrescriptionTVModeProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    document.body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  const groups = groupExercises(exercises);
  const intensityLabel = prescription.prescription_type === "individual" ? "Carga" : "PSE";

  return createPortal(
    <div
      ref={containerRef}
      className="fixed inset-0 z-[100] flex flex-col overflow-auto animate-fade-in bg-background text-foreground"
      role="dialog"
      aria-modal="true"
      aria-label={`Modo TV — ${prescription.name}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-10 py-6 shrink-0 border-b border-border">
        <div className="flex items-center gap-4">
          <Monitor className="h-8 w-8 text-muted-foreground" />
          <div>
            <h1 className="text-4xl font-bold tracking-tight">{prescription.name}</h1>
            {prescription.objective && (
              <p className="text-xl mt-1 text-muted-foreground">{prescription.objective}</p>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="lg"
          onClick={onClose}
          className="text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          aria-label="Sair do modo TV"
        >
          <X className="h-6 w-6 mr-2" />
          <span className="text-lg">ESC</span>
        </Button>
      </div>

      {/* Table */}
      <div className="flex-1 px-10 py-8">
        <div className="rounded-lg overflow-hidden border border-border">
          <table className="w-full text-lg">
            <thead>
              <tr className="bg-muted border-b border-border">
                <th className="font-bold text-xl text-center uppercase tracking-wider py-5 px-6 text-muted-foreground">Exercício</th>
                <th className="font-bold text-xl text-center uppercase tracking-wider py-5 px-6 text-muted-foreground">Sets × Reps / Int</th>
                <th className="font-bold text-xl text-center uppercase tracking-wider py-5 px-6 text-muted-foreground">{intensityLabel}</th>
                {prescription.prescription_type === 'individual' && (
                  <th className="font-bold text-xl text-center uppercase tracking-wider py-5 px-6 text-muted-foreground">RR</th>
                )}
                <th className="font-bold text-xl text-center uppercase tracking-wider py-5 px-6 text-muted-foreground">Método</th>
                <th className="font-bold text-xl text-center uppercase tracking-wider py-5 px-6 text-muted-foreground">OBS</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) =>
                group.exercises.map((exercise, exIndex) => {
                  const isFirstInGroup = exIndex === 0;
                  const isLastInGroup = exIndex === group.exercises.length - 1;

                  const setsReps = `${exercise.sets} × ${exercise.reps}`;
                  const interval = exercise.interval_seconds ? ` / ${exercise.interval_seconds}s` : "";
                  const setsRepsInt = `${setsReps}${interval}`;

                  const intensityValue =
                    prescription.prescription_type === "individual" ? exercise.load : exercise.pse;

                  return (
                    <tr
                      key={exercise.id}
                      className={`${group.isGroup && !isLastInGroup ? "" : "border-b border-border/50"} ${group.isGroup ? "border-l-4 border-l-primary/60" : ""}`}
                    >
                      <td className="font-semibold text-xl py-5 px-6 text-foreground">
                        {exercise.exercise_name}
                      </td>
                      <td className="text-center font-bold text-xl whitespace-nowrap py-5 px-6 text-foreground/90">
                        {setsRepsInt}
                      </td>
                      <td className="text-center py-5 px-6">
                        <ExerciseLoadHistoryPopover
                          exerciseName={exercise.exercise_name}
                          exerciseLibraryId={exercise.exercise_library_id}
                          prescriptionId={prescription.id}
                          darkMode
                        >
                          {intensityValue ? (
                            <span className="text-xl font-semibold text-foreground/90">{intensityValue}</span>
                          ) : (
                            <span className="text-muted-foreground/50">—</span>
                          )}
                        </ExerciseLoadHistoryPopover>
                      </td>
                      {prescription.prescription_type === 'individual' && (
                        <td className="text-center py-5 px-6">
                          {exercise.rir ? (
                            <span className="text-xl font-semibold text-foreground/90">{exercise.rir}</span>
                          ) : (
                            <span className="text-muted-foreground/50">—</span>
                          )}
                        </td>
                      )}
                      {!(group.isGroup && !isFirstInGroup) && (
                        <td
                          className="text-center py-5 px-6"
                          rowSpan={group.isGroup && isFirstInGroup ? group.exercises.length : undefined}
                        >
                          {exercise.training_method ? (
                            <Badge className="text-base bg-muted text-muted-foreground border border-border">
                              {exercise.training_method}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground/50">—</span>
                          )}
                        </td>
                      )}
                      <td className="text-lg text-center max-w-md py-5 px-6 text-muted-foreground">
                        {exercise.observations || "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer */}
      <div className="px-10 py-4 text-center shrink-0 border-t border-border">
        <p className="text-sm text-muted-foreground/60">
          Pressione ESC para sair do modo TV
        </p>
      </div>
    </div>,
    document.body
  );
};
