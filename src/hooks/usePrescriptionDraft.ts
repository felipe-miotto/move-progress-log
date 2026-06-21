import { useState, useEffect, useCallback, useRef } from 'react';
import { notify } from '@/lib/notify';
import { logger } from '@/utils/logger';
import { usePrescriptionDraftHistory } from './usePrescriptionDraftHistory';

export type PrescriptionType = 'group' | 'individual';

export interface PrescriptionDraftExercise {
  id: string;
  exercise_library_id: string;
  sets: string;
  reps: string;
  interval_seconds: string;
  pse: string;
  training_method: string;
  observations: string;
  group_with_previous: boolean;
  should_track: boolean;
  // load/rir are only persisted for individual prescriptions. Optional so
  // drafts saved before these were tracked still parse from localStorage.
  load?: string;
  rir?: string;
  adaptations: Array<{
    type: "regression_1" | "regression_2" | "regression_3";
    exercise_library_id: string;
  }>;
  showAdaptations: boolean;
}

export interface PrescriptionDraft {
  timestamp: string;
  name: string;
  objective: string;
  // Optional for backward-compat with drafts saved before it was tracked.
  prescriptionType?: PrescriptionType;
  exercises: PrescriptionDraftExercise[];
}

const DEBOUNCE_MS = 1000;
const SAVE_TO_HISTORY_INTERVAL = 60000; // 60 segundos

export function usePrescriptionDraft(entityId?: string) {
  const draftKey = entityId ? `prescription-draft-${entityId}` : 'prescription-draft';
  const { saveDraftToHistory } = usePrescriptionDraftHistory();
  const [draft, setDraft] = useState<PrescriptionDraft | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [lastHistorySave, setLastHistorySave] = useState<Date | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Carregar rascunho ao montar
  useEffect(() => {
    const stored = localStorage.getItem(draftKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as PrescriptionDraft;
        setDraft(parsed);
        setLastSaved(new Date(parsed.timestamp));
      } catch (error) {
        logger.error('Erro ao carregar rascunho:', error);
        localStorage.removeItem(draftKey);
      }
    }
  }, [draftKey]);

  // Salvar rascunho com debounce
  const saveDraft = useCallback((data: Partial<PrescriptionDraft>) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    setIsSaving(true);

    saveTimeoutRef.current = setTimeout(() => {
      const draftData: PrescriptionDraft = {
        timestamp: new Date().toISOString(),
        name: data.name || '',
        objective: data.objective || '',
        prescriptionType: data.prescriptionType,
        exercises: data.exercises || [],
      };

      localStorage.setItem(draftKey, JSON.stringify(draftData));
      setDraft(draftData);
      setLastSaved(new Date());
      setIsSaving(false);

      // Verificar se deve salvar no histórico (a cada 60 segundos)
      const now = Date.now();
      const shouldSaveToHistory = !lastHistorySave || 
        (now - lastHistorySave.getTime() > SAVE_TO_HISTORY_INTERVAL);

      if (shouldSaveToHistory && draftData.exercises.length > 0) {
        saveDraftToHistory(draftData);
        setLastHistorySave(new Date());
      }
    }, DEBOUNCE_MS);
  }, [draftKey, lastHistorySave, saveDraftToHistory]);

  // Limpar rascunho
  const clearDraft = useCallback(() => {
    localStorage.removeItem(draftKey);
    setDraft(null);
    setLastSaved(null);
    setLastHistorySave(null);
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
  }, [draftKey]);

  // INC-007: Comparação campo-a-campo em vez de JSON.stringify
  const hasUnsavedChanges = useCallback((currentData: Partial<PrescriptionDraft>) => {
    if (!draft) return false;
    
    if (
      currentData.name !== draft.name ||
      currentData.objective !== draft.objective ||
      currentData.prescriptionType !== draft.prescriptionType
    ) {
      return true;
    }

    const currentExercises = currentData.exercises || [];
    const draftExercises = draft.exercises || [];

    if (currentExercises.length !== draftExercises.length) return true;

    return currentExercises.some((ex, i) => {
      const d = draftExercises[i];
      return (
        ex.exercise_library_id !== d.exercise_library_id ||
        ex.sets !== d.sets ||
        ex.reps !== d.reps ||
        ex.interval_seconds !== d.interval_seconds ||
        ex.pse !== d.pse ||
        ex.training_method !== d.training_method ||
        ex.observations !== d.observations ||
        ex.group_with_previous !== d.group_with_previous ||
        ex.should_track !== d.should_track ||
        ex.load !== d.load ||
        ex.rir !== d.rir ||
        ex.adaptations?.length !== d.adaptations?.length
      );
    });
  }, [draft]);

  // Restaurar de um rascunho do histórico
  const restoreDraft = useCallback((draftData: PrescriptionDraft) => {
    localStorage.setItem(draftKey, JSON.stringify(draftData));
    setDraft(draftData);
    setLastSaved(new Date(draftData.timestamp));
    notify.success("Rascunho restaurado", {
      description: "Os dados foram carregados do histórico",
    });
  }, [draftKey]);

  // Cleanup ao desmontar
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return {
    draft,
    saveDraft,
    clearDraft,
    restoreDraft,
    isSaving,
    lastSaved,
    hasUnsavedChanges,
  };
}
