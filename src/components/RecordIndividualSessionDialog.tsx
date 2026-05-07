import { useCallback, useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSegmentRecorder } from "./MultiSegmentRecorder";
import { SessionContextForm } from "./SessionContextForm";
import { usePrescriptionDetails } from "@/hooks/usePrescriptions";
import { useCreateWorkoutSession } from "@/hooks/useWorkoutSessions";
import { supabase } from "@/integrations/supabase/client";
import { Mic, Save, BookOpen } from "lucide-react";
import { notify } from "@/lib/notify";
import i18n from "@/i18n/pt-BR.json";
import { useQuery } from "@tanstack/react-query";
import { ExerciseSelectionDialog } from "./ExerciseSelectionDialog";
import { NAV_LABELS } from "@/constants/navigation";
import { calculateLoadFromBreakdown } from "@/utils/loadCalculation";
import { logger } from "@/utils/logger";
import { formatSessionTime, getCurrentSessionTimeHHmm } from "@/utils/sessionTime";
import { buildErrorDescription } from "@/utils/errorParsing";
import { useExercisesLibrary } from "@/hooks/useExercisesLibrary";
import {
  buildUniqueExerciseLibraryMatchMap,
  normalizeExerciseLibraryMatchName,
  resolveExerciseLibraryIdByName,
} from "@/utils/exerciseLibraryMatching";

// Shared types, utilities & components
import {
  MAX_RECORDINGS,
  areSimilarObservations,
  type IndividualObservation,
  type SessionExercise,
  type AccumulatedRecording,
} from "@/types/sessionRecording";
import { useExerciseReplacement } from "@/hooks/useExerciseReplacement";
import { ExerciseEditor } from "@/components/session/ExerciseEditor";
import { ObservationEditor } from "@/components/session/ObservationEditor";
import { ExercisePreviewCard } from "@/components/session/ExercisePreviewCard";
import { ObservationPreview } from "@/components/session/ObservationPreview";
import { format } from "date-fns";

interface RecordIndividualSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  studentName: string;
  existingSessionId?: string | null;
}

type DialogState = 'setup' | 'recording' | 'processing' | 'preview' | 'edit';

interface SessionData {
  sessions: Array<{
    student_name: string;
    clinical_observations?: IndividualObservation[];
    exercises: SessionExercise[];
  }>;
}

interface MergedData {
  clinical_observations: IndividualObservation[];
  exercises: SessionExercise[];
}

