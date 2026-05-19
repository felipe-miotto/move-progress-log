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
import {
  buildExerciseLastSessionKey,
  normalizeExerciseSessionName,
} from "@/utils/exerciseSessionKeys";
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
  exercise_library_id?: string | null;
  exercise_name: string;
  sets: string;
  reps: string;
  interval_seconds: number | null;
  pse: string | null;
  rir?: string | null;
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
  exercise_library_id?: string | null;
  exercise_name: string;
  sets: number;
  reps: number;
  reserve_reps: string;
  load_kg: number | null;
  load_breakdown: string;
  observations: string;
  load_kg_manual_override?: boolean;
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

const parseManualLoadKg = (value: string): number | null => {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

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
          exercise_library_id: ex.exercise_library_id ?? null,
          exercise_name: ex.exercise_name,
          sets: parseInt(ex.sets) || 0,
          reps: parseInt(ex.reps) || 0,
          reserve_reps: ex.rir || "",
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

  // Input refs for keyboard navigation: [studentIdx][field] where field: 0=load, 1=total, 2=reps, 3=reserve, 4=obs
  const inputRefs = useRef<(HTMLInputElement | null)[][]>([]);

  // Last session history
  const exerciseTargets = prescriptionExercises.map((exercise) => ({
    exerciseLibraryId: exercise.exercise_library_id ?? null,
    exerciseName: exercise.exercise_name,
  }));
  const studentIds = selectedStudents.map((s) => s.id);
  const { data: lastSessionMap } = useExerciseLastSession(
    studentIds,
    exerciseTargets,
    prescriptionExercises.length > 0 && selectedStudents.length > 0
  );

  const totalExercises = prescriptionExercises.length;
  const currentPrescribed = prescriptionExercises[exerciseIndex];

  // Ensure refs array matches student count
  useEffect(() => {
    inputRefs.current = selectedStudents.map(() => [null, null, null, null, null]);
  }, [selectedStudents]);

  const getLastSession = useCallback(
    (
      studentId: string,
      exerciseName: string,
      exerciseLibraryId?: string | null
    ): LastSessionData | undefined => {
      if (!lastSessionMap) return undefined;
      const idKey = exerciseLibraryId
        ? buildExerciseLastSessionKey(studentId, { exerciseLibraryId, exerciseName })
        : null;
      return (
        (idKey ? lastSessionMap.get(idKey) : undefined) ??
        lastSessionMap.get(`${studentId}_name:${normalizeExerciseSessionName(exerciseName)}`)
      );
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
            load_kg_manual_override: false,
          },
        },
      }));
    },
    [data, selectedStudents]
  );

  const handleManualLoadKgChange = useCallback(
    (studentId: string, exIdx: number, value: string) => {
      const loadKg = parseManualLoadKg(value);
      setData((prev) => ({
        ...prev,
        [studentId]: {
          ...prev[studentId],
          [exIdx]: {
            ...prev[studentId]?.[exIdx],
            load_kg: loadKg,
            load_kg_manual_override: true,
          },
        },
      }));
    },
    []
  );

  // Keyboard flow: Enter → next field → next student
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, studentIdx: number, fieldIdx: number) => {
      if (e.key !== "Enter") return;
      e.preventDefault();

      // field 0=load, 1=total, 2=reps, 3=reserve, 4=obs
      if (fieldIdx < 4) {
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
              load_kg_manual_override: source.load_kg_manual_override,
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
      const last = getLastSession(studentId, entry.exercise_name, entry.exercise_library_id);
      if (!last?.load_breakdown) return;

      setData((prev) => ({
        ...prev,
        [studentId]: {
          ...prev[studentId],
          [exerciseIndex]: {
            ...prev[studentId][exerciseIndex],
            load_breakdown: compressLoadShorthand(last.load_breakdown || ""),
            load_kg: last.load_kg,
            load_kg_manual_override: false,
            reps: last.reps || prev[studentId][exerciseIndex].reps,
            reserve_reps: last.reserve_reps || prev[studentId][exerciseIndex].reserve_reps,
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
      const libExercise = exercisesLibrary?.find((ex) =>
        entry.exercise_library_id
          ? ex.id === entry.exercise_library_id
          : ex.name.toLowerCase().trim() === entry.exercise_name.toLowerCase().trim()
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
    (exerciseId: string, exerciseName: string) => {
      if (!selectionTarget) return;
      updateField(selectionTarget.studentId, selectionTarget.exerciseIdx, "exercise_library_id", exerciseId);
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
      const last = getLastSession(studentId, entry.exercise_name, entry.exercise_library_id);
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
            exercise_library_id: entry?.exercise_library_id ?? null,
            sets: entry?.sets || 0,
            reps: entry?.reps || 0,
            reserve_reps: entry?.reserve_reps || "",
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
      return entry && entry.exercise_library_id && entry.exercise_name && entry.sets > 0 && entry.reps > 0 && (isLoadExemptCategory(entry.exercise_name) || entry.load_breakdown);
    })
  );

  const renderTouchStudentCard = (student: StudentInfo) => {
    const entry = data[student.id]?.[exerciseIndex];
    if (!entry) return null;

    const last = getLastSession(student.id, entry.exercise_name, entry.exercise_library_id);
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
                  {last.reserve_reps && ` · Res. ${last.reserve_reps}`}
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
              Reserva
            </label>
            <Input
              value={entry.reserve_reps}
              onChange={(e) => updateField(student.id, exerciseIndex, "reserve_reps", e.target.value)}
              placeholder="2-3, 0, RM"
              className="min-h-11 text-base"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Total
            </label>
            <Input
              type="number"
              step="0.1"
              inputMode="decimal"
              value={entry.load_kg ?? ""}
              onChange={(e) => handleManualLoadKgChange(student.id, exerciseIndex, e.target.value)}
              placeholder="—"
              className="min-h-11 font-mono text-base"
            />
            {entry.load_kg_manual_override && (
              <p className="mt-1 text-xs text-muted-foreground">editado manualmente</p>
            )}
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
          size="touch"
          onClick={() => setExerciseIndex((i) => Math.max(0, i - 1))}
          disabled={exerciseIndex === 0}
          aria-label="Ir para exercício anterior"
          className="shrink-0"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          <span className="hidden sm:inline">Anterior</span>
        </Button>

        <div className="text-center flex-1 mx-4">
          <p className="text-xs text-muted-foreground">
            Exercício {exerciseIndex + 1} de {totalExercises}
          </p>
          <h3 className="text-base font-semibold">{currentPrescribed.exercise_name}</h3>
          <p className="text-xs text-muted-foreground">
            Prescrito: {currentPrescribed.sets}x{currentPrescribed.reps}
            {currentPrescribed.pse && ` · PSE ${currentPrescribed.pse}`}
            {currentPrescribed.rir && ` · Reserva ${currentPrescribed.rir}`}
            {currentPrescribed.training_method && ` · ${currentPrescribed.training_method}`}
          </p>
        </div>

        <Button
          variant="outline"
          size="touch"
          onClick={() => setExerciseIndex((i) => Math.min(totalExercises - 1, i + 1))}
          disabled={exerciseIndex === totalExercises - 1}
          aria-label="Ir para próximo exercício"
          className="shrink-0"
        >
          <span className="hidden sm:inline">Próximo</span>
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
                  <TableHead className="w-[180px]">Última carga</TableHead>
                  <TableHead className="w-[140px]">Exercício</TableHead>
                  <TableHead className="w-[140px]">Carga parcial</TableHead>
                  <TableHead className="w-[96px]">Total</TableHead>
                  <TableHead className="w-[80px]">Reps</TableHead>
                  <TableHead className="w-[96px]">Reserva</TableHead>
                  <TableHead>Obs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedStudents.map((student, studentIdx) => {
                  const entry = data[student.id]?.[exerciseIndex];
                  if (!entry) return null;
                  const last = getLastSession(student.id, entry.exercise_name, entry.exercise_library_id);
                  const deviation = hasLoadDeviation(student.id, exerciseIndex);

                  return (
                    <TableRow key={student.id} className="align-top">
                      <TableCell className="py-2">
                        <div>
                          <p className="font-medium text-sm truncate max-w-[110px]">
                            {student.name.split(" ")[0]}
                          </p>
                        </div>
                      </TableCell>

                      <TableCell className="py-2">
                        {last ? (
                          <div className="space-y-1 rounded-md bg-muted/45 p-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-[11px] font-medium">
                                  {last.load_breakdown ? compressLoadShorthand(last.load_breakdown) : "—"}
                                </p>
                                <p className="text-[10px] text-muted-foreground">
                                  {last.load_kg ?? "—"} kg · {last.reps ?? "—"} reps
                                  {last.reserve_reps && ` · Res. ${last.reserve_reps}`}
                                  {last.date && (
                                    <span className="ml-1">
                                      · {formatDistanceToNow(new Date(last.date), {
                                        addSuffix: false,
                                        locale: ptBR,
                                      })}
                                    </span>
                                  )}
                                </p>
                              </div>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-1.5 text-[10px]"
                                    onClick={() => handleRepeatLastLoad(student.id)}
                                  >
                                    <RefreshCw className="mr-1 h-3 w-3" />
                                    Usar
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Usar última carga deste aluno</TooltipContent>
                              </Tooltip>
                            </div>
                            {last.observations && (
                              <p className="truncate text-[9px] italic text-muted-foreground/70" title={last.observations}>
                                {last.observations}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
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
                              inputRefs.current[studentIdx] = [null, null, null, null, null];
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
                        <Input
                          ref={(el) => {
                            if (!inputRefs.current[studentIdx])
                              inputRefs.current[studentIdx] = [null, null, null, null, null];
                            inputRefs.current[studentIdx][1] = el;
                          }}
                          type="number"
                          step="0.1"
                          inputMode="decimal"
                          value={entry.load_kg ?? ""}
                          onChange={(e) => handleManualLoadKgChange(student.id, exerciseIndex, e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, studentIdx, 1)}
                          placeholder="—"
                          className="h-8 font-mono text-xs"
                        />
                        {entry.load_kg_manual_override && (
                          <p className="mt-0.5 text-[9px] text-muted-foreground">manual</p>
                        )}
                      </TableCell>

                      <TableCell className="py-2">
                        <Input
                          ref={(el) => {
                            if (!inputRefs.current[studentIdx])
                              inputRefs.current[studentIdx] = [null, null, null, null, null];
                            inputRefs.current[studentIdx][2] = el;
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
                          onKeyDown={(e) => handleKeyDown(e, studentIdx, 2)}
                          min={1}
                          className={`h-8 text-xs ${entry.reps <= 0 ? "border-destructive/50" : ""}`}
                        />
                      </TableCell>

                      <TableCell className="py-2">
                        <Input
                          value={entry.reserve_reps}
                          onChange={(e) =>
                            updateField(student.id, exerciseIndex, "reserve_reps", e.target.value)
                          }
                          onKeyDown={(e) => handleKeyDown(e, studentIdx, 3)}
                          placeholder="2-3"
                          className="h-8 text-xs"
                        />
                      </TableCell>

                      <TableCell className="py-2">
                        <Input
                          ref={(el) => {
                            if (!inputRefs.current[studentIdx])
                              inputRefs.current[studentIdx] = [null, null, null, null, null];
                            inputRefs.current[studentIdx][4] = el;
                          }}
                          value={entry.observations}
                          onChange={(e) =>
                            updateField(student.id, exerciseIndex, "observations", e.target.value)
                          }
                          onKeyDown={(e) => handleKeyDown(e, studentIdx, 4)}
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

      {/* Progress and actions */}
      <div className="sticky bottom-0 z-20 -mx-3 space-y-3 border-t bg-background/95 px-3 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.12)] backdrop-blur sm:-mx-4 sm:px-4 lg:static lg:mx-0 lg:border-t-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none">
        <div className="flex items-center justify-between gap-3 lg:hidden">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">
              Exercício {exerciseIndex + 1} de {totalExercises}
            </p>
            <p className="truncate text-sm font-semibold">{currentPrescribed.exercise_name}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant="secondary">{selectedStudents.length} alunos</Badge>
            {onCancel && (
              <Button onClick={onCancel} variant="ghost" size="sm" disabled={isSubmitting}>
                Voltar
              </Button>
            )}
          </div>
        </div>

        <div
          className="flex flex-wrap justify-center gap-1"
          aria-label="Navegação entre exercícios da sessão"
        >
          {prescriptionExercises.map((_, idx) => {
            const allFilled = selectedStudents.every((s) => {
              const e = data[s.id]?.[idx];
              return e && e.exercise_library_id && (isLoadExemptCategory(e.exercise_name) || e.load_breakdown) && e.reps > 0;
            });
            return (
              <button
                key={idx}
                type="button"
                onClick={() => setExerciseIndex(idx)}
                aria-label={`Ir para exercício ${idx + 1} de ${totalExercises}`}
                aria-current={idx === exerciseIndex ? "step" : undefined}
                className="group flex h-8 min-w-8 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <span
                  className={`h-2 rounded-full transition-all group-hover:scale-125 ${
                    idx === exerciseIndex
                      ? "w-6 bg-primary"
                      : allFilled
                      ? "w-2 bg-primary/40"
                      : "w-2 bg-muted-foreground/20"
                  }`}
                />
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-3 gap-2 lg:flex lg:justify-between">
          <Button
            onClick={() => setExerciseIndex((i) => Math.max(0, i - 1))}
            variant="outline"
            size="touch"
            disabled={exerciseIndex === 0 || isSubmitting}
            className="lg:hidden"
          >
            <ChevronLeft className="h-4 w-4" />
            Anterior
          </Button>
          {onCancel && (
            <Button
              onClick={onCancel}
              variant="outline"
              size="lg"
              disabled={isSubmitting}
              className="hidden lg:inline-flex"
            >
              Voltar
            </Button>
          )}
          <Button
            onClick={() => setExerciseIndex((i) => Math.min(totalExercises - 1, i + 1))}
            variant="outline"
            size="touch"
            disabled={exerciseIndex === totalExercises - 1 || isSubmitting}
            className="lg:hidden"
          >
            Próximo
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!isValid || isSubmitting}
            size="touch"
            className="gap-2 lg:ml-auto lg:h-12 lg:px-6 lg:text-base"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                <span className="hidden sm:inline">Salvar Sessão</span>
                <span className="sm:hidden">Salvar</span>
              </>
            )}
          </Button>
        </div>
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
