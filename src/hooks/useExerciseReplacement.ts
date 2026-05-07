import { useState } from "react";
import { SessionExercise } from "@/types/sessionRecording";

interface ExerciseReplacementState {
  exerciseIndex: number;
  currentName: string;
}

export function useExerciseReplacement(
  editableExercises: SessionExercise[],
  setEditableExercises: React.Dispatch<React.SetStateAction<SessionExercise[]>>
) {
  const [exerciseSelectionOpen, setExerciseSelectionOpen] = useState(false);
  const [selectedExerciseForReplacement, setSelectedExerciseForReplacement] = useState<ExerciseReplacementState | null>(null);

  const openExerciseSelection = (exerciseIndex: number) => {
    const exercise = editableExercises[exerciseIndex];
    if (!exercise) return;
    
    setSelectedExerciseForReplacement({
      exerciseIndex,
      currentName: exercise.executed_exercise_name,
    });
    setExerciseSelectionOpen(true);
  };

  const handleExerciseSelected = (exerciseId: string, exerciseName: string) => {
    if (!selectedExerciseForReplacement) return;
    
    const { exerciseIndex } = selectedExerciseForReplacement;
    const updated = [...editableExercises];
    updated[exerciseIndex] = {
      ...updated[exerciseIndex],
      exercise_library_id: exerciseId,
      executed_exercise_name: exerciseName,
    };
    setEditableExercises(updated);
    
    setSelectedExerciseForReplacement(null);
  };

  return {
    exerciseSelectionOpen,
    setExerciseSelectionOpen,
    selectedExerciseForReplacement,
    openExerciseSelection,
    handleExerciseSelected,
  };
}
