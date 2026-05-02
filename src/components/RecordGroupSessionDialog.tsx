import { useState, useEffect, useMemo, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ExerciseFirstSessionEntry } from "./ExerciseFirstSessionEntry";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MultiSegmentRecorder } from "./MultiSegmentRecorder";
import { ManualSessionEntry } from "./ManualSessionEntry";
import { SessionSetupForm } from "./SessionSetupForm";
import { useStudents } from "@/hooks/useStudents";
import { usePrescriptionAssignments, usePrescriptions } from "@/hooks/usePrescriptions";
import { useCreateGroupWorkoutSessions } from "@/hooks/useWorkoutSessions";
import { usePrescriptionDetails } from "@/hooks/usePrescriptions";
import type { AssignmentScheduleAdaptations } from "@/hooks/usePrescriptions";
import { supabase } from "@/integrations/supabase/client";
import { Mic, User, Users, Save, Edit, Pencil, ChevronLeft, ChevronRight, Plus, BookOpen, UserPlus } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { notify } from "@/lib/notify";
import i18n from "@/i18n/pt-BR.json";
import { ExerciseSelectionDialog } from "./ExerciseSelectionDialog";
import { NAV_LABELS } from "@/constants/navigation";
import { useSessionDraft } from "@/hooks/useSessionDraft";
import { AddStudentDialog } from "./AddStudentDialog";
import { calculateLoadFromBreakdown } from "@/utils/loadCalculation";
import { logger } from "@/utils/logger";
import { buildErrorDescription } from "@/utils/errorParsing";
import { formatSessionTime, getCurrentSessionTimeHHmm } from "@/utils/sessionTime";
import { formatSessionDate } from "@/utils/sessionDate";
import { format } from "date-fns";

// Shared types, utilities & components
import {
  MAX_RECORDINGS,
  areSimilarObservations,
  getSeverityVariant,
  getCategoryIcon,
  type GroupObservation,
  type SessionExercise,
  type AccumulatedRecording,
} from "@/types/sessionRecording";
import { useExerciseReplacement } from "@/hooks/useExerciseReplacement";
import { ExerciseEditor } from "@/components/session/ExerciseEditor";
import { ObservationEditor } from "@/components/session/ObservationEditor";
import { ExercisePreviewCard } from "@/components/session/ExercisePreviewCard";
import { ObservationPreview } from "@/components/session/ObservationPreview";
import { ValidationAlerts } from "@/components/session/ValidationAlerts";
import { PrescriptionSidebar } from "@/components/session/PrescriptionSidebar";

// ─── Local Types ────────────────────────────────────────

interface PrescriptionExerciseDetail {
  id: string;
  exercise_name?: string;
  sets: string;
  reps: string;
  interval_seconds: number | null;
  pse: string | null;
  training_method: string | null;
  observations: string | null;
  should_track?: boolean;
  category?: string | null;
  exercises_library?: { name: string; category: string | null } | null;
}

interface PrescriptionDetailsData {
  id: string;
  name: string;
  objective: string;
  exercises: PrescriptionExerciseDetail[];
}

interface ManualSavePayload {
  studentExercises: Array<{
    studentId: string;
    exercises: Array<{
      exercise_name: string;
      sets: number;
      reps: number;
      load_kg: number | null;
      load_breakdown: string;
      observations: string;
    }>;
  }>;
}

interface SessionQueryRow {
  id: string;
  student_id: string;
  students: { id: string; name: string; weight_kg: number | null };
}

interface ExerciseRow {
  id: string;
  exercise_name: string;
  sets: number | null;
  reps: number | null;
  load_kg: number | null;
  load_breakdown: string | null;
  observations: string | null;
  is_best_set: boolean | null;
}

interface GroupSessionToSave {
  student_id: string;
  student_name: string;
  exercises: SessionExercise[];
  clinical_observations: GroupObservation[];
}

const normalizeComparableText = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const isAssignmentScheduleAdaptations = (
  value: unknown
): value is AssignmentScheduleAdaptations => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const maybe = value as AssignmentScheduleAdaptations;

  const hasWeekdays =
    Array.isArray(maybe.weekdays) &&
    maybe.weekdays.every((day) => typeof day === "string");

  const hasTime = typeof maybe.time === "string" && maybe.time.length > 0;

  return hasWeekdays || hasTime;
};

// ─── Component Types ────────────────────────────────────────

interface RecordGroupSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prescriptionId?: string | null;
  reopenDate?: string;
  reopenTime?: string;
}

type DialogState = 'context-setup' | 'mode-selection' | 'recording' | 'processing' | 'preview' | 'edit' | 'manual-entry';

interface Student {
  id: string;
  name: string;
  weight_kg?: number;
  has_active_prescription: boolean;
}

interface SessionData {
  sessions: Array<{
    student_name: string;
    auto_added?: boolean;
    clinical_observations?: Array<GroupObservation>;
    exercises: Array<SessionExercise>;
  }>;
}

interface MergedStudent {
  student_name: string;
  recording_numbers: number[];
  clinical_observations: GroupObservation[];
  exercises: SessionExercise[];
}

// Toggle sub-component for manual entry mode
function ManualEntryWithToggle({
  prescriptionDetails,
  selectedStudents,
  date, time, trainer,
  prescriptionId,
  onSave,
  onCancel,
  onAddStudent,
}: {
  prescriptionDetails: PrescriptionDetailsData | null | undefined;
  selectedStudents: Array<{ id: string; name: string; weight_kg?: number; has_active_prescription: boolean }>;
  date: string; time: string; trainer: string;
  prescriptionId: string | null;
  onSave: (data: ManualSavePayload) => Promise<void>;
  onCancel: () => void;
  onAddStudent: () => void;
}) {
  const [entryMode, setEntryMode] = useState<'by-exercise' | 'by-student'>('by-exercise');

  const exercises = prescriptionDetails?.exercises?.filter((ex) => ex.should_track !== false).map((ex) => ({
    id: ex.id, exercise_name: ex.exercise_name, sets: ex.sets, reps: ex.reps,
    interval_seconds: ex.interval_seconds, pse: ex.pse, training_method: ex.training_method, observations: ex.observations,
    category: ex.category || null,
  })) || [];

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button variant={entryMode === 'by-exercise' ? 'default' : 'outline'} size="sm"
          onClick={() => setEntryMode('by-exercise')}>
          Por Exercício
        </Button>
        <Button variant={entryMode === 'by-student' ? 'default' : 'outline'} size="sm"
          onClick={() => setEntryMode('by-student')}>
          Por Aluno
        </Button>
      </div>

      {entryMode === 'by-exercise' ? (
        <ExerciseFirstSessionEntry
          prescriptionExercises={exercises}
          selectedStudents={selectedStudents}
          date={date} time={time} trainer={trainer}
          prescriptionId={prescriptionId}
          onSave={onSave}
          onCancel={onCancel}
          onAddStudent={onAddStudent}
        />
      ) : (
        <ManualSessionEntry
          prescriptionExercises={exercises}
          selectedStudents={selectedStudents}
          date={date} time={time} trainer={trainer}
          prescriptionId={prescriptionId}
          onSave={onSave}
          onCancel={onCancel}
          onAddStudent={onAddStudent}
        />
      )}
    </div>
  );
}

