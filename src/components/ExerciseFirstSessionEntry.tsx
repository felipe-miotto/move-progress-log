import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ChevronLeft,
  ChevronRight,
  Save,
  Loader2,
  BookOpen,
  AlertTriangle,
  Copy,
  RefreshCw,
} from "lucide-react";
import { ExerciseSelectionDialog } from "./ExerciseSelectionDialog";
import { useExercisesLibrary } from "@/hooks/useExercisesLibrary";
import { expandLoadShorthand, compressLoadShorthand } from "@/utils/loadShorthand";
import { calculateLoadFromBreakdown } from "@/utils/loadCalculation";
import { useExerciseLastSession, type LastSessionData } from "@/hooks/useExerciseLastSession";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { notify } from "@/lib/notify";
import { logger } from "@/utils/logger";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface PrescriptionExercise {
  id: string;
  exercise_name: string;
  sets: string;
  reps: string;
  interval_seconds: number | null;
  pse: string | null;
  training_method: string | null;
  observations: string | null;
  category?: string | null;
}

interface StudentInfo {
  id: string;
  name: string;
  weight_kg?: number;
}

interface ExerciseData {
  exercise_name: string;
  sets: number;
  reps: number;
  load_kg: number | null;
  load_breakdown: string;
  observations: string;
}

interface ExerciseFirstSessionEntryProps {
  prescriptionExercises: PrescriptionExercise[];
  selectedStudents: StudentInfo[];
  date: string;
  time: string;
  trainer: string;
  prescriptionId: string | null;
  onSave: (data: {
    studentExercises: Array<{
      studentId: string;
      exercises: ExerciseData[];
    }>;
  }) => Promise<void>;
  onCancel?: () => void;
  onAddStudent?: () => void;
}

