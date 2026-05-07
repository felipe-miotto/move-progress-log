import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Trash, ChevronLeft, ChevronRight, BookOpen, Save, Loader2, History, UserPlus, AlertTriangle } from "lucide-react";
import { ExerciseSelectionDialog } from "./ExerciseSelectionDialog";
import { useSessionDraft } from "@/hooks/useSessionDraft";
import { DraftHistoryDialog } from "./DraftHistoryDialog";
import { SessionDraft } from "@/hooks/useSessionDraftHistory";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { logger } from "@/utils/logger";
import { 
  MIN_LOAD_KG, 
  MAX_LOAD_KG, 
  roundToDecimal,
  isValidLoad,
  getLoadErrorMessage 
} from "@/constants/units";
import { calculateLoadFromBreakdown } from "@/utils/loadCalculation";
import { expandLoadShorthand } from "@/utils/loadShorthand";

type StudentExerciseEntry = {
  exercise_library_id?: string | null;
  exercise_name: string;
  sets: number;
  reps: number;
  load_kg: number | null;
  load_breakdown: string;
  observations: string;
};

type StudentExercisesMap = Record<string, StudentExerciseEntry[]>;

interface ManualSessionEntryProps {
  prescriptionExercises: Array<{
    id: string;
    exercise_library_id?: string | null;
    exercise_name: string;
    sets: string;
    reps: string;
    interval_seconds: number | null;
    pse: string | null;
    training_method: string | null;
    observations: string | null;
    category?: string | null;
  }>;
  selectedStudents: Array<{
    id: string;
    name: string;
    weight_kg?: number;
  }>;
  date: string;
  time: string;
  trainer: string;
  prescriptionId: string | null;
  onSave: (data: {
    studentExercises: Array<{
      studentId: string;
      exercises: Array<{
        exercise_name: string;
        exercise_library_id?: string | null;
        sets: number;
        reps: number;
        load_kg: number | null;
        load_breakdown: string;
        observations: string;
      }>;
    }>;
  }) => Promise<void>;
  onCancel?: () => void;
  onAddStudent?: () => void;
}

