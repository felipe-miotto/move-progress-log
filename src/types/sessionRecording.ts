// Shared types for session recording dialogs (Group & Individual)

export type Severity = 'baixa' | 'média' | 'alta';
export type ObservationCategory = 'dor' | 'mobilidade' | 'força' | 'técnica' | 'geral';

// Group observations use categories: string[], individual uses category: string
export interface GroupObservation {
  observation_text: string;
  categories: string[];
  severity: Severity;
}

export interface IndividualObservation {
  observation_text: string;
  category: ObservationCategory;
  severity: Severity;
}

export interface SessionExercise {
  prescribed_exercise_name?: string | null;
  exercise_library_id?: string | null;
  executed_exercise_name: string;
  sets?: number | null;
  reps: number | null;
  reserve_reps?: string | null;
  load_kg?: number | null;
  load_breakdown: string;
  observations?: string | null;
  is_best_set: boolean;
  needs_manual_input?: boolean;
}

export interface AccumulatedRecording<T = unknown> {
  recordingNumber: number;
  timestamp: string;
  data: T;
  rawTranscription?: string;
  editedTranscription?: string;
}

export const MAX_RECORDINGS = 10;

// Utility functions
export const areSimilarObservations = (obs1: string, obs2: string): boolean => {
  const normalize = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');
  const n1 = normalize(obs1);
  const n2 = normalize(obs2);
  
  if (n1 === n2) return true;
  
  const shorter = n1.length < n2.length ? n1 : n2;
  const longer = n1.length >= n2.length ? n1 : n2;
  
  return longer.includes(shorter) && (shorter.length / longer.length) > 0.8;
};

export const getSeverityVariant = (severity: string): "destructive" | "default" | "secondary" => {
  switch (severity) {
    case 'alta': return 'destructive';
    case 'média': return 'default';
    case 'baixa': return 'secondary';
    default: return 'secondary';
  }
};

export const getCategoryIcon = (category: string) => {
  return category.charAt(0).toUpperCase();
};