export function ExerciseFirstSessionEntry({
  prescriptionExercises,
  selectedStudents,
  onSave,
  onCancel,
}: ExerciseFirstSessionEntryProps) {
  const [exerciseIndex, setExerciseIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Data: studentId → exerciseIndex → ExerciseData
  const [data, setData] = useState<Record<string, Record<number, ExerciseData>>>(() => {
    const initial: Record<string, Record<number, ExerciseData>> = {};
    selectedStudents.forEach((student) => {
      initial[student.id] = {};
      prescriptionExercises.forEach((ex, idx) => {
        initial[student.id][idx] = {
          exercise_name: ex.exercise_name,
          sets: parseInt(ex.sets) || 0,
          reps: parseInt(ex.reps) || 0,
          load_kg: null,
          load_breakdown: "",
          observations: "",
        };
      });
    });
    return initial;
  });

  // Exercise selection dialog
  const [selectionOpen, setSelectionOpen] = useState(false);
  const [selectionTarget, setSelectionTarget] = useState<{
    studentId: string;
    exerciseIdx: number;
    currentName: string;
    category: string | null;
    movementPattern: string | null;
  } | null>(null);

  // Library lookup for exercise metadata
  const { data: exercisesLibrary } = useExercisesLibrary();

  // Input refs for keyboard navigation: [studentIdx][field] where field: 0=load, 1=reps, 2=obs
  const inputRefs = useRef<(HTMLInputElement | null)[][]>([]);

  // Last session history
  const exerciseNames = prescriptionExercises.map((e) => e.exercise_name);
  const studentIds = selectedStudents.map((s) => s.id);
  const { data: lastSessionMap } = useExerciseLastSession(
    studentIds,
    exerciseNames,
    prescriptionExercises.length > 0 && selectedStudents.length > 0
  );

  const totalExercises = prescriptionExercises.length;
  const currentPrescribed = prescriptionExercises[exerciseIndex];

  // Ensure refs array matches student count
  useEffect(() => {
    inputRefs.current = selectedStudents.map(() => [null, null, null]);
  }, [selectedStudents]);

  const getLastSession = useCallback(
    (studentId: string, exerciseName: string): LastSessionData | undefined => {
      if (!lastSessionMap) return undefined;
      return lastSessionMap.get(`${studentId}_${exerciseName.toLowerCase().trim()}`);
    },
    [lastSessionMap]
  );

  const updateField = useCallback(
    (studentId: string, exIdx: number, field: keyof ExerciseData, value: ExerciseData[keyof ExerciseData]) => {
      setData((prev) => ({
        ...prev,
        [studentId]: {
          ...prev[studentId],
          [exIdx]: {
            ...prev[studentId]?.[exIdx],
            [field]: value,
          },
        },
      }));
    },
    []
  );

  const handleLoadBlur = useCallback(
    (studentId: string, exIdx: number) => {
      const entry = data[studentId]?.[exIdx];
      if (!entry?.load_breakdown) return;

      const expanded = expandLoadShorthand(entry.load_breakdown);
      const student = selectedStudents.find((s) => s.id === studentId);
      const loadKg = calculateLoadFromBreakdown(expanded, student?.weight_kg);

      setData((prev) => ({
        ...prev,
        [studentId]: {
          ...prev[studentId],
          [exIdx]: {
            ...prev[studentId][exIdx],
            load_breakdown: expanded,
            load_kg: loadKg,
          },
        },
      }));
    },
    [data, selectedStudents]
  );

  // Keyboard flow: Enter → next field → next student
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, studentIdx: number, fieldIdx: number) => {
      if (e.key !== "Enter") return;
      e.preventDefault();

      // field 0=load, 1=reps, 2=obs
      if (fieldIdx < 2) {
        // Move to next field same student
        inputRefs.current[studentIdx]?.[fieldIdx + 1]?.focus();
      } else {
        // Move to load of next student
        const nextStudent = studentIdx + 1;
        if (nextStudent < selectedStudents.length) {
          inputRefs.current[nextStudent]?.[0]?.focus();
        }
      }
    },
    [selectedStudents.length]
  );

  const handleApplyToAll = useCallback(() => {
    const firstFilled = selectedStudents.find((s) => {
      const entry = data[s.id]?.[exerciseIndex];
      return entry?.load_breakdown && entry.load_breakdown.trim() !== "";
    });
    if (!firstFilled) {
      notify.info("Nenhuma carga preenchida para copiar");
      return;
    }
    const source = data[firstFilled.id][exerciseIndex];
    let count = 0;
    selectedStudents.forEach((s) => {
      if (s.id === firstFilled.id) return;
      const current = data[s.id]?.[exerciseIndex];
      if (current && (!current.load_breakdown || current.load_breakdown.trim() === "")) {
        count++;
      }
    });
    if (count === 0) {
      notify.info("Todos os alunos já possuem carga preenchida");
      return;
    }
    setData((prev) => {
      const updated = { ...prev };
      selectedStudents.forEach((s) => {
        if (s.id === firstFilled.id) return;
        const current = updated[s.id]?.[exerciseIndex];
        if (current && (!current.load_breakdown || current.load_breakdown.trim() === "")) {
          updated[s.id] = {
            ...updated[s.id],
            [exerciseIndex]: {
              ...current,
              load_breakdown: source.load_breakdown,
              load_kg: source.load_kg,
            },
          };
        }
      });
      return updated;
    });
    notify.success(`Carga aplicada para ${count} aluno(s)`);
  }, [data, exerciseIndex, selectedStudents]);

  const handleRepeatLastLoad = useCallback(
    (studentId: string) => {
      const entry = data[studentId]?.[exerciseIndex];
      if (!entry) return;
      const last = getLastSession(studentId, entry.exercise_name);
      if (!last?.load_breakdown) return;

      setData((prev) => ({
        ...prev,
        [studentId]: {
          ...prev[studentId],
          [exerciseIndex]: {
            ...prev[studentId][exerciseIndex],
            load_breakdown: compressLoadShorthand(last.load_breakdown || ""),
            load_kg: last.load_kg,
            reps: last.reps || prev[studentId][exerciseIndex].reps,
            observations: last.observations || prev[studentId][exerciseIndex].observations,
          },
        },
      }));
    },
    [data, exerciseIndex, getLastSession]
  );

  const openSubstitution = useCallback(
    (studentId: string) => {
      const entry = data[studentId]?.[exerciseIndex];
      if (!entry) return;

      // Look up exercise metadata from library
      const libExercise = exercisesLibrary?.find(
        (ex) => ex.name.toLowerCase().trim() === entry.exercise_name.toLowerCase().trim()
      );

      setSelectionTarget({
        studentId,
        exerciseIdx: exerciseIndex,
        currentName: entry.exercise_name,
        category: libExercise?.category ?? null,
        movementPattern: libExercise?.movement_pattern ?? null,
      });
      setSelectionOpen(true);
    },
    [data, exerciseIndex, exercisesLibrary]
  );

  const handleExerciseSelected = useCallback(
    (_exerciseId: string, exerciseName: string) => {
      if (!selectionTarget) return;
      updateField(selectionTarget.studentId, selectionTarget.exerciseIdx, "exercise_name", exerciseName);
      setSelectionTarget(null);
    },
    [selectionTarget, updateField]
  );

  // Check load deviation >30%
  const hasLoadDeviation = useCallback(
    (studentId: string, exIdx: number): boolean => {
      const entry = data[studentId]?.[exIdx];
      if (!entry?.load_kg) return false;
      const last = getLastSession(studentId, entry.exercise_name);
      if (!last?.load_kg) return false;
      const deviation = Math.abs(entry.load_kg - last.load_kg) / last.load_kg;
      return deviation > 0.3;
    },
    [data, getLastSession]
  );

  const handleSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const studentExercises = selectedStudents.map((student) => ({
        studentId: student.id,
        exercises: prescriptionExercises.map((_, idx) => {
          const entry = data[student.id]?.[idx];
          return {
            exercise_name: entry?.exercise_name || "",
            sets: entry?.sets || 0,
            reps: entry?.reps || 0,
            load_kg: entry?.load_kg ?? null,
            load_breakdown: entry?.load_breakdown || "",
            observations: entry?.observations || "",
          };
        }),
      }));
      await onSave({ studentExercises });
    } catch (error: unknown) {
      logger.warn("ExerciseFirstSessionEntry save failed", error);
      // Error handling is delegated to parent.
    } finally {
      setIsSubmitting(false);
    }
  };

  const isLoadExemptCategory = (exerciseName: string) => {
    const prescribed = prescriptionExercises.find(pe => pe.exercise_name === exerciseName);
    const cat = prescribed?.category?.toLowerCase() || '';
    return cat === 'respiracao' || cat === 'lmf';
  };

  // Validation
  const isValid = selectedStudents.every((student) =>
    prescriptionExercises.every((_, idx) => {
      const entry = data[student.id]?.[idx];
      return entry && entry.exercise_name && entry.sets > 0 && entry.reps > 0 && (isLoadExemptCategory(entry.exercise_name) || entry.load_breakdown);
    })
  );

  const renderTouchStudentCard = (student: StudentInfo) => {
    const entry = data[student.id]?.[exerciseIndex];
    if (!entry) return null;

    const last = getLastSession(student.id, entry.exercise_name);
    const deviation = hasLoadDeviation(student.id, exerciseIndex);
    const isSubstituted = entry.exercise_name !== currentPrescribed.exercise_name;

    return (
      <div key={student.id} className="rounded-xl border border-border bg-card p-3 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight">{student.name}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">{entry.exercise_name}</span>
              {isSubstituted && (
                <Badge variant="outline" className="text-[10px]">
                  substituído
                </Badge>
              )}
            </div>
          </div>
          <Button
            variant="outline"
            size="touch"
            className="shrink-0 gap-2"
            onClick={() => openSubstitution(student.id)}
          >
            <BookOpen className="h-4 w-4" />
            Trocar
          </Button>
        </div>

        {last && (
          <div className="mt-3 rounded-lg bg-muted/60 p-3 text-xs">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-foreground">
                  Última: {last.load_breakdown ? compressLoadShorthand(last.load_breakdown) : "—"} = {last.load_kg ?? "—"}kg ×{last.reps ?? "—"}
                </p>
                {last.date && (
                  <p className="mt-0.5 text-muted-foreground">
                    há {formatDistanceToNow(new Date(last.date), { addSuffix: false, locale: ptBR })}
                  </p>
                )}
                {last.observations && (
                  <p className="mt-1 line-clamp-2 text-muted-foreground/80">{last.observations}</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="touch"
                className="shrink-0"
                onClick={() => handleRepeatLastLoad(student.id)}
              >
                <RefreshCw className="h-4 w-4" />
                Repetir
              </Button>
            </div>
          </div>
        )}

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Carga parcial
            </label>
            <Input
              value={entry.load_breakdown}
              onChange={(e) => updateField(student.id, exerciseIndex, "load_breakdown", e.target.value)}
              onBlur={() => handleLoadBlur(student.id, exerciseIndex)}
              placeholder="2x24, KB32, 10cl b15"
              className={`min-h-11 text-base ${
                deviation
                  ? "border-amber-500 focus-visible:ring-amber-500"
                  : !isLoadExemptCategory(entry.exercise_name) && !entry.load_breakdown
                  ? "border-destructive/50"
                  : ""
              }`}
            />
            {deviation && (
              <p className="mt-1 flex items-center gap-1 text-xs text-amber-600">
                <AlertTriangle className="h-3.5 w-3.5" />
                Desvio maior que 30% da última carga.
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Reps
            </label>
            <Input
              type="number"
              value={entry.reps || ""}
              onChange={(e) =>
                updateField(student.id, exerciseIndex, "reps", parseInt(e.target.value) || 0)
              }
              min={1}
              inputMode="numeric"
              className={`min-h-11 text-base ${entry.reps <= 0 ? "border-destructive/50" : ""}`}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Total
            </label>
            <div className="flex min-h-11 items-center rounded-md border bg-muted/40 px-3 font-mono text-base">
              {entry.load_kg !== null ? `${entry.load_kg} kg` : "—"}
            </div>
          </div>

          <div className="col-span-2">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Observações
            </label>
            <Input
              value={entry.observations}
              onChange={(e) => updateField(student.id, exerciseIndex, "observations", e.target.value)}
              placeholder="dor, técnica, ajuste..."
              className="min-h-11 text-base"
            />
          </div>
        </div>
      </div>
    );
  };

  if (!currentPrescribed || totalExercises === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Nenhum exercício na prescrição.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Exercise navigation */}
      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setExerciseIndex((i) => Math.max(0, i - 1))}
          disabled={exerciseIndex === 0}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Anterior
        </Button>

        <div className="text-center flex-1 mx-4">
          <p className="text-xs text-muted-foreground">
            Exercício {exerciseIndex + 1} de {totalExercises}
          </p>
          <h3 className="text-base font-semibold">{currentPrescribed.exercise_name}</h3>
          <p className="text-xs text-muted-foreground">
            Prescrito: {currentPrescribed.sets}x{currentPrescribed.reps}
            {currentPrescribed.pse && ` · PSE ${currentPrescribed.pse}`}
            {currentPrescribed.training_method && ` · ${currentPrescribed.training_method}`}
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setExerciseIndex((i) => Math.min(totalExercises - 1, i + 1))}
          disabled={exerciseIndex === totalExercises - 1}
        >
          Próximo
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>

      {/* Students table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between">
            <span>{selectedStudents.length} alunos</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleApplyToAll}
              className="gap-1 h-7 text-xs"
            >
              <Copy className="h-3 w-3" />
              Aplicar carga p/ todos
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-4 lg:p-0">
          <div className="space-y-3 lg:hidden">
            {selectedStudents.map(renderTouchStudentCard)}
          </div>

          <div className="hidden overflow-x-auto lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">Aluno</TableHead>
                  <TableHead className="w-[140px]">Exercício</TableHead>
                  <TableHead className="w-[140px]">Carga parcial</TableHead>
                  <TableHead className="w-[80px]">Total</TableHead>
                  <TableHead className="w-[80px]">Reps</TableHead>
                  <TableHead>Obs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedStudents.map((student, studentIdx) => {
                  const entry = data[student.id]?.[exerciseIndex];
                  if (!entry) return null;
                  const last = getLastSession(student.id, entry.exercise_name);
                  const deviation = hasLoadDeviation(student.id, exerciseIndex);

                  return (
                    <TableRow key={student.id} className="align-top">
                      <TableCell className="py-2">
                        <div>
                          <p className="font-medium text-sm truncate max-w-[110px]">
                            {student.name.split(" ")[0]}
                          </p>
                          {last && (
                            <div className="mt-1 space-y-0.5">
                              <div className="flex items-center gap-1">
                                <p className="text-[10px] text-muted-foreground">
                                  últ: {last.load_breakdown ? compressLoadShorthand(last.load_breakdown) : "—"} = {last.load_kg ?? "—"}kg ×{last.reps ?? "—"}
                                  {last.date && (
                                    <span className="ml-0.5">
                                      {formatDistanceToNow(new Date(last.date), {
                                        addSuffix: false,
                                        locale: ptBR,
                                      })}
                                    </span>
                                  )}
                                </p>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-4 w-4 p-0"
                                      onClick={() => handleRepeatLastLoad(student.id)}
                                    >
                                      <RefreshCw className="h-2.5 w-2.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Repetir carga anterior</TooltipContent>
                                </Tooltip>
                              </div>
                              {last.observations && (
                                <p className="text-[9px] text-muted-foreground/70 italic truncate max-w-[110px]" title={last.observations}>
                                  {last.observations}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="py-2">
                        <div className="flex items-center gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-xs max-w-[130px] truncate cursor-default">
                                {entry.exercise_name}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[300px]">
                              {entry.exercise_name}
                            </TooltipContent>
                          </Tooltip>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 w-5 p-0 shrink-0"
                            onClick={() => openSubstitution(student.id)}
                            title="Substituir exercício"
                          >
                            <BookOpen className="h-3 w-3" />
                          </Button>
                        </div>
                        {entry.exercise_name !== currentPrescribed.exercise_name && (
                          <Badge variant="outline" className="text-[9px] mt-0.5">
                            substituído
                          </Badge>
                        )}
                      </TableCell>

                      <TableCell className="py-2">
                        <Input
                          ref={(el) => {
                            if (!inputRefs.current[studentIdx])
                              inputRefs.current[studentIdx] = [null, null, null];
                            inputRefs.current[studentIdx][0] = el;
                          }}
                          value={entry.load_breakdown}
                          onChange={(e) =>
                            updateField(student.id, exerciseIndex, "load_breakdown", e.target.value)
                          }
                          onBlur={() => handleLoadBlur(student.id, exerciseIndex)}
                          onKeyDown={(e) => handleKeyDown(e, studentIdx, 0)}
                          placeholder="2x24, KB32, 10cl b15"
                          className={`h-8 text-xs ${
                            deviation
                              ? "border-amber-500 focus-visible:ring-amber-500"
                              : !isLoadExemptCategory(entry.exercise_name) && !entry.load_breakdown
                              ? "border-destructive/50"
                              : ""
                          }`}
                        />
                        {deviation && (
                          <p className="text-[9px] text-amber-600 flex items-center gap-0.5 mt-0.5">
                            <AlertTriangle className="h-2.5 w-2.5" />
                            Desvio &gt;30%
                          </p>
                        )}
                      </TableCell>

                      <TableCell className="py-2">
                        <span className="text-sm font-mono">
                          {entry.load_kg !== null ? `${entry.load_kg}` : "—"}
                        </span>
                      </TableCell>

                      <TableCell className="py-2">
                        <Input
                          ref={(el) => {
                            if (!inputRefs.current[studentIdx])
                              inputRefs.current[studentIdx] = [null, null, null];
                            inputRefs.current[studentIdx][1] = el;
                          }}
                          type="number"
                          value={entry.reps || ""}
                          onChange={(e) =>
                            updateField(
                              student.id,
                              exerciseIndex,
                              "reps",
                              parseInt(e.target.value) || 0
                            )
                          }
                          onKeyDown={(e) => handleKeyDown(e, studentIdx, 1)}
                          min={1}
                          className={`h-8 text-xs ${entry.reps <= 0 ? "border-destructive/50" : ""}`}
                        />
                      </TableCell>

                      <TableCell className="py-2">
                        <Input
                          ref={(el) => {
                            if (!inputRefs.current[studentIdx])
                              inputRefs.current[studentIdx] = [null, null, null];
                            inputRefs.current[studentIdx][2] = el;
                          }}
                          value={entry.observations}
                          onChange={(e) =>
                            updateField(student.id, exerciseIndex, "observations", e.target.value)
                          }
                          onKeyDown={(e) => handleKeyDown(e, studentIdx, 2)}
                          placeholder="obs..."
                          className="h-8 text-xs"
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Progress indicator */}
      <div className="flex gap-1 justify-center">
        {prescriptionExercises.map((_, idx) => {
          const allFilled = selectedStudents.every((s) => {
            const e = data[s.id]?.[idx];
            return e && (isLoadExemptCategory(e.exercise_name) || e.load_breakdown) && e.reps > 0;
          });
          return (
            <button
              key={idx}
              onClick={() => setExerciseIndex(idx)}
              className={`h-2 rounded-full transition-all ${
                idx === exerciseIndex
                  ? "w-6 bg-primary"
                  : allFilled
                  ? "w-2 bg-primary/40"
                  : "w-2 bg-muted-foreground/20"
              }`}
            />
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex justify-between gap-2">
        {onCancel && (
          <Button onClick={onCancel} variant="outline" size="lg" disabled={isSubmitting}>
            Voltar
          </Button>
        )}
        <Button
          onClick={handleSubmit}
          disabled={!isValid || isSubmitting}
          size="lg"
          className="gap-2 ml-auto"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Salvando...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Salvar Sessão
            </>
          )}
        </Button>
      </div>

      {/* Exercise selection dialog */}
      <ExerciseSelectionDialog
        open={selectionOpen}
        onOpenChange={setSelectionOpen}
        currentExerciseName={selectionTarget?.currentName || ""}
        onExerciseSelected={handleExerciseSelected}
        autoSuggest={false}
        initialCategory={selectionTarget?.category}
        initialMovementPattern={selectionTarget?.movementPattern}
      />
    </div>
  );
}