export function RecordIndividualSessionDialog({
  open,
  onOpenChange,
  studentId,
  studentName,
  existingSessionId,
}: RecordIndividualSessionDialogProps) {
  const getTodayDate = () => format(new Date(), "yyyy-MM-dd");
  const [dialogState, setDialogState] = useState<DialogState>('setup');
  const [selectedPrescriptionId, setSelectedPrescriptionId] = useState<string | null>(null);
  const [date, setDate] = useState(getTodayDate());
  const [time, setTime] = useState(getCurrentSessionTimeHHmm());
  const [trainerName, setTrainerName] = useState<string>('');
  const [accumulatedRecordings, setAccumulatedRecordings] = useState<AccumulatedRecording<SessionData>[]>([]);
  const [currentRecordingNumber, setCurrentRecordingNumber] = useState(1);
  const [mergedData, setMergedData] = useState<MergedData | null>(null);
  const [editableObservations, setEditableObservations] = useState<IndividualObservation[]>([]);
  const [editableExercises, setEditableExercises] = useState<SessionExercise[]>([]);
  const [existingExercises, setExistingExercises] = useState<SessionExercise[]>([]);

  // Validation states
  const [showValidationDialog, setShowValidationDialog] = useState(false);
  const [exercisesNeedingValidation, setExercisesNeedingValidation] = useState<number[]>([]);

  // Shared exercise replacement hook
  const {
    exerciseSelectionOpen,
    setExerciseSelectionOpen,
    selectedExerciseForReplacement,
    openExerciseSelection,
    handleExerciseSelected,
  } = useExerciseReplacement(editableExercises, setEditableExercises);

  const createSession = useCreateWorkoutSession();
  const isReopening = !!existingSessionId;

  // Fetch student weight for bodyweight calculations
  const { data: studentData } = useQuery({
    queryKey: ['student-weight', studentId],
    queryFn: async () => {
      const { data, error } = await supabase.from('students').select('weight_kg').eq('id', studentId).single();
      if (error) throw error;
      return data;
    },
    enabled: !!studentId,
    staleTime: 5 * 60 * 1000,
    gcTime: 20 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
  const studentWeightKg = studentData?.weight_kg ?? undefined;
  const { data: selectedPrescriptionDetails } = usePrescriptionDetails(selectedPrescriptionId);
  const { data: exercisesLibrary } = useExercisesLibrary();

  const exactExerciseLibraryMatchMap = useMemo(
    () => buildUniqueExerciseLibraryMatchMap(
      exercisesLibrary?.map((exercise) => ({ id: exercise.id, name: exercise.name })) ?? []
    ),
    [exercisesLibrary]
  );

  const prescriptionExerciseLibraryByName = useMemo(() => {
    const matches = new Map<string, string>();
    selectedPrescriptionDetails?.exercises?.forEach((exercise) => {
      if (!exercise.exercise_library_id || !exercise.exercise_name) return;
      matches.set(normalizeExerciseLibraryMatchName(exercise.exercise_name), exercise.exercise_library_id);
    });
    return matches;
  }, [selectedPrescriptionDetails?.exercises]);

  const resolveSessionExerciseLibraryId = useCallback(
    (exercise: SessionExercise): string | null => {
      if (exercise.exercise_library_id) return exercise.exercise_library_id;

      const candidateNames = [exercise.prescribed_exercise_name, exercise.executed_exercise_name];
      for (const name of candidateNames) {
        if (!name) continue;
        const prescriptionMatch = prescriptionExerciseLibraryByName.get(
          normalizeExerciseLibraryMatchName(name)
        );
        if (prescriptionMatch) return prescriptionMatch;
      }

      return resolveExerciseLibraryIdByName(exercise.executed_exercise_name, exactExerciseLibraryMatchMap);
    },
    [exactExerciseLibraryMatchMap, prescriptionExerciseLibraryByName]
  );

  const { data: existingSessionData } = useQuery({
    queryKey: ['existing-session', existingSessionId],
    queryFn: async () => {
      if (!existingSessionId) return null;
      const { data: session, error: sessionError } = await supabase
        .from('workout_sessions')
        .select('id, date, time, trainer_name, prescription_id')
        .eq('id', existingSessionId)
        .single();
      if (sessionError) throw sessionError;
      const { data: exercises, error: exercisesError } = await supabase
        .from('exercises')
        .select('id, session_id, exercise_library_id, exercise_name, sets, reps, load_kg, load_breakdown, observations, is_best_set')
        .eq('session_id', existingSessionId);
      if (exercisesError) throw exercisesError;
      return { session, exercises };
    },
    enabled: !!existingSessionId,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (existingSessionData) {
      const { session, exercises } = existingSessionData;
      setDate(session.date);
      setTime(formatSessionTime(session.time));
      setTrainerName(session.trainer_name || '');
      setSelectedPrescriptionId(session.prescription_id || null);
      if (exercises && exercises.length > 0) {
        const convertedExercises: SessionExercise[] = exercises.map(ex => ({
          exercise_library_id: ex.exercise_library_id ?? null,
          executed_exercise_name: ex.exercise_name, sets: ex.sets, reps: ex.reps || 0,
          load_kg: ex.load_kg, load_breakdown: ex.load_breakdown || '', observations: ex.observations, is_best_set: ex.is_best_set || false,
        }));
        logger.debug('Carregando exercícios existentes:', convertedExercises.length);
        setExistingExercises(convertedExercises);
        setMergedData({ clinical_observations: [], exercises: convertedExercises });
        setEditableExercises(convertedExercises);
      }
    }
  }, [existingSessionData]);

  const { data: prescriptions } = useQuery({
    queryKey: ['student-prescriptions', studentId],
    queryFn: async () => {
      const { data, error } = await supabase.from('prescription_assignments').select(`prescription_id, workout_prescriptions!inner(id, name)`).eq('student_id', studentId);
      if (error) throw error;
      return data;
    },
    enabled: !!studentId,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const prescriptionOptions = [
    { id: null, name: "Sessão Livre (sem prescrição)" },
    ...(prescriptions?.map(p => ({ id: p.prescription_id, name: p.workout_prescriptions.name })) || [])
  ];

  // ─── Merge Logic ────────────────────────────────────────

  const mergeAllRecordings = (recordings: AccumulatedRecording<SessionData>[]): MergedData => {
    logger.debug('[Individual] mergeAllRecordings chamado com', recordings.length, 'recordings');
    const allObservations: IndividualObservation[] = [];
    const allExercises: SessionExercise[] = [];

    recordings.forEach((recording, recIdx) => {
      const session = recording.data.sessions[0];
      if (!session) { logger.warn(`[Individual] Recording ${recIdx + 1} não tem sessão`); return; }

      if (session.clinical_observations) {
        session.clinical_observations.forEach(newObs => {
          if (!allObservations.some(e => areSimilarObservations(e.observation_text, newObs.observation_text))) {
            allObservations.push(newObs);
          }
        });
      }

      if (session.exercises && session.exercises.length > 0) {
        // Preserve exercises with null reps (needs_manual_input) for manual correction
        session.exercises.forEach((ex) => {
          allExercises.push(ex);
        });
      }
    });

    logger.debug(`[Individual] Merge completo: ${allObservations.length} observações, ${allExercises.length} exercícios`);
    return { clinical_observations: allObservations, exercises: allExercises };
  };

  // ─── Handlers ────────────────────────────────────────

  const handleStartRecording = () => {
    if (!trainerName.trim()) { notify.error("Por favor, selecione o treinador antes de continuar"); return; }
    if (!date || !time) { notify.error("Por favor, preencha data e horário antes de continuar"); return; }
    setDialogState('recording');
  };

  useEffect(() => {
    if (!open) {
      setDialogState('setup');
      setSelectedPrescriptionId(null);
      setDate(getTodayDate());
      setTime(getCurrentSessionTimeHHmm());
      setTrainerName('');
      setAccumulatedRecordings([]);
      setCurrentRecordingNumber(1);
      setMergedData(null);
      setExistingExercises([]);
      setEditableObservations([]);
      setEditableExercises([]);
    }
  }, [open]);

  const handleSessionData = (data: SessionData) => {
    logger.debug('[Individual] handleSessionData chamado, recording:', currentRecordingNumber);
    const newRecording: AccumulatedRecording<SessionData> = { recordingNumber: currentRecordingNumber, timestamp: new Date().toISOString(), data };
    const updatedRecordings = [...accumulatedRecordings, newRecording];
    setAccumulatedRecordings(updatedRecordings);
    const merged = mergeAllRecordings(updatedRecordings);

    // Consolidate: existing + new (no duplicates)
    const consolidatedExercises = [...existingExercises];
    merged.exercises.forEach((newEx) => {
      if (!consolidatedExercises.some(ex => ex.executed_exercise_name === newEx.executed_exercise_name && ex.reps === newEx.reps && ex.load_kg === newEx.load_kg)) {
        consolidatedExercises.push(newEx);
      }
    });

    setMergedData({ ...merged, exercises: consolidatedExercises });
    setEditableObservations(merged.clinical_observations);
    setEditableExercises(consolidatedExercises);
    setDialogState('preview');
  };

  const handleError = (error: string) => {
    logger.error("handleError chamado:", error);
    notify.error(i18n.modules.workouts.recordingError, { description: error });
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
    setDialogState('setup');
    setAccumulatedRecordings([]);
    setCurrentRecordingNumber(1);
    setMergedData(null);
    setShowValidationDialog(false);
    setExercisesNeedingValidation([]);
  };

  // ─── Validation ────────────────────────────────────────

  const validateExercisesBeforeSave = () => {
    const invalidExercises: number[] = [];
    editableExercises.forEach((ex, idx) => {
      const criticalIssues = [];
      if (!ex.executed_exercise_name.trim()) criticalIssues.push('Nome vazio');
      if (!resolveSessionExerciseLibraryId(ex)) criticalIssues.push('Vincular ao catálogo');
      if (!selectedPrescriptionId && (ex.sets === null || ex.sets === 0)) criticalIssues.push('Séries obrigatórias (treino livre)');
      if (!ex.load_breakdown || ex.load_kg === null || ex.load_kg === 0) criticalIssues.push('Carga não informada');
      if (ex.reps === null || ex.reps === 0) criticalIssues.push('Reps não informadas');
      if (criticalIssues.length > 0) {
        invalidExercises.push(idx);
        logger.debug(`Exercício #${idx + 1} (${ex.executed_exercise_name || 'SEM NOME'}):`, criticalIssues);
      }
    });
    if (invalidExercises.length > 0) { setExercisesNeedingValidation(invalidExercises); setShowValidationDialog(true); return false; }
    return true;
  };

  // ─── Save ────────────────────────────────────────

  const handleSave = async () => {
    if (!mergedData) return;
    if (!validateExercisesBeforeSave()) return;

    try {
      let sessionId: string;
      if (isReopening && existingSessionId) {
        const { error: deleteExercisesError } = await supabase
          .from('exercises')
          .delete()
          .eq('session_id', existingSessionId);
        if (deleteExercisesError) throw deleteExercisesError;

        const { error: updateError } = await supabase.from('workout_sessions').update({ trainer_name: trainerName, is_finalized: true, updated_at: new Date().toISOString() }).eq('id', existingSessionId);
        if (updateError) throw updateError;
        sessionId = existingSessionId;
        notify.info("Atualizando sessão existente", { description: "Substituindo exercícios com dados consolidados" });
      } else {
        const { data: session, error: sessionError } = await supabase.from('workout_sessions').insert({ student_id: studentId, prescription_id: selectedPrescriptionId, date, time, trainer_name: trainerName, is_finalized: true, session_type: 'individual' }).select('id').single();
        if (sessionError) throw sessionError;
        sessionId = session.id;
      }

      const exercises = editableExercises.map(ex => ({
        session_id: sessionId,
        exercise_library_id: resolveSessionExerciseLibraryId(ex),
        exercise_name: ex.executed_exercise_name,
        sets: ex.sets,
        reps: ex.reps,
        load_kg: ex.load_kg,
        load_breakdown: ex.load_breakdown,
        observations: ex.observations,
        is_best_set: ex.is_best_set,
      }));
      const { error: exercisesError } = await supabase.from('exercises').insert(exercises);
      if (exercisesError) throw exercisesError;

      if (accumulatedRecordings.length > 0) {
        const audioSegments = accumulatedRecordings
          .filter((recording) => recording.rawTranscription)
          .map((recording) => ({ session_id: sessionId, segment_order: recording.recordingNumber, raw_transcription: recording.rawTranscription || 'Sem transcrição disponível', edited_transcription: recording.editedTranscription || null }));
        if (audioSegments.length > 0) {
          const { error: segmentsError } = await supabase.from('session_audio_segments').insert(audioSegments);
          if (segmentsError) { logger.error('Error saving audio segments:', segmentsError); notify.warning("Aviso", { description: "Segmentos de áudio não foram salvos, mas a sessão foi criada com sucesso" }); }
        }
      }

      if (editableObservations && editableObservations.length > 0) {
        const observations = editableObservations.map(obs => ({ student_id: studentId, session_id: sessionId, observation_text: obs.observation_text, categories: obs.category ? [obs.category] : null, severity: obs.severity }));
        const { error: observationsError } = await supabase.from('student_observations').insert(observations);
        if (observationsError) throw observationsError;
      }

      notify.success(isReopening ? "Sessão atualizada com sucesso" : i18n.modules.workouts.sessionCreated, { description: isReopening ? "Novos dados adicionados à sessão" : `${accumulatedRecordings.length} ${i18n.modules.workouts.recording}` });
      onOpenChange(false);
    } catch (error: unknown) {
      logger.error('Error saving session:', error);
      notify.error(i18n.feedback.genericError, { description: buildErrorDescription(error) || "Tente novamente" });
    }
  };

  // ─── Render ────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent forceMount className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mic className="h-5 w-5" />
            {dialogState === 'setup' && (isReopening ? `Continuar sessão - ${studentName}` : `${NAV_LABELS.recordIndividualSession} - ${studentName}`)}
            {dialogState === 'recording' && `🎤 Gravação ${currentRecordingNumber} - ${studentName}`}
            {dialogState === 'preview' && (isReopening ? `Atualizando sessão - ${studentName}` : `Preview da sessão - ${studentName}`)}
          </DialogTitle>
          
          {/* Step indicator */}
          <div className="flex items-center gap-2 pt-2">
            {['Configurar', 'Gravar', 'Revisar'].map((step, i) => {
              const stepMap: Record<DialogState, number> = { setup: 0, recording: 1, processing: 2, preview: 2, edit: 2 };
              const currentStep = stepMap[dialogState];
              const isCompleted = i < currentStep;
              const isCurrent = i === currentStep;
              return (
                <div key={step} className="flex items-center gap-2 flex-1">
                  <div className="flex flex-col items-center gap-1 flex-1">
                    <div className={`h-1.5 w-full rounded-full transition-colors ${isCompleted ? 'bg-primary' : isCurrent ? 'bg-primary/50' : 'bg-muted'}`} />
                    <span className={`text-xs ${isCurrent ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>{step}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </DialogHeader>

        {dialogState === 'setup' && (
          <div className="space-y-4">
            <SessionContextForm trainerName={trainerName} date={date} time={time} onTrainerNameChange={setTrainerName} onDateChange={setDate} onTimeChange={setTime} />
            <div className="space-y-2">
              <Label>Prescrição</Label>
              <Select value={selectedPrescriptionId || "null"} onValueChange={(value) => setSelectedPrescriptionId(value === "null" ? null : value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {prescriptionOptions.map((option) => (
                    <SelectItem key={option.id || "null"} value={option.id || "null"}>{option.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {dialogState === 'recording' && (
          <MultiSegmentRecorder
            prescriptionId={selectedPrescriptionId || undefined}
            selectedStudents={[{ id: studentId, name: studentName, weight_kg: studentWeightKg }]}
            date={date} time={time}
            onComplete={(segments) => {
              const allObservations: IndividualObservation[] = [];
              const allExercises: SessionExercise[] = [];
              segments.forEach(segment => {
                if (segment.extractedData?.sessions) {
                  segment.extractedData.sessions.forEach(session => {
                    if (session.clinical_observations) {
                      session.clinical_observations.forEach(obs => {
                        allObservations.push({ observation_text: obs.observation, category: 'geral', severity: 'baixa' });
                      });
                    }
                    if (session.exercises) {
                      session.exercises.forEach(ex => {
                        allExercises.push({
                          exercise_library_id: ex.exercise_library_id ?? null,
                          executed_exercise_name: ex.name, reps: ex.reps ?? null, load_kg: ex.load_kg ?? null,
                          load_breakdown: '', observations: ex.observations ?? null, is_best_set: false,
                        });
                      });
                    }
                  });
                }
              });
              const recordingsData: AccumulatedRecording<SessionData>[] = segments.map((seg) => ({
                recordingNumber: seg.segmentOrder, timestamp: new Date().toISOString(),
                rawTranscription: seg.rawTranscription, editedTranscription: seg.editedTranscription,
                data: { sessions: [{ student_name: studentName, clinical_observations: [], exercises: [] }] }
              }));
              setAccumulatedRecordings(recordingsData);
              handleSessionData({ sessions: [{ student_name: studentName, clinical_observations: allObservations, exercises: allExercises }] });
            }}
            onError={handleError}
          />
        )}

        {dialogState === 'preview' && mergedData && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-base">{accumulatedRecordings.length} gravação(ões) realizada(s)</Badge>
            </div>
            <Alert><AlertDescription>Revise os dados consolidados antes de salvar</AlertDescription></Alert>

            <ObservationPreview observations={mergedData.clinical_observations} />

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">💪 Exercícios Executados ({mergedData.exercises.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {mergedData.exercises.map((ex, idx) => (
                    <ExercisePreviewCard key={idx} exercise={ex} />
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {dialogState === 'edit' && (
          <div className="space-y-4">
            <ObservationEditor
              observations={editableObservations}
              onObservationsChange={setEditableObservations}
              createEmpty={() => ({ observation_text: '', category: 'geral' as const, severity: 'baixa' as const })}
              renderCategorySelector={(obs, _idx, onChange) => (
                <Select value={obs.category} onValueChange={(value) => onChange({ ...obs, category: value as IndividualObservation["category"] })}>
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
              requireSets={!selectedPrescriptionId}
              autoCalculateLoad={true}
            />
          </div>
        )}

        <DialogFooter>
          {dialogState === 'setup' && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button onClick={handleStartRecording}><Mic className="h-4 w-4 mr-2" />Iniciar Gravação</Button>
            </>
          )}

          {dialogState === 'preview' && (
            <>
              <Button variant="ghost" onClick={handleBack}>← Voltar</Button>
              <Button variant="outline" onClick={() => setDialogState('edit')}>✏️ Editar Dados</Button>
              <Button variant="outline" onClick={handleAddAnotherRecording} disabled={!mergedData || accumulatedRecordings.length >= MAX_RECORDINGS}>
                <Mic className="h-4 w-4 mr-2" />Adicionar Gravação
              </Button>
              <Button onClick={() => { if (!validateExercisesBeforeSave()) return; handleSave(); }}>
                <Save className="h-4 w-4 mr-2" />Finalizar e Salvar
              </Button>
            </>
          )}

          {dialogState === 'edit' && (
            <>
              <Button variant="outline" onClick={() => { if (mergedData) { setEditableObservations(mergedData.clinical_observations); setEditableExercises(mergedData.exercises); } setDialogState('preview'); }}>← Cancelar Edição</Button>
              <Button onClick={() => {
                if (!validateExercisesBeforeSave()) return;
                setMergedData({ clinical_observations: editableObservations, exercises: editableExercises });
                setDialogState('preview');
                notify.success("Edições aplicadas", { description: "Dados validados e prontos para salvar" });
              }}>✅ Aplicar Edições</Button>
            </>
          )}
        </DialogFooter>

        {/* Validation Alert */}
        {showValidationDialog && (
          <Alert className="mt-4 border-red-500 bg-red-50 dark:bg-red-950 dark:border-red-700">
            <AlertDescription>
              <div className="space-y-3">
                <p className="font-semibold text-red-900 dark:text-red-100">❌ Campos obrigatórios não preenchidos</p>
                <div className="space-y-2">
                  {exercisesNeedingValidation.map(idx => {
                    const ex = editableExercises[idx];
                    const issues = [];
                    if (!ex.executed_exercise_name.trim()) issues.push("Nome do exercício");
                    if (!resolveSessionExerciseLibraryId(ex)) issues.push("Vínculo com a biblioteca de exercícios");
                    if (!selectedPrescriptionId && (ex.sets === null || ex.sets === 0)) issues.push("Número de séries (obrigatório em treinos livres)");
                    if (!ex.load_breakdown || ex.load_kg === null || ex.load_kg === 0) issues.push("Carga (obrigatório)");
                    if (ex.reps === null || ex.reps === 0) issues.push("Repetições (obrigatório)");
                    return (
                      <div key={idx} className="text-sm text-destructive bg-destructive/10 p-sm rounded-radius-md border border-destructive/20">
                        <strong>Exercício #{idx + 1}:</strong> {ex.executed_exercise_name || '(sem nome)'}
                        <ul className="list-disc list-inside ml-lg mt-xs">
                          {issues.map((issue, i) => (<li key={i}>{issue}</li>))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-end mt-4">
                  <Button size="sm" onClick={() => { setShowValidationDialog(false); setDialogState('edit'); notify.error("Corrija os campos obrigatórios", { description: "Complete todos os dados antes de salvar" }); }} variant="destructive">✏️ Corrigir Agora</Button>
                </div>
              </div>
            </AlertDescription>
          </Alert>
        )}
      </DialogContent>

      <ExerciseSelectionDialog open={exerciseSelectionOpen} onOpenChange={setExerciseSelectionOpen}
        currentExerciseName={selectedExerciseForReplacement?.currentName || ""} onExerciseSelected={handleExerciseSelected} autoSuggest={true} />
    </Dialog>
  );
}