export function RecordGroupSessionDialog({
  open,
  onOpenChange,
  prescriptionId,
  reopenDate,
  reopenTime,
}: RecordGroupSessionDialogProps) {
  const normalizedReopenTime = reopenTime ? formatSessionTime(reopenTime) : undefined;
  const isReopening = !!(reopenDate && normalizedReopenTime);
  const { hasUnsavedChanges, clearDraft } = useSessionDraft();
  const [dialogState, setDialogState] = useState<DialogState>(isReopening ? 'mode-selection' : 'context-setup');
  const [selectedStudents, setSelectedStudents] = useState<Student[]>([]);
  const [date, setDate] = useState(reopenDate || format(new Date(), "yyyy-MM-dd"));
  const [isSaving, setIsSaving] = useState(false);
  const [time, setTime] = useState(normalizedReopenTime || getCurrentSessionTimeHHmm());
  const [accumulatedRecordings, setAccumulatedRecordings] = useState<AccumulatedRecording<SessionData>[]>([]);
  const [currentRecordingNumber, setCurrentRecordingNumber] = useState(1);
  const [mergedStudents, setMergedStudents] = useState<MergedStudent[]>([]);
  const [validationIssues, setValidationIssues] = useState<{ errors: string[]; warnings: string[] }>({ errors: [], warnings: [] });
  const [hasAutoSelected, setHasAutoSelected] = useState(false);
  
  // Edit states
  const [editingStudentIndex, setEditingStudentIndex] = useState<number>(0);
  const [editableObservations, setEditableObservations] = useState<GroupObservation[]>([]);
  const [editableExercises, setEditableExercises] = useState<SessionExercise[]>([]);
  const [trainer, setTrainer] = useState<string>('');
  const [showValidation, setShowValidation] = useState(false);
  const [showAddStudentDialog, setShowAddStudentDialog] = useState(false);
  const [selectedPrescriptionId, setSelectedPrescriptionId] = useState<string | null>(null);

  // When prop is provided (e.g. opened from /prescricoes), use it.
  // Otherwise, the user must pick a prescription explicitly in the context-setup step.
  const effectivePrescriptionId = prescriptionId ?? selectedPrescriptionId;

  // Shared hook for exercise replacement
  const {
    exerciseSelectionOpen,
    setExerciseSelectionOpen,
    selectedExerciseForReplacement,
    openExerciseSelection,
    handleExerciseSelected,
  } = useExerciseReplacement(editableExercises, setEditableExercises);

  const { data: students } = useStudents();
  const { data: prescriptionsList } = usePrescriptions();
  const { data: assignments } = usePrescriptionAssignments(effectivePrescriptionId);
  const { data: prescriptionDetails } = usePrescriptionDetails(effectivePrescriptionId);
  const createGroupSessions = useCreateGroupWorkoutSessions();
  
  useEffect(() => { logger.debug("Dialog State mudou para:", dialogState); }, [dialogState]);
  useEffect(() => { logger.debug("Merged Students atualizado:", mergedStudents.length, "alunos"); }, [mergedStudents]);

  const enrichedStudents = useMemo(() => students?.map((student) => ({
    ...student,
    has_active_prescription: assignments?.some(a => a.student_id === student.id) || false,
  })).sort((a, b) => {
    if (a.has_active_prescription && !b.has_active_prescription) return -1;
    if (!a.has_active_prescription && b.has_active_prescription) return 1;
    return a.name.localeCompare(b.name);
  }), [students, assignments]);

  const handleModeSelection = (mode: 'voice' | 'manual') => {
    if (!trainer.trim()) { notify.error("Por favor, selecione o treinador antes de continuar"); return; }
    if (!date || !time) { notify.error("Por favor, preencha data e horário antes de continuar"); return; }
    if (selectedStudents.length === 0) { notify.error("Por favor, selecione pelo menos um aluno antes de continuar"); return; }
    setDialogState(mode === 'voice' ? 'recording' : 'manual-entry');
  };

  const loadExistingSessionsData = useCallback(async () => {
    if (!prescriptionId || !reopenDate || !normalizedReopenTime) return;
    try {
      const { data: sessions, error: sessionsError } = await supabase
        .from('workout_sessions')
        .select('id, student_id, students!inner(id, name, weight_kg)')
        .eq('prescription_id', prescriptionId)
        .eq('date', reopenDate)
        .eq('time', normalizedReopenTime);
      if (sessionsError) throw sessionsError;
      if (sessions && sessions.length > 0) {
        const typedSessions = (sessions ?? []) as SessionQueryRow[];
        const existingStudents = typedSessions.map((s) => ({
          id: s.student_id, name: s.students.name, weight_kg: s.students.weight_kg ?? undefined, has_active_prescription: true,
        }));
        setSelectedStudents(existingStudents);
        const allExercises = await Promise.all(
          typedSessions.map(async (session) => {
            const { data: exercises, error: exercisesError } = await supabase
              .from('exercises')
              .select('id, session_id, exercise_name, sets, reps, load_kg, load_breakdown, observations, is_best_set')
              .eq('session_id', session.id);
            if (exercisesError) {
              throw exercisesError;
            }
            return { student_name: session.students.name, exercises: (exercises || []) as ExerciseRow[] };
          })
        );
        const merged: MergedStudent[] = allExercises.map((data) => ({
          student_name: data.student_name, recording_numbers: [0], clinical_observations: [],
          exercises: data.exercises.map((ex) => ({
            prescribed_exercise_name: null, executed_exercise_name: ex.exercise_name,
            sets: ex.sets, reps: ex.reps, load_kg: ex.load_kg, load_breakdown: ex.load_breakdown || '',
            observations: ex.observations, is_best_set: ex.is_best_set || false,
          })),
        }));
        setMergedStudents(merged);
        notify.info("Sessão carregada", { description: `${typedSessions.length} aluno(s) carregado(s). Você pode adicionar mais gravações.` });
      }
    } catch (error) {
      logger.error("Erro ao carregar sessões existentes:", error);
      notify.error("Falha ao reabrir sessão", {
        description: "Não foi possível carregar os dados existentes da sessão. Você pode continuar manualmente.",
      });
    }
  }, [prescriptionId, reopenDate, normalizedReopenTime]);

  // Load existing sessions when reopening
  useEffect(() => {
    if (isReopening && prescriptionId && reopenDate && normalizedReopenTime && open) {
      loadExistingSessionsData();
    }
  }, [isReopening, prescriptionId, reopenDate, normalizedReopenTime, open, loadExistingSessionsData]);

  const toggleStudent = (student: Student) => {
    setSelectedStudents((prev) => {
      const isSelected = prev.find(s => s.id === student.id);
      if (isSelected) return prev.filter((s) => s.id !== student.id);
      if (prev.length >= 10) {
        notify.warning("Limite atingido", { description: "É possível selecionar no máximo 10 alunos por sessão" });
        return prev;
      }
      return [...prev, student];
    });
  };

  const handleStudentCreated = (newStudent: { id: string; name: string; weight_kg?: number }) => {
    toggleStudent({ ...newStudent, has_active_prescription: false });
  };

  const isContextValid = date && time && trainer && selectedStudents.length > 0;

  // ─── Merge & Validation Logic ────────────────────────────────────────

  const mergeAllRecordings = (recordings: AccumulatedRecording<SessionData>[], existingData?: MergedStudent[]): MergedStudent[] => {
    logger.debug('[Group] mergeAllRecordings chamado', { recordings: recordings.length, existing: existingData?.length || 0 });
    const studentMap = new Map<string, MergedStudent>();

    if (existingData) {
      existingData.forEach((existing) => {
        studentMap.set(existing.student_name.toLowerCase(), { ...existing, recording_numbers: [0] });
      });
    }

    recordings.forEach((recording) => {
      recording.data.sessions.forEach((session) => {
        const key = session.student_name.toLowerCase();
        if (!studentMap.has(key)) {
          studentMap.set(key, { student_name: session.student_name, recording_numbers: [], clinical_observations: [], exercises: [] });
        }
        const merged = studentMap.get(key)!;
        if (!merged.recording_numbers.includes(recording.recordingNumber)) merged.recording_numbers.push(recording.recordingNumber);
        
        if (session.clinical_observations) {
          session.clinical_observations.forEach(newObs => {
            if (!merged.clinical_observations.some(e => areSimilarObservations(e.observation_text, newObs.observation_text))) {
              merged.clinical_observations.push(newObs);
            }
          });
        }
        
        session.exercises.forEach((newEx) => {
          // Preserve exercises with null reps (needs_manual_input) for manual correction
          if (!merged.exercises.some(ex => ex.executed_exercise_name === newEx.executed_exercise_name && ex.reps === newEx.reps && ex.load_kg === newEx.load_kg)) {
            merged.exercises.push(newEx);
          }
        });
      });
    });

    const result = Array.from(studentMap.values()).sort((a, b) => a.student_name.localeCompare(b.student_name));
    logger.debug('[Group] Merge completo:', result.map(s => `${s.student_name}: ${s.exercises.length} exercícios`));
    return result;
  };

  const validateMergedData = (merged: MergedStudent[]) => {
    const warnings: string[] = [];
    const errors: string[] = [];
    const prescribedExercises = prescriptionDetails?.exercises?.filter((ex: PrescriptionExerciseDetail) => ex.should_track !== false) || [];
    
    merged.forEach(student => {
      const matchingStudent = selectedStudents.find(s => s.name.toLowerCase() === student.student_name.toLowerCase());
      const studentWeight = matchingStudent?.weight_kg;
      
      if (student.exercises.length === 0) errors.push(`❌ ${student.student_name} foi mencionado mas não tem exercícios registrados`);
      
      if (prescribedExercises.length > 0) {
        prescribedExercises.forEach((prescribed: PrescriptionExerciseDetail) => {
          const prescribedName = (prescribed.exercise_name || prescribed.exercises_library?.name || '').toLowerCase().trim();
          if (!prescribedName) return;
          const wasExecuted = student.exercises.some(ex => {
            const executedName = ex.executed_exercise_name.toLowerCase().trim();
            return executedName.includes(prescribedName) || prescribedName.includes(executedName) || executedName === prescribedName;
          });
          if (!wasExecuted) warnings.push(`⚠️ ${student.student_name}: "${prescribed.exercise_name || prescribed.exercises_library?.name}" prescrito mas NÃO mencionado no áudio`);
        });
      }
      
      student.exercises.forEach((ex, idx) => {
        const exName = ex.executed_exercise_name || `Exercício ${idx + 1}`;
        if (!ex.reps || ex.reps <= 0) errors.push(`❌ ${student.student_name} - ${exName}: faltam repetições`);
        if (!ex.load_breakdown || ex.load_breakdown.trim() === '') warnings.push(`⚠️ ${student.student_name} - ${exName}: sem descrição de carga`);
        if (ex.load_kg === null || ex.load_kg === 0) warnings.push(`⚠️ ${student.student_name} - ${exName}: sem carga calculada`);
        const isPesoCorporal = ex.load_breakdown?.toLowerCase().includes('peso corporal');
        if (isPesoCorporal && ex.load_kg === null && studentWeight) errors.push(`❌ ${student.student_name} - ${exName}: peso corporal não foi calculado automaticamente (aluno tem ${studentWeight} kg cadastrado)`);
      });
      
      student.clinical_observations.forEach((obs, idx) => {
        if (!obs.severity) errors.push(`❌ ${student.student_name}: Observação clínica ${idx+1} sem severidade`);
        if (!obs.observation_text || obs.observation_text.trim() === '') errors.push(`❌ ${student.student_name}: Observação clínica ${idx+1} sem texto`);
      });
      
      if (student.recording_numbers.length === 1 && accumulatedRecordings.length > 1) {
        warnings.push(`⚠️ ${student.student_name} só aparece na gravação ${student.recording_numbers[0]}`);
      }
    });
    
    selectedStudents.forEach(student => {
      if (!merged.find(m => m.student_name.toLowerCase() === student.name.toLowerCase())) {
        warnings.push(`⚠️ ${student.name} não foi mencionado em nenhuma gravação`);
      }
    });
    
    return { errors, warnings };
  };

  // ─── Auto-Add Students ────────────────────────────────────────

  const handleAutoAddStudents = async (data: SessionData) => {
    try {
      const newStudents: Student[] = [];
      for (let i = 0; i < data.sessions.length; i++) {
        const session = data.sessions[i];
        const normalizedSessionName = normalizeComparableText(session.student_name);
        const existingStudent = selectedStudents.find(
          (student) => normalizeComparableText(student.name) === normalizedSessionName
        );
        const queuedStudent = newStudents.find(
          (student) => normalizeComparableText(student.name) === normalizedSessionName
        );
        if (!existingStudent && !queuedStudent) {
          const { data: candidateStudents, error } = await supabase
            .from('students')
            .select('id, name, weight_kg')
            .ilike('name', session.student_name)
            .order('created_at', { ascending: false })
            .limit(20);
          if (error) {
            logger.warn(`Falha ao buscar aluno "${session.student_name}":`, error);
            continue;
          }

          const targetName = normalizedSessionName;
          const studentData =
            candidateStudents?.find((candidate) => normalizeComparableText(candidate.name) === targetName) ||
            candidateStudents?.[0];

          if (!studentData) {
            logger.warn(`Aluno "${session.student_name}" não encontrado`);
            continue;
          }

          if (studentData) {
            newStudents.push({ id: studentData.id, name: studentData.name, weight_kg: studentData.weight_kg ?? undefined, has_active_prescription: false });
            data.sessions[i].auto_added = true;
          }
        }
      }
      if (newStudents.length > 0) {
        setSelectedStudents(prev => [...prev, ...newStudents]);
        notify.success(i18n.modules.workouts.studentsAutoAdded, { description: `${newStudents.map(s => s.name).join(", ")} ${i18n.modules.workouts.studentsWereAdded}` });
      }
    } catch (error) {
      logger.error("Erro em handleAutoAddStudents:", error);
      notify.warning("Autoassociação indisponível", {
        description: "Não foi possível sugerir alunos automaticamente neste áudio. Continue com seleção manual.",
      });
    }
  };

  // ─── Session Data Handlers ────────────────────────────────────────

  const handleSessionData = async (data: SessionData) => {
    logger.debug("Dados recebidos da gravação", currentRecordingNumber);
    try {
      await handleAutoAddStudents(data);
      const newRecording: AccumulatedRecording<SessionData> = { recordingNumber: currentRecordingNumber, timestamp: new Date().toISOString(), data };
      const updatedRecordings = [...accumulatedRecordings, newRecording];
      setAccumulatedRecordings(updatedRecordings);
      const existingData = isReopening && mergedStudents.length > 0 ? mergedStudents : undefined;
      const merged = mergeAllRecordings(updatedRecordings, existingData);
      setMergedStudents(merged);
      setValidationIssues(validateMergedData(merged));
      setTimeout(() => { setDialogState('preview'); }, 100);
    } catch (error) {
      logger.error("Erro em handleSessionData:", error);
      handleError(error);
    }
  };

  const handleError = (error: unknown) => {
    logger.error("handleError chamado:", error);
    notify.error(i18n.modules.workouts.recordingError, {
      description: buildErrorDescription(error, "Erro ao processar dados"),
    });
    setDialogState('recording');
  };

  const handleAddAnotherRecording = () => {
    if (accumulatedRecordings.length >= MAX_RECORDINGS) {
      notify.warning(i18n.modules.workouts.limitReached, { description: i18n.modules.workouts.maxRecordings.replace('{{max}}', MAX_RECORDINGS.toString()) });
      return;
    }
    setCurrentRecordingNumber(prev => prev + 1);
    setDialogState('recording');
  };

  const handleBack = () => {
    setDialogState('mode-selection');
    setAccumulatedRecordings([]);
    setCurrentRecordingNumber(1);
    setMergedStudents([]);
    setValidationIssues({ errors: [], warnings: [] });
  };

  const handleStartEditing = () => {
    if (mergedStudents.length === 0) return;
    setEditingStudentIndex(0);
    setEditableObservations(mergedStudents[0].clinical_observations || []);
    setEditableExercises(mergedStudents[0].exercises || []);
    setDialogState('edit');
  };

  const handleSaveEdits = () => {
    const updatedMerged = [...mergedStudents];
    updatedMerged[editingStudentIndex] = { ...updatedMerged[editingStudentIndex], clinical_observations: editableObservations, exercises: editableExercises };
    setMergedStudents(updatedMerged);
    setValidationIssues(validateMergedData(updatedMerged));
    setDialogState('preview');
  };

  const handleNavigateStudent = (direction: 'prev' | 'next') => {
    const updatedMerged = [...mergedStudents];
    updatedMerged[editingStudentIndex] = { ...updatedMerged[editingStudentIndex], clinical_observations: editableObservations, exercises: editableExercises };
    setMergedStudents(updatedMerged);
    const newIndex = direction === 'next' ? Math.min(editingStudentIndex + 1, mergedStudents.length - 1) : Math.max(editingStudentIndex - 1, 0);
    setEditingStudentIndex(newIndex);
    setEditableObservations(updatedMerged[newIndex].clinical_observations || []);
    setEditableExercises(updatedMerged[newIndex].exercises || []);
  };

  // ─── Save Logic ────────────────────────────────────────

  const handleSave = async () => {
    if (mergedStudents.length === 0 || !effectivePrescriptionId) return;

    if (isReopening && reopenDate && normalizedReopenTime) {
      try {
        const { data: existingSessions, error: existingSessionsError } = await supabase
          .from('workout_sessions')
          .select('id')
          .eq('prescription_id', effectivePrescriptionId)
          .eq('date', reopenDate)
          .eq('time', normalizedReopenTime);
        if (existingSessionsError) throw existingSessionsError;

        if (existingSessions && existingSessions.length > 0) {
          const sessionIds = existingSessions.map(s => s.id);
          const { error: deleteExercisesError } = await supabase
            .from('exercises')
            .delete()
            .in('session_id', sessionIds);
          if (deleteExercisesError) throw deleteExercisesError;

          const { error: deleteSessionsError } = await supabase
            .from('workout_sessions')
            .delete()
            .in('id', sessionIds);
          if (deleteSessionsError) throw deleteSessionsError;
        }
      } catch (error) {
        logger.error('Erro ao deletar sessões antigas:', error);
        notify.error("Erro ao consolidar dados", { description: "Não foi possível atualizar as sessões existentes." });
        return;
      }
    }

    const sessionsToSave: GroupSessionToSave[] = mergedStudents.map(merged => {
      const student = selectedStudents.find(s => s.name.toLowerCase() === merged.student_name.toLowerCase());
      if (!student) { logger.error(`Student not found: ${merged.student_name}`); return null; }
      return { student_id: student.id, student_name: student.name, exercises: merged.exercises, clinical_observations: merged.clinical_observations || [] };
    }).filter((s): s is GroupSessionToSave => s !== null);

    await createGroupSessions.mutateAsync({ prescriptionId: effectivePrescriptionId, date, time, sessions: sessionsToSave });

    const sessionLookupStudentIds = selectedStudents.map((student) => student.id);
    const { data: savedSessions, error: savedSessionsError } = await supabase
      .from('workout_sessions')
      .select('id, student_id, created_at')
      .in('student_id', sessionLookupStudentIds)
      .eq('date', date)
      .eq('time', time)
      .order('created_at', { ascending: false });

    const latestSessionByStudent = new Map<string, { id: string }>();
    if (savedSessionsError) {
      logger.error('Error fetching saved sessions for post-processing:', savedSessionsError);
      notify.warning("Sessões salvas com pendências", {
        description: "Não foi possível vincular automaticamente observações e transcrições nesta gravação.",
      });
    } else {
      (savedSessions || []).forEach((row) => {
        if (!latestSessionByStudent.has(row.student_id)) {
          latestSessionByStudent.set(row.student_id, { id: row.id });
        }
      });
    }

    // Save clinical observations and audio segments per student
    let hasAudioSegmentsInsertError = false;
    for (const merged of mergedStudents) {
      const student = selectedStudents.find(s => s.name.toLowerCase() === merged.student_name.toLowerCase());
      if (!student) continue;

      const sessionData = latestSessionByStudent.get(student.id);
      if (!sessionData) continue;

      // Save clinical observations
      if (merged.clinical_observations && merged.clinical_observations.length > 0) {
        const observationsToInsert = merged.clinical_observations.map(obs => ({
          student_id: student.id, observation_text: obs.observation_text, categories: obs.categories, severity: obs.severity, session_id: sessionData.id, is_resolved: false,
        }));
        const { error } = await supabase.from('student_observations').insert(observationsToInsert);
        if (error) {
          logger.error('Error saving clinical observations:', error);
          notify.error(i18n.modules.workouts.warning, { description: `${i18n.modules.workouts.clinicalObservationsNotSaved}: ${student.name}` });
        }
      }

      // Save audio segments (transcription data)
      if (accumulatedRecordings.length > 0) {
        const audioSegments = accumulatedRecordings
          .filter((recording) => recording.rawTranscription)
          .map((recording) => ({
            session_id: sessionData.id,
            segment_order: recording.recordingNumber,
            raw_transcription: recording.rawTranscription || 'Sem transcrição disponível',
            edited_transcription: recording.editedTranscription || null,
          }));
        if (audioSegments.length > 0) {
          const { error: segmentsError } = await supabase.from('session_audio_segments').insert(audioSegments);
          if (segmentsError) {
            logger.error('Error saving audio segments for group:', segmentsError);
            hasAudioSegmentsInsertError = true;
          }
        }
      }
    }

    if (hasAudioSegmentsInsertError) {
      notify.warning("Sessão salva com pendências", {
        description: "Alguns segmentos de áudio não foram salvos. Os exercícios da sessão foram preservados.",
      });
    }

    setSelectedStudents([]);
    setAccumulatedRecordings([]);
    setCurrentRecordingNumber(1);
    setMergedStudents([]);
    setValidationIssues({ errors: [], warnings: [] });
    setDialogState('context-setup');
    onOpenChange(false);
  };

  const handleSaveManual = async (data: ManualSavePayload): Promise<void> => {
    setIsSaving(true);
    try {
      if (!trainer || trainer.trim() === '') { notify.error("Campo obrigatório", { description: "Nome do treinador é obrigatório" }); throw new Error("Nome do treinador é obrigatório"); }
      if (data.studentExercises.length === 0) { notify.error("Nenhum aluno selecionado", { description: "É necessário ter pelo menos 1 aluno com exercícios" }); throw new Error("Nenhum aluno selecionado"); }

      const validationErrors: string[] = [];
      data.studentExercises.forEach((se, idx) => {
        const student = selectedStudents.find(s => s.id === se.studentId);
        const studentName = student?.name || `Aluno ${idx + 1}`;
        if (se.exercises.length === 0) validationErrors.push(`${studentName}: nenhum exercício registrado`);
        se.exercises.forEach((ex, exIdx) => {
          if (!ex.exercise_name || ex.exercise_name.trim() === '') validationErrors.push(`${studentName} - Exercício ${exIdx + 1}: nome obrigatório`);
          if (ex.sets <= 0) validationErrors.push(`${studentName} - ${ex.exercise_name}: séries deve ser maior que 0`);
          if (ex.reps <= 0) validationErrors.push(`${studentName} - ${ex.exercise_name}: reps deve ser maior que 0`);
          const matchedPrescribed = prescriptionDetails?.exercises?.find((pe: PrescriptionExerciseDetail) => pe.exercise_name === ex.exercise_name);
          const exCategory = matchedPrescribed?.category?.toLowerCase() || '';
          const isLoadExempt = exCategory === 'respiracao' || exCategory === 'lmf';
          if (!isLoadExempt && (!ex.load_breakdown || ex.load_breakdown.trim() === '')) validationErrors.push(`${studentName} - ${ex.exercise_name}: descrição da carga obrigatória`);
        });
      });

      if (validationErrors.length > 0) {
        notify.error("Dados incompletos", { description: validationErrors.slice(0, 3).join('; ') + (validationErrors.length > 3 ? '...' : '') });
        throw new Error("Dados incompletos");
      }

      const sessionsToCreate = data.studentExercises.map(se => {
        const student = selectedStudents.find(s => s.id === se.studentId);
        return {
          student_id: se.studentId, student_name: student?.name || '',
          exercises: se.exercises.map(ex => ({ executed_exercise_name: ex.exercise_name, sets: ex.sets, reps: ex.reps, load_kg: ex.load_kg, load_breakdown: ex.load_breakdown, observations: ex.observations, is_best_set: false }))
        };
      });

      for (const session of sessionsToCreate) {
        const { data: workoutSession, error: sessionError } = await supabase.from("workout_sessions").insert({ student_id: session.student_id, prescription_id: effectivePrescriptionId, date, time, session_type: 'group', trainer_name: trainer, is_finalized: true, can_reopen: true }).select("id").single();
        if (sessionError) throw sessionError;
        const exercisesToInsert = session.exercises.map((ex) => ({ session_id: workoutSession.id, exercise_name: ex.executed_exercise_name, sets: ex.sets, reps: ex.reps, load_kg: ex.load_kg, load_breakdown: ex.load_breakdown, observations: ex.observations || null }));
        const { error: exercisesError } = await supabase.from("exercises").insert(exercisesToInsert);
        if (exercisesError) throw exercisesError;
      }
      
      notify.success("Sessões registradas com sucesso", { description: `${sessionsToCreate.length} sessão(ões) criada(s) manualmente` });
      setDialogState('context-setup');
      setSelectedStudents([]);
      setTrainer('');
      setDate(format(new Date(), "yyyy-MM-dd"));
      setTime(getCurrentSessionTimeHHmm());
      setHasAutoSelected(false);
      onOpenChange(false);
    } catch (error) {
      logger.error("Erro no salvamento manual:", error);
      let errorMessage = "Erro desconhecido";
      if (error instanceof Error) {
        if (error.message.includes('connection')) errorMessage = "Erro de conexão com o banco de dados";
        else if (error.message.includes('foreign key')) errorMessage = "Erro: aluno ou prescrição não encontrados";
        else errorMessage = error.message;
      }
      notify.error("Erro ao salvar sessões", { description: errorMessage });
      throw error;
    } finally { setIsSaving(false); }
  };

  // ─── Close Protection ────────────────────────────────────────

  const handleCloseAttempt = (shouldClose: boolean) => {
    if (dialogState === 'manual-entry' && hasUnsavedChanges({ date, time, trainer, prescriptionId: effectivePrescriptionId, selectedStudents, studentExercises: {} })) {
      const confirmed = window.confirm('⚠️ Você tem alterações não salvas. Seu rascunho foi salvo automaticamente e estará disponível quando você reabrir. Deseja sair mesmo assim?');
      if (!confirmed) return;
    }
    if (!shouldClose) {
      // Reset internal prescription selection so the next open starts clean
      setSelectedPrescriptionId(null);
    }
    onOpenChange(shouldClose);
  };

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dialogState === 'manual-entry' && hasUnsavedChanges({ date, time, trainer, prescriptionId: effectivePrescriptionId, selectedStudents, studentExercises: {} })) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    if (open) {
      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }
  }, [open, dialogState, date, time, trainer, effectivePrescriptionId, selectedStudents, hasUnsavedChanges]);

  // Auto-select students
  useEffect(() => {
    if (open && assignments && enrichedStudents && !hasAutoSelected) {
      const currentDate = new Date();
      const weekdayMap: { [key: number]: string } = { 0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday', 6: 'saturday' };
      const currentWeekday = weekdayMap[currentDate.getDay()];
      const currentTime = getCurrentSessionTimeHHmm();
      const relevantAssignments = assignments.filter(assignment => {
        const customAdaptations = assignment.custom_adaptations;
        if (!isAssignmentScheduleAdaptations(customAdaptations)) return false;
        const hasWeekday = customAdaptations.weekdays?.includes(currentWeekday);
        if (!hasWeekday) return false;
        if (customAdaptations.time) {
          const [assignedHour, assignedMin] = customAdaptations.time.split(':').map(Number);
          const [currentHour, currentMin] = currentTime.split(':').map(Number);
          return Math.abs((assignedHour * 60 + assignedMin) - (currentHour * 60 + currentMin)) <= 5;
        }
        return true;
      });
      const studentsToSelect = enrichedStudents.filter(student => relevantAssignments.some(a => a.student_id === student.id));
      if (studentsToSelect.length > 0) {
        setSelectedStudents(prev => {
          const existingIds = new Set(prev.map(s => s.id));
          const newStudents = studentsToSelect.filter(s => !existingIds.has(s.id));
          return newStudents.length > 0 ? [...prev, ...newStudents] : prev;
        });
        setHasAutoSelected(true);
      }
    }
  }, [open, assignments, enrichedStudents, hasAutoSelected]);

  useEffect(() => {
    if (!open) {
      setDialogState('context-setup');
      setSelectedStudents([]);
      setAccumulatedRecordings([]);
      setCurrentRecordingNumber(1);
      setMergedStudents([]);
      setValidationIssues({ errors: [], warnings: [] });
      setDate(format(new Date(), "yyyy-MM-dd"));
      setTime(getCurrentSessionTimeHHmm());
      setHasAutoSelected(false);
      setTrainer('');
    }
  }, [open]);

  // ─── Add Unmentioned Exercises ────────────────────────────────────────

  const handleAddUnmentionedExercises = () => {
    const prescribedExercises = prescriptionDetails?.exercises?.filter((ex: PrescriptionExerciseDetail) => ex.should_track !== false) || [];
    const updatedMergedStudents = mergedStudents.map(student => {
      const unmentionedExercises = prescribedExercises.filter((prescribed: PrescriptionExerciseDetail) => {
        const prescribedName = (prescribed.exercise_name || prescribed.exercises_library?.name || '').toLowerCase().trim();
        return !student.exercises.some(ex => {
          const executedName = ex.executed_exercise_name.toLowerCase().trim();
          return executedName.includes(prescribedName) || prescribedName.includes(executedName) || executedName === prescribedName;
        }) && prescribedName;
      });
      const newExercises: SessionExercise[] = unmentionedExercises.map((prescribed: PrescriptionExerciseDetail) => ({
        prescribed_exercise_name: prescribed.exercise_name || prescribed.exercises_library?.name,
        executed_exercise_name: prescribed.exercise_name || prescribed.exercises_library?.name || '',
        sets: parseInt(prescribed.sets) || null, reps: null, load_kg: null, load_breakdown: '',
        observations: '⚠️ Exercício prescrito mas não mencionado - preencher manualmente', is_best_set: false,
      }));
      return { ...student, exercises: [...student.exercises, ...newExercises] };
    });
    setMergedStudents(updatedMergedStudents);
    setValidationIssues(validateMergedData(updatedMergedStudents));
    notify.success('Exercícios não mencionados adicionados para edição manual');
  };

  // ─── Render ────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleCloseAttempt}>
      <DialogContent forceMount className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {dialogState === 'context-setup' && NAV_LABELS.recordGroupSession}
            {dialogState === 'mode-selection' && (<><User className="h-5 w-5" />Escolher modo de registro</>)}
            {dialogState === 'recording' && (<><Mic className="h-5 w-5" />🎤 Gravação {currentRecordingNumber}</>)}
            {dialogState === 'manual-entry' && (<><BookOpen className="h-5 w-5" />Registro manual da sessão</>)}
            {dialogState === 'processing' && 'Processando...'}
            {dialogState === 'preview' && 'Preview da sessão'}
            {dialogState === 'edit' && `Editando: ${mergedStudents[editingStudentIndex]?.student_name}`}
          </DialogTitle>
        </DialogHeader>

        {dialogState === 'context-setup' && (
          <div className="space-y-6">
            {!prescriptionId && (
              <div className="space-y-2">
                <Label htmlFor="prescription-select">Prescrição *</Label>
                <Select
                  value={selectedPrescriptionId ?? ''}
                  onValueChange={(value) => {
                    setSelectedPrescriptionId(value);
                    // Reset selected students when prescription changes to avoid mismatched assignments
                    setSelectedStudents([]);
                    setHasAutoSelected(false);
                  }}
                >
                  <SelectTrigger
                    id="prescription-select"
                    className={showValidation && !selectedPrescriptionId ? 'border-destructive' : ''}
                  >
                    <SelectValue placeholder="Selecione uma prescrição em grupo" />
                  </SelectTrigger>
                  <SelectContent>
                    {(prescriptionsList ?? [])
                      .filter((p) => p.prescription_type === 'group')
                      .map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                          {p.assigned_students_count > 0 ? ` · ${p.assigned_students_count} aluno(s)` : ''}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Os alunos atribuídos à prescrição aparecem destacados na lista abaixo.
                </p>
              </div>
            )}

            <SessionSetupForm date={date} time={time} trainerName={trainer} selectedStudents={selectedStudents}
              onDateChange={setDate} onTimeChange={setTime} onTrainerNameChange={setTrainer}
              onStudentToggle={toggleStudent} prescriptionId={effectivePrescriptionId} showValidation={showValidation} />
          </div>
        )}

        {dialogState === 'mode-selection' && (
          <div className="space-y-6 py-8">
            <p className="text-center text-muted-foreground">Escolha como deseja registrar a sessão em grupo:</p>
            <div className="grid gap-4 md:grid-cols-2">
              <Button variant="outline" size="lg" className="h-32 flex flex-col gap-4 items-center justify-center" onClick={() => setDialogState('recording')}>
                <Mic className="h-12 w-12" />
                <div className="text-center">
                  <div className="font-semibold">{NAV_LABELS.recordByVoice}</div>
                  <div className="text-xs text-muted-foreground mt-1">Grave uma única sessão contínua e processe no final</div>
                </div>
              </Button>
              <Button variant="outline" size="lg" className="h-32 flex flex-col gap-4 items-center justify-center" onClick={() => setDialogState('manual-entry')}>
                <BookOpen className="h-12 w-12" />
                <div className="text-center">
                  <div className="font-semibold">{NAV_LABELS.fillManually}</div>
                  <div className="text-xs text-muted-foreground mt-1">Preencha os dados da sessão manualmente</div>
                </div>
              </Button>
            </div>
          </div>
        )}

        {dialogState === 'recording' && (
          <div className="space-y-4">
            {/* Students Header */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Users className="h-4 w-4" /> Alunos Participantes
                  <Badge variant="secondary" className="ml-auto">{selectedStudents.length}</Badge>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setShowAddStudentDialog(true)} className="gap-1.5 h-7">
                    <UserPlus className="h-3.5 w-3.5" /> Adicionar
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {selectedStudents.map(student => {
                    const initials = student.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
                    return (
                      <Badge key={student.id} variant="outline" className="px-3 py-1.5 text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium">{initials}</div>
                          <span>{student.name}</span>
                        </div>
                      </Badge>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Prescription Sidebar + Recorder */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              <div className="lg:col-span-2">
                <PrescriptionSidebar exercises={prescriptionDetails?.exercises || []} />
              </div>
              <div className="lg:col-span-3">
                <MultiSegmentRecorder
                  prescriptionId={effectivePrescriptionId || undefined}
                  selectedStudents={selectedStudents.map(s => ({ id: s.id, name: s.name, weight_kg: s.weight_kg }))}
                  date={date} time={time}
                  onComplete={(segments) => {
                    // Map raw audio data to typed SessionExercise/GroupObservation
                    const mapRawExercise = (raw: { name: string; reps?: number; load_kg?: number; observations?: string }): SessionExercise => ({
                      executed_exercise_name: raw.name,
                      reps: raw.reps ?? null,
                      load_kg: raw.load_kg ?? null,
                      load_breakdown: '',
                      observations: raw.observations ?? null,
                      is_best_set: false,
                    });
                    const mapRawObs = (raw: { observation: string }): GroupObservation => ({
                      observation_text: raw.observation,
                      categories: ['geral'],
                      severity: 'média',
                    });

                    const sessionsByStudent = segments.reduce((acc, segment) => {
                      if (!segment.extractedData?.sessions) return acc;
                      segment.extractedData.sessions.forEach(session => {
                        const mappedExercises = session.exercises.map(mapRawExercise);
                        const mappedObs = session.clinical_observations.map(mapRawObs);
                        const existing = acc.find(s => s.student_name.toLowerCase() === session.student_name.toLowerCase());
                        if (existing) {
                          mappedExercises.forEach(newEx => {
                            const newExName = newEx.executed_exercise_name.toLowerCase().trim();
                            const duplicateIndex = existing.exercises.findIndex(existingEx => {
                              const existingExName = existingEx.executed_exercise_name.toLowerCase().trim();
                              return existingExName === newExName || existingExName.includes(newExName) || newExName.includes(existingExName);
                            });
                            if (duplicateIndex >= 0) {
                              if ((newEx.load_kg || 0) >= (existing.exercises[duplicateIndex].load_kg || 0)) existing.exercises[duplicateIndex] = newEx;
                            } else { existing.exercises.push(newEx); }
                          });
                          existing.clinical_observations = [...existing.clinical_observations, ...mappedObs];
                        } else {
                          acc.push({ student_name: session.student_name, exercises: [...mappedExercises], clinical_observations: [...mappedObs] });
                        }
                      });
                      return acc;
                    }, [] as Array<{ student_name: string; exercises: SessionExercise[]; clinical_observations: GroupObservation[] }>);
                    handleSessionData({ sessions: sessionsByStudent });
                  }}
                  onError={handleError}
                />
              </div>
            </div>
          </div>
        )}

        {dialogState === 'manual-entry' && (
          <ManualEntryWithToggle
            prescriptionDetails={prescriptionDetails}
            selectedStudents={selectedStudents}
            date={date} time={time} trainer={trainer}
            prescriptionId={effectivePrescriptionId || null}
            onSave={handleSaveManual}
            onCancel={() => setDialogState('mode-selection')}
            onAddStudent={() => setShowAddStudentDialog(true)}
          />
        )}

        {dialogState === 'preview' && mergedStudents.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
              <span>📅 {formatSessionDate(date)}</span>
              <span>🕐 {time}</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-base">{accumulatedRecordings.length} gravação(ões) realizada(s)</Badge>
            </div>

            <ValidationAlerts
              errors={validationIssues.errors}
              warnings={validationIssues.warnings}
              showAddUnmentioned={validationIssues.warnings.some(w => w.includes('NÃO mencionado no áudio'))}
              onAddUnmentionedExercises={handleAddUnmentionedExercises}
            />

            <ScrollArea className="max-h-[500px]">
              {mergedStudents.map((student, idx) => (
                <Card key={idx} className="mb-4">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 flex-wrap">
                      <User className="h-5 w-5" /> {student.student_name}
                      <Badge variant="outline" className="text-xs">Gravações: {student.recording_numbers.join(', ')}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {student.clinical_observations.length > 0 && (
                      <ObservationPreview observations={student.clinical_observations} />
                    )}
                    <div>
                      <p className="font-semibold text-sm mb-2">💪 {student.exercises.length} Exercício(s)</p>
                      <div className="space-y-2">
                        {student.exercises.map((ex, exIdx) => (
                          <ExercisePreviewCard key={exIdx} exercise={ex} />
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </ScrollArea>
          </div>
        )}

        {dialogState === 'edit' && mergedStudents[editingStudentIndex] && (
          <ScrollArea className="max-h-[600px] pr-4">
            <div className="space-y-6">
              <ObservationEditor
                observations={editableObservations}
                onObservationsChange={setEditableObservations}
                createEmpty={() => ({ observation_text: '', categories: ['geral'], severity: 'média' as const })}
                renderCategorySelector={(obs, _idx, onChange) => (
                  <Select value={obs.categories?.[0] || 'geral'} onValueChange={(value) => onChange({ ...obs, categories: [value] })}>
                    <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dor">Dor</SelectItem>
                      <SelectItem value="mobilidade">Mobilidade</SelectItem>
                      <SelectItem value="força">Força</SelectItem>
                      <SelectItem value="técnica">Técnica</SelectItem>
                      <SelectItem value="geral">Geral</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />

              <ExerciseEditor
                exercises={editableExercises}
                onExercisesChange={setEditableExercises}
                onOpenExerciseSelection={openExerciseSelection}
              />
            </div>
          </ScrollArea>
        )}

        <DialogFooter>
          {dialogState === 'context-setup' && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button onClick={() => {
                if (!date || !time || !trainer || selectedStudents.length === 0 || !effectivePrescriptionId) {
                  setShowValidation(true);
                  notify.error(
                    !effectivePrescriptionId
                      ? "Selecione uma prescrição antes de continuar"
                      : "Preencha todos os campos obrigatórios"
                  );
                  return;
                }
                setShowValidation(false);
                setDialogState('mode-selection');
              }}>Continuar</Button>
            </>
          )}
          
          {dialogState === 'mode-selection' && (
            <Button variant="outline" onClick={() => setDialogState('context-setup')}>Voltar</Button>
          )}

          {dialogState === 'preview' && (
            <>
              <Button variant="outline" onClick={handleBack} disabled={createGroupSessions.isPending}>Voltar</Button>
              <Button variant="outline" onClick={handleStartEditing}><Pencil className="h-4 w-4 mr-2" />Editar Dados</Button>
              <Button onClick={handleSave} disabled={validationIssues.errors.length > 0 || createGroupSessions.isPending}>
                <Save className="h-4 w-4 mr-2" />{createGroupSessions.isPending ? "Salvando..." : "Salvar Sessão"}
              </Button>
            </>
          )}

          {dialogState === 'edit' && (
            <>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => handleNavigateStudent('prev')} disabled={editingStudentIndex === 0}><ChevronLeft className="h-4 w-4" /></Button>
                <span className="text-sm text-muted-foreground">Aluno {editingStudentIndex + 1} de {mergedStudents.length}</span>
                <Button variant="outline" size="sm" onClick={() => handleNavigateStudent('next')} disabled={editingStudentIndex === mergedStudents.length - 1}><ChevronRight className="h-4 w-4" /></Button>
              </div>
              <Button variant="outline" onClick={() => setDialogState('preview')}>Cancelar</Button>
              <Button onClick={handleSaveEdits}><Save className="h-4 w-4 mr-2" />Salvar Edições</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>

      <ExerciseSelectionDialog open={exerciseSelectionOpen} onOpenChange={setExerciseSelectionOpen}
        currentExerciseName={selectedExerciseForReplacement?.currentName || ""} onExerciseSelected={handleExerciseSelected} autoSuggest={true} />
      <AddStudentDialog open={showAddStudentDialog} onOpenChange={setShowAddStudentDialog} onStudentCreated={handleStudentCreated} />
    </Dialog>
  );
}