export function ManualSessionEntry({
  prescriptionExercises,
  selectedStudents,
  date,
  time,
  trainer,
  prescriptionId,
  onSave,
  onCancel,
  onAddStudent,
}: ManualSessionEntryProps) {
  
  const { draft, saveDraft, clearDraft, restoreDraft, isSaving, lastSaved } = useSessionDraft();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  
  // Estado para controlar o aluno atual (visualização página por página)
  const [currentStudentIndex, setCurrentStudentIndex] = useState(0);
  
  // Estado para dialog de seleção de exercício
  const [exerciseSelectionOpen, setExerciseSelectionOpen] = useState(false);
  const [selectedExerciseForReplacement, setSelectedExerciseForReplacement] = useState<{
    studentId: string;
    exerciseIndex: number;
    currentName: string;
  } | null>(null);
  
  // Estado para armazenar os dados de execução de cada aluno
  const [studentExercises, setStudentExercises] = useState<StudentExercisesMap>(() => {
    // Tentar carregar do rascunho primeiro
    if (draft?.studentExercises) {
      return draft.studentExercises;
    }
    
    // Inicializar com os exercícios da prescrição para cada aluno
    const initial: StudentExercisesMap = {};
    selectedStudents.forEach(student => {
      initial[student.id] = prescriptionExercises.map(ex => ({
        exercise_library_id: ex.exercise_library_id ?? null,
        exercise_name: ex.exercise_name,
        sets: parseInt(ex.sets) || 0,
        reps: parseInt(ex.reps) || 0,
        load_kg: null,
        load_breakdown: '',
        observations: ex.observations || '',
      }));
    });
    return initial;
  });

  // Auto-save quando studentExercises mudar
  useEffect(() => {
    if (Object.keys(studentExercises).length > 0) {
      saveDraft({
        date,
        time,
        trainer,
        prescriptionId,
        selectedStudents,
        studentExercises,
      });
    }
  }, [studentExercises, date, time, trainer, prescriptionId, selectedStudents, saveDraft]);

  // Inicializar exercícios para novos alunos adicionados dinamicamente
  useEffect(() => {
    setStudentExercises(prev => {
      const newStudentExercises = { ...prev };
      let hasNewStudents = false;

      selectedStudents.forEach(student => {
        if (!newStudentExercises[student.id]) {
          // Novo aluno sem exercícios inicializados
          newStudentExercises[student.id] = prescriptionExercises.map(ex => ({
            exercise_library_id: ex.exercise_library_id ?? null,
            exercise_name: ex.exercise_name,
            sets: parseInt(ex.sets) || 0,
            reps: parseInt(ex.reps) || 0,
            load_kg: null,
            load_breakdown: '',
            observations: ex.observations || '',
          }));
          hasNewStudents = true;
        }
      });

      return hasNewStudents ? newStudentExercises : prev;
    });
  }, [selectedStudents, prescriptionExercises]);

  const currentStudent = selectedStudents[currentStudentIndex];

  const updateExercise = (
    studentId: string, 
    exerciseIndex: number, 
    field: keyof StudentExerciseEntry, 
    value: StudentExerciseEntry[keyof StudentExerciseEntry]
  ) => {
    setStudentExercises(prev => {
      const updated = { ...prev };
      updated[studentId] = [...updated[studentId]];
      updated[studentId][exerciseIndex] = {
        ...updated[studentId][exerciseIndex],
        [field]: value
      };
      return updated;
    });
  };

  // Handler centralizado: expande shorthand + calcula load_kg numa única atualização
  const handleLoadBlur = (studentId: string, exerciseIndex: number) => {
    const exercise = studentExercises[studentId]?.[exerciseIndex];
    if (!exercise?.load_breakdown) return;

    const expanded = expandLoadShorthand(exercise.load_breakdown);
    const student = selectedStudents.find(s => s.id === studentId);
    const calculatedLoad = calculateLoadFromBreakdown(expanded, student?.weight_kg);

    setStudentExercises(prev => {
      const updated = { ...prev };
      updated[studentId] = [...updated[studentId]];
      updated[studentId][exerciseIndex] = {
        ...updated[studentId][exerciseIndex],
        load_breakdown: expanded,
        load_kg: calculatedLoad,
      };
      return updated;
    });
  };

  const removeExercise = (studentId: string, exerciseIndex: number) => {
    setStudentExercises(prev => {
      const updated = { ...prev };
      updated[studentId] = updated[studentId].filter((_, i) => i !== exerciseIndex);
      return updated;
    });
  };


  const goToNextStudent = () => {
    if (currentStudentIndex < selectedStudents.length - 1) {
      setCurrentStudentIndex(prev => prev + 1);
    }
  };

  const goToPreviousStudent = () => {
    if (currentStudentIndex > 0) {
      setCurrentStudentIndex(prev => prev - 1);
    }
  };

  // Função para verificar se um exercício precisa de revisão manual
  const needsManualReview = (exercise: typeof studentExercises[string][0]): boolean => {
    return !!exercise.load_breakdown && exercise.load_kg === null;
  };

  // Contar exercícios que precisam de revisão manual para o aluno atual
  const getManualReviewCount = (studentId: string): number => {
    return studentExercises[studentId]?.filter(ex => needsManualReview(ex)).length || 0;
  };

  const handleSubmit = async () => {
    if (isSubmitting) {
      logger.warn('⚠️ Salvamento já em progresso, ignorando clique');
      return;
    }
    
    setIsSubmitting(true);
    
    const data = {
      studentExercises: selectedStudents.map(student => ({
        studentId: student.id,
        exercises: studentExercises[student.id] || []
      }))
    };
    
    try {
      await onSave(data); // ✅ Espera completar
      clearDraft(); // ✅ Limpa APENAS após sucesso confirmado
      // Sucesso já é tratado pelo RecordGroupSessionDialog
    } catch (error) {
      // Erro já foi exibido pelo RecordGroupSessionDialog
      logger.error('❌ Erro ao salvar:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isLoadExemptCategory = (exerciseName: string) => {
    const prescribed = prescriptionExercises.find(pe => pe.exercise_name === exerciseName);
    const cat = prescribed?.category?.toLowerCase() || '';
    return cat === 'respiracao' || cat === 'lmf';
  };

  const isValid = selectedStudents.every(student => 
    studentExercises[student.id]?.every(ex => 
      ex.exercise_library_id && ex.exercise_name && ex.sets > 0 && ex.reps > 0 && (isLoadExemptCategory(ex.exercise_name) || ex.load_breakdown)
    )
  );

  const getValidationErrors = (studentId: string, exerciseIdx: number) => {
    const exercise = studentExercises[studentId]?.[exerciseIdx];
    if (!exercise) return [];
    
    const errors: string[] = [];
    if (!exercise.exercise_name) errors.push("Nome obrigatório");
    if (!exercise.exercise_library_id) errors.push("Selecione um exercício cadastrado");
    if (exercise.sets <= 0) errors.push("Séries deve ser > 0");
    if (exercise.reps <= 0) errors.push("Reps deve ser > 0");
    if (!isLoadExemptCategory(exercise.exercise_name) && !exercise.load_breakdown) errors.push("Descrição da carga obrigatória");
    
    return errors;
  };

  const openExerciseSelection = (studentId: string, exerciseIndex: number) => {
    const exercise = studentExercises[studentId]?.[exerciseIndex];
    if (!exercise) return;
    
    setSelectedExerciseForReplacement({
      studentId,
      exerciseIndex,
      currentName: exercise.exercise_name,
    });
    setExerciseSelectionOpen(true);
  };

  const handleExerciseSelected = (exerciseId: string, exerciseName: string) => {
    if (!selectedExerciseForReplacement) return;
    
    const { studentId, exerciseIndex } = selectedExerciseForReplacement;
    updateExercise(studentId, exerciseIndex, 'exercise_library_id', exerciseId);
    updateExercise(studentId, exerciseIndex, 'exercise_name', exerciseName);
    
    setSelectedExerciseForReplacement(null);
  };

  const handleRestoreDraft = (historicalDraft: SessionDraft) => {
    // Restaurar o rascunho do histórico
    restoreDraft(historicalDraft);
    
    // Atualizar o estado local com os dados restaurados
    setStudentExercises(historicalDraft.studentExercises);
    setCurrentStudentIndex(0); // Reset para o primeiro aluno
  };

  return (
    <div className="space-y-6">
      {/* Indicador de rascunho e auto-save */}
      {(lastSaved || isSaving) && (
        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg text-sm">
          <div className="flex items-center gap-2">
            {isSaving ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                <span className="text-muted-foreground">Salvando rascunho...</span>
              </>
            ) : lastSaved ? (
              <>
                <Save className="h-3 w-3 text-green-600" />
                <span className="text-muted-foreground">
                  Rascunho salvo {formatDistanceToNow(lastSaved, { addSuffix: true, locale: ptBR })}
                </span>
              </>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setHistoryDialogOpen(true)}
              className="text-xs gap-1"
            >
              <History className="h-3 w-3" />
              Histórico
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearDraft}
              className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <Trash className="h-3 w-3 mr-1" />
              Limpar rascunho
            </Button>
          </div>
        </div>
      )}
      
      {/* Botão de adicionar aluno */}
      {onAddStudent && (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onAddStudent}
            className="gap-1.5"
          >
            <UserPlus className="h-4 w-4" />
            Adicionar Aluno
          </Button>
        </div>
      )}

      {/* Navegação entre alunos */}
      <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
        <Button
          variant="outline"
          size="default"
          onClick={goToPreviousStudent}
          disabled={currentStudentIndex === 0}
        >
          <ChevronLeft className="h-4 w-4 mr-2" />
          Anterior
        </Button>

        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            Aluno {currentStudentIndex + 1} de {selectedStudents.length}
          </p>
          <h3 className="text-lg font-semibold">{currentStudent.name}</h3>
          {currentStudent.weight_kg && (
            <p className="text-xs text-muted-foreground">Peso: {currentStudent.weight_kg} kg</p>
          )}
        </div>

        <Button
          variant="outline"
          size="default"
          onClick={goToNextStudent}
          disabled={currentStudentIndex === selectedStudents.length - 1}
        >
          Próximo
          <ChevronRight className="h-4 w-4 ml-2" />
        </Button>
      </div>

      {/* Exercícios do aluno atual */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Exercícios - {currentStudent.name}</span>
            <div className="flex gap-2">
              {getManualReviewCount(currentStudent.id) > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {getManualReviewCount(currentStudent.id)} para revisar
                </Badge>
              )}
              <Badge variant="secondary">
                {studentExercises[currentStudent.id]?.length || 0} exercícios
              </Badge>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {studentExercises[currentStudent.id]?.map((exercise, idx) => {
              const prescribedEx = prescriptionExercises[idx];
              const requiresReview = needsManualReview(exercise);
              return (
                <div key={idx} className={`border-b pb-4 last:border-0 last:pb-0 ${requiresReview ? 'bg-amber-50/50 dark:bg-amber-950/20 rounded-lg p-3 -mx-3' : ''}`}>
                   <div className="flex items-start justify-between mb-3">
                     <div className="flex-1 space-y-2">
                       <div className="flex items-center justify-between">
                         <Label className="text-xs">Nome do Exercício *</Label>
                         <div className="flex gap-1">
                           <Button
                             variant="ghost"
                             size="sm"
                             onClick={() => openExerciseSelection(currentStudent.id, idx)}
                             className="h-9 px-3 gap-1 text-primary hover:text-primary"
                             title="Substituir por exercício cadastrado"
                           >
                             <BookOpen className="h-4 w-4" />
                             <span className="text-xs">Substituir</span>
                           </Button>
                           <Button
                             variant="ghost"
                             size="sm"
                             onClick={() => removeExercise(currentStudent.id, idx)}
                             className="h-9 w-9 p-0 text-destructive hover:text-destructive"
                           >
                             <Trash className="h-4 w-4" />
                           </Button>
                         </div>
                       </div>
                       <Input
                         value={exercise.exercise_name}
                         placeholder="Nome do exercício"
                         className={!exercise.exercise_name || !exercise.exercise_library_id ? "border-destructive" : ""}
                         readOnly
                         title="Use o botão 'Substituir' para trocar o exercício"
                       />
                      {prescribedEx && (
                        <p className="text-xs text-muted-foreground">
                          Prescrito: {prescribedEx.sets} séries × {prescribedEx.reps} reps
                          {prescribedEx.training_method && ` • ${prescribedEx.training_method}`}
                        </p>
                      )}
                      {getValidationErrors(currentStudent.id, idx).length > 0 && (
                        <p className="text-xs text-destructive">
                          {getValidationErrors(currentStudent.id, idx).join(", ")}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <div className="grid gap-3 md:grid-cols-4 mt-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Séries *</Label>
                      <Input
                        type="number"
                        value={exercise.sets}
                        onChange={(e) => updateExercise(currentStudent.id, idx, 'sets', parseInt(e.target.value) || 0)}
                        min="1"
                        className={exercise.sets <= 0 ? "border-destructive" : ""}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Reps *</Label>
                      <Input
                        type="number"
                        value={exercise.reps}
                        onChange={(e) => updateExercise(currentStudent.id, idx, 'reps', parseInt(e.target.value) || 0)}
                        min="1"
                        className={exercise.reps <= 0 ? "border-destructive" : ""}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Descrição Carga {!isLoadExemptCategory(exercise.exercise_name) && '*'}</Label>
                        <Input
                          placeholder="Ex: 20kg, 2x10kg, 10cl b20"
                          value={exercise.load_breakdown}
                          onChange={(e) => updateExercise(currentStudent.id, idx, 'load_breakdown', e.target.value)}
                          onBlur={() => handleLoadBlur(currentStudent.id, idx)}
                          className={!isLoadExemptCategory(exercise.exercise_name) && !exercise.load_breakdown ? "border-destructive" : ""}
                        />
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <Label className="text-xs">Carga (kg)</Label>
                        {requiresReview && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="outline" className="gap-1 text-amber-600 border-amber-600 dark:text-amber-400 dark:border-amber-400 cursor-help">
                                <AlertTriangle className="h-2.5 w-2.5" />
                                Revisar
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p className="font-medium">Carga não calculada automaticamente</p>
                              <p className="text-muted-foreground text-xs mt-1">
                                Verifique a descrição da carga e insira o valor manualmente.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                      <Input
                        type="number"
                        step="0.1"
                        min={MIN_LOAD_KG}
                        max={MAX_LOAD_KG}
                        value={exercise.load_kg || ''}
                        onChange={(e) => {
                          const value = parseFloat(e.target.value) || null;
                          updateExercise(currentStudent.id, idx, 'load_kg', value);
                        }}
                        disabled={exercise.load_breakdown.toLowerCase().includes('peso corporal')}
                        className={requiresReview ? 'border-amber-500 focus-visible:ring-amber-500' : ''}
                      />
                      {requiresReview && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Carga não calculada. Insira manualmente.
                        </p>
                      )}
                      {exercise.load_kg !== null && !isValidLoad(exercise.load_kg) && (
                        <p className="text-xs text-destructive flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {getLoadErrorMessage(exercise.load_kg)}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-2">
                    <Label className="text-xs">Observações</Label>
                    <Textarea
                      placeholder="Observações sobre a execução..."
                      value={exercise.observations}
                      onChange={(e) => updateExercise(currentStudent.id, idx, 'observations', e.target.value)}
                      rows={2}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

      {/* Botões de Ação */}
      <div className="flex justify-between gap-2">
        {onCancel && (
          <Button
            onClick={onCancel}
            variant="outline"
            size="lg"
            disabled={isSubmitting}
          >
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

      {/* Dialog de seleção de exercício */}
      <ExerciseSelectionDialog
        open={exerciseSelectionOpen}
        onOpenChange={setExerciseSelectionOpen}
        currentExerciseName={selectedExerciseForReplacement?.currentName || ""}
        onExerciseSelected={handleExerciseSelected}
        autoSuggest={false}
      />

      {/* Dialog de histórico de rascunhos */}
      <DraftHistoryDialog
        open={historyDialogOpen}
        onOpenChange={setHistoryDialogOpen}
        onRestoreDraft={handleRestoreDraft}
      />
    </div>
  );
}
