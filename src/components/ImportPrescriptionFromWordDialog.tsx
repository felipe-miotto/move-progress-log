import { useState, useCallback, useMemo, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, FileText, CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronRight, PlusCircle, Folder } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCreatePrescription } from "@/hooks/usePrescriptions";
import { useExercisesLibrary } from "@/hooks/useExercisesLibrary";
import { useFolders, flattenFolderTree } from "@/hooks/useFolders";
import { notify } from "@/lib/notify";
import { logger } from "@/utils/logger";
import { buildErrorDescription } from "@/utils/errorParsing";
import { ExerciseCombobox } from "@/components/ExerciseCombobox";
import { AddExerciseDialog, type ExerciseDefaultValues } from "@/components/AddExerciseDialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ParsedExercise {
  name: string;
  sets: string;
  reps: string;
  interval_seconds?: number | null;
  pse?: string | null;
  training_method?: string | null;
  group_with_previous?: boolean;
  observations?: string | null;
  matches: Array<{ id: string; name: string; similarity: number }>;
  matched_exercise_id: string | null;
  matched_exercise_name: string | null;
  match_confidence: number;
}

interface ParsedPrescription {
  name: string;
  objective: string;
  day_of_week?: string;
  exercises: ParsedExercise[];
}

type Step = "upload" | "parsing" | "review";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportPrescriptionFromWordDialog({ open, onOpenChange }: Props) {
  const [step, setStep] = useState<Step>("upload");
  const [prescriptions, setPrescriptions] = useState<ParsedPrescription[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [expandedExercises, setExpandedExercises] = useState<Set<number>>(new Set());
  const [isDragOver, setIsDragOver] = useState(false);
  const [addExerciseDialogOpen, setAddExerciseDialogOpen] = useState(false);
  const [addExerciseDefaultName, setAddExerciseDefaultName] = useState("");
  const [addExerciseDefaultValues, setAddExerciseDefaultValues] = useState<ExerciseDefaultValues | undefined>();
  const [addExerciseTargetIdx, setAddExerciseTargetIdx] = useState<number | null>(null);
  // Destination folder applied to every prescription saved from this batch.
  // null = root (no folder).
  const [folderId, setFolderId] = useState<string | null>(null);
  // Confirmation dialog shown when the user tries to dismiss the import
  // mid-review (ESC / click outside / X / Cancel). Prevents losing work.
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  // Indexes of prescription tabs already saved in this session — used to
  // prevent duplicate creates, mark tabs as "Salva", and tailor the close
  // confirmation to the partial/all-saved/none-saved states.
  const [savedIndexes, setSavedIndexes] = useState<Set<number>>(new Set());
  // Re-entry guard against double-submit between click and state flush.
  const submittingRef = useRef(false);
  const createPrescription = useCreatePrescription();
  const { data: exercisesLibrary } = useExercisesLibrary();
  const { data: folders } = useFolders();
  const flatFolders = useMemo(
    () => (folders ? flattenFolderTree(folders) : []),
    [folders],
  );

  const resetState = () => {
    setStep("upload");
    setPrescriptions([]);
    setSelectedIndex(0);
    setExpandedExercises(new Set());
    setFolderId(null);
    setSavedIndexes(new Set());
    submittingRef.current = false;
  };

  // "Trabalho a perder" considera apenas abas que ainda não foram salvas.
  // Se o usuário já salvou todas, hasUnsavedWork == false e o close passa
  // direto sem confirmação. Se salvou algumas e ainda há pendentes, a
  // confirmação muda de texto (ver AlertDialog).
  const hasUnsavedWork =
    step === "review" && prescriptions.length > savedIndexes.size;
  const hasAnySaved = savedIndexes.size > 0;
  const allSaved =
    step === "review" &&
    prescriptions.length > 0 &&
    savedIndexes.size === prescriptions.length;

  const handleClose = (open: boolean) => {
    // Guard against accidental dismiss (ESC, click outside, X, Cancel)
    // while there is still unsaved work. Initial / parsing / all-saved
    // states close normally because there is nothing to lose.
    if (!open && hasUnsavedWork) {
      setConfirmDiscardOpen(true);
      return;
    }
    if (!open) resetState();
    onOpenChange(open);
  };

  const handleConfirmDiscard = () => {
    setConfirmDiscardOpen(false);
    resetState();
    onOpenChange(false);
  };

  const processFile = async (file: File) => {
    if (!file.name.endsWith(".docx")) {
      notify.error("Formato inválido", { description: "Apenas arquivos .docx são suportados." });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      notify.error("Arquivo muito grande", { description: "O limite é 10MB." });
      return;
    }

    setStep("parsing");

    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);

      const { data, error } = await supabase.functions.invoke("parse-word-prescription", {
        body: { fileBase64: base64 },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (!data?.prescriptions || data.prescriptions.length === 0) {
        notify.error("Nenhum treino encontrado", { description: "O documento não contém treinos identificáveis." });
        setStep("upload");
        return;
      }

      setPrescriptions(data.prescriptions);
      setSelectedIndex(0);
      setStep("review");
    } catch (err: unknown) {
      const message = buildErrorDescription(err) || "Erro desconhecido ao processar arquivo.";
      logger.error("Import error:", err);
      notify.error("Erro ao processar arquivo", { description: message });
      setStep("upload");
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleExerciseMatch = (exerciseIdx: number, exerciseId: string, exerciseName: string) => {
    setPrescriptions(prev => {
      const updated = [...prev];
      const prescription = { ...updated[selectedIndex] };
      const exercises = [...prescription.exercises];
      exercises[exerciseIdx] = {
        ...exercises[exerciseIdx],
        matched_exercise_id: exerciseId,
        matched_exercise_name: exerciseName,
        match_confidence: 100,
      };
      prescription.exercises = exercises;
      updated[selectedIndex] = prescription;
      return updated;
    });
  };

  const handleConfirm = async (index: number) => {
    // Anti-duplicação: nunca criar a mesma aba duas vezes nesta sessão e
    // bloquear cliques duplos enquanto o save em curso ainda não resolveu.
    if (submittingRef.current) return;
    if (savedIndexes.has(index)) return;

    const prescription = prescriptions[index];
    const validExercises = prescription.exercises.filter(ex => ex.matched_exercise_id);

    if (validExercises.length === 0) {
      notify.error("Nenhum exercício vinculado", {
        description: "Vincule pelo menos um exercício da biblioteca antes de confirmar.",
      });
      return;
    }

    submittingRef.current = true;
    try {
      await createPrescription.mutateAsync({
        name: prescription.name,
        objective: prescription.objective,
        folder_id: folderId,
        exercises: validExercises.map(ex => ({
          exercise_library_id: ex.matched_exercise_id!,
          sets: ex.sets,
          reps: ex.reps,
          interval_seconds: ex.interval_seconds || undefined,
          pse: ex.pse || undefined,
          training_method: ex.training_method || undefined,
          observations: ex.observations || undefined,
          group_with_previous: ex.group_with_previous || false,
        })),
      });

      notify.success(`Prescrição "${prescription.name}" criada com sucesso!`);

      // Marca a aba como salva e, se houver pendente, avança para ela.
      const newSaved = new Set(savedIndexes);
      newSaved.add(index);
      setSavedIndexes(newSaved);

      const remaining = prescriptions
        .map((_, i) => i)
        .filter(i => !newSaved.has(i));
      if (remaining.length > 0) {
        const next = remaining.find(i => i > index) ?? remaining[0];
        setSelectedIndex(next);
      }
    } catch (err: unknown) {
      const message = buildErrorDescription(err) || "Erro desconhecido ao criar prescrição.";
      notify.error("Erro ao criar prescrição", { description: message });
    } finally {
      submittingRef.current = false;
    }
  };

  const getConfidenceBadge = (confidence: number, matched: boolean) => {
    if (!matched) return <Badge variant="destructive" className="text-xs"><XCircle className="h-3 w-3 mr-1" />Sem match</Badge>;
    if (confidence >= 70) return <Badge className="bg-emerald-600 text-xs"><CheckCircle2 className="h-3 w-3 mr-1" />{confidence}%</Badge>;
    if (confidence >= 40) return <Badge className="bg-amber-500 text-xs"><AlertTriangle className="h-3 w-3 mr-1" />{confidence}%</Badge>;
    return <Badge variant="destructive" className="text-xs"><XCircle className="h-3 w-3 mr-1" />{confidence}%</Badge>;
  };

  const currentPrescription = prescriptions[selectedIndex];
  const matchedCount = currentPrescription?.exercises.filter(e => e.matched_exercise_id).length ?? 0;
  const totalCount = currentPrescription?.exercises.length ?? 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Importar Prescrição do Word</DialogTitle>
          <DialogDescription>
            {step === "upload" && "Faça upload de um arquivo .docx para extrair automaticamente os treinos."}
            {step === "parsing" && "Processando o documento..."}
            {step === "review" && `Revise os exercícios extraídos antes de confirmar. ${matchedCount}/${totalCount} vinculados.`}
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div
            className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors cursor-pointer ${
              isDragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
            }`}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={() => document.getElementById("word-file-input")?.click()}
          >
            <Upload className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
            <p className="text-sm font-medium mb-1">Arraste um arquivo .docx aqui</p>
            <p className="text-xs text-muted-foreground">ou clique para selecionar</p>
            <input
              id="word-file-input"
              type="file"
              accept=".docx"
              className="hidden"
              onChange={handleFileInput}
            />
          </div>
        )}

        {step === "parsing" && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Extraindo exercícios e vinculando à biblioteca...</p>
            <p className="text-xs text-muted-foreground">Isso pode levar alguns segundos.</p>
          </div>
        )}

        {step === "review" && currentPrescription && (
          <div className="flex flex-col min-h-0 flex-1 space-y-3">
            {/* Prescription selector tabs — cada aba é uma prescrição
                separada; cada uma é salva individualmente. */}
            {prescriptions.length > 1 && (
              <div className="flex flex-col gap-1.5 shrink-0">
                <p className="text-xs text-muted-foreground">
                  Cada aba é uma prescrição separada. Revise e salve uma de cada vez.
                </p>
                <div className="flex gap-2 flex-wrap">
                  {prescriptions.map((p, i) => {
                    const isSaved = savedIndexes.has(i);
                    return (
                      <Button
                        key={i}
                        size="sm"
                        variant={i === selectedIndex ? "default" : "outline"}
                        onClick={() => setSelectedIndex(i)}
                        className="text-xs gap-1.5"
                      >
                        {isSaved && (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        )}
                        <span>{p.name}</span>
                        <span
                          className={`text-[10px] uppercase tracking-wide ${
                            isSaved ? "text-emerald-600 dark:text-emerald-400" : "opacity-60"
                          }`}
                        >
                          {isSaved ? "Salva" : "Pendente"}
                        </span>
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Completion banner when every tab has been saved. */}
            {allSaved && (
              <div className="rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20 p-3 text-sm flex items-center gap-2 shrink-0">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span className="font-medium">
                  Importação concluída — todas as prescrições foram criadas.
                </span>
              </div>
            )}

            {/* Folder destination — applies to every prescription saved
                from this import batch. */}
            <div className="space-y-1.5 shrink-0">
              <Label
                htmlFor="import-folder"
                className="text-xs font-medium flex items-center gap-1.5"
              >
                <Folder className="h-3.5 w-3.5" />
                Pasta destino
              </Label>
              <Select
                value={folderId ?? "root"}
                onValueChange={(value) => setFolderId(value === "root" ? null : value)}
              >
                <SelectTrigger id="import-folder">
                  <SelectValue placeholder="Raiz (sem pasta)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="root">📁 Raiz (sem pasta)</SelectItem>
                  {flatFolders.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      <span style={{ paddingLeft: `${f.level * 12}px` }}>
                        {f.level > 0 && "└ "}
                        {f.full_path || f.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Prescription info */}
            <div className="bg-muted/50 rounded-lg p-3 space-y-1 shrink-0">
              <p className="font-medium text-sm">{currentPrescription.name}</p>
              {currentPrescription.objective && (
                <p className="text-xs text-muted-foreground">Objetivo: {currentPrescription.objective}</p>
              )}
              {currentPrescription.day_of_week && (
                <p className="text-xs text-muted-foreground">Dias: {currentPrescription.day_of_week}</p>
              )}
            </div>

            {/* Exercises list */}
            <div className="flex-1 min-h-0 overflow-y-auto pr-1">
              <div className="space-y-2">
                {currentPrescription.exercises.map((exercise, idx) => (
                  <Collapsible
                    key={idx}
                    open={expandedExercises.has(idx)}
                    onOpenChange={(open) => {
                      setExpandedExercises(prev => {
                        const next = new Set(prev);
                        if (open) { next.add(idx); } else { next.delete(idx); }
                        return next;
                      });
                    }}
                  >
                    <div className={`rounded-lg border p-3 ${
                      exercise.group_with_previous ? "ml-4 border-l-2 border-l-primary/50" : ""
                    }`}>
                      <CollapsibleTrigger className="w-full">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {expandedExercises.has(idx) ? (
                              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                            )}
                            <span className="text-sm font-medium truncate text-left">
                              {exercise.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-muted-foreground">
                              {exercise.sets}×{exercise.reps}
                            </span>
                            {getConfidenceBadge(exercise.match_confidence, !!exercise.matched_exercise_id)}
                          </div>
                        </div>
                      </CollapsibleTrigger>

                      <CollapsibleContent className="mt-3 space-y-2">
                        {/* Match details */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-muted-foreground">Exercício na biblioteca:</label>
                          {exercise.matched_exercise_id ? (
                            <div className="flex items-center gap-2">
                              <span className="text-sm flex-1">{exercise.matched_exercise_name}</span>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-xs h-7"
                                onClick={() => {
                                  setPrescriptions(prev => {
                                    const updated = [...prev];
                                    const prescription = { ...updated[selectedIndex] };
                                    const exercises = [...prescription.exercises];
                                    exercises[idx] = {
                                      ...exercises[idx],
                                      matched_exercise_id: null,
                                      matched_exercise_name: null,
                                      match_confidence: 0,
                                    };
                                    prescription.exercises = exercises;
                                    updated[selectedIndex] = prescription;
                                    return updated;
                                  });
                                }}
                              >
                                Alterar
                              </Button>
                            </div>
                          ) : (
                            <div className="flex gap-2 items-start">
                              <div className="flex-1">
                                <ExerciseCombobox
                                  exercises={(exercisesLibrary || []).map(e => ({ id: e.id, name: e.name }))}
                                  value=""
                                  onValueChange={(id) => {
                                    const ex = exercisesLibrary?.find(e => e.id === id);
                                    if (ex) handleExerciseMatch(idx, ex.id, ex.name);
                                  }}
                                />
                              </div>
                              <Button
size="sm"
                                variant="outline"
                                className="text-xs h-9 gap-1 shrink-0"
                                onClick={() => {
                                  setAddExerciseDefaultName(exercise.name);
                                  // Find the best match candidate and inherit its metadata
                                  const bestMatch = exercise.matches[0];
                                  const sourceExercise = bestMatch
                                    ? exercisesLibrary?.find(e => e.id === bestMatch.id)
                                    : null;
                                  if (sourceExercise) {
                                    setAddExerciseDefaultValues({
                                      movementPattern: sourceExercise.movement_pattern || "",
                                      laterality: sourceExercise.laterality || "",
                                      movementPlane: sourceExercise.movement_plane || "",
                                      contractionType: sourceExercise.contraction_type || "",
                                      boyleScore: sourceExercise.boyle_score?.toString() || "",
                                      axialLoad: sourceExercise.axial_load?.toString() || "",
                                      lumbarDemand: sourceExercise.lumbar_demand?.toString() || "",
                                      technicalComplexity: sourceExercise.technical_complexity?.toString() || "",
                                      metabolicPotential: sourceExercise.metabolic_potential?.toString() || "",
                                      kneeDominance: sourceExercise.knee_dominance?.toString() || "",
                                      hipDominance: sourceExercise.hip_dominance?.toString() || "",
                                      emphasis: sourceExercise.emphasis || "",
                                      description: sourceExercise.description || "",
                                      videoUrl: sourceExercise.video_url || "",
                                      riskLevel: sourceExercise.risk_level || "",
                                      category: sourceExercise.category || "",
                                      subcategory: sourceExercise.subcategory || "",
                                      defaultSets: sourceExercise.default_sets || "",
                                      defaultReps: sourceExercise.default_reps || "",
                                      selectedEquipment: sourceExercise.equipment_required || [],
                                      stabilityPosition: sourceExercise.stability_position || "",
                                      surfaceModifier: sourceExercise.surface_modifier || "",
                                    });
                                  } else {
                                    setAddExerciseDefaultValues(undefined);
                                  }
                                  setAddExerciseTargetIdx(idx);
                                  setAddExerciseDialogOpen(true);
                                }}
                              >
                                <PlusCircle className="h-3.5 w-3.5" />
                                Cadastrar
                              </Button>
                            </div>
                          )}
                        </div>

                        {/* Other matches */}
                        {exercise.matches.length > 0 && !exercise.matched_exercise_id && (
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">Sugestões:</label>
                            <div className="flex flex-wrap gap-1">
                              {exercise.matches.map((m) => (
                                <Button
                                  key={m.id}
                                  size="sm"
                                  variant="outline"
                                  className="text-xs h-7"
                                  onClick={() => handleExerciseMatch(idx, m.id, m.name)}
                                >
                                  {m.name} ({m.similarity}%)
                                </Button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Exercise details */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-muted-foreground">
                          {exercise.pse && <span>PSE: {exercise.pse}</span>}
                          {exercise.interval_seconds && <span>Int: {exercise.interval_seconds}s</span>}
                          {exercise.training_method && <span>Método: {exercise.training_method}</span>}
                        </div>
                        {exercise.observations && (
                          <p className="text-xs text-muted-foreground italic">{exercise.observations}</p>
                        )}
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === "review" && (
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => handleClose(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => handleConfirm(selectedIndex)}
              disabled={
                createPrescription.isPending ||
                matchedCount === 0 ||
                savedIndexes.has(selectedIndex)
              }
            >
              {createPrescription.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : savedIndexes.has(selectedIndex) ? (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              ) : (
                <FileText className="h-4 w-4 mr-2" />
              )}
              {savedIndexes.has(selectedIndex)
                ? "Prescrição já criada"
                : `Criar treino atual (${matchedCount}/${totalCount} exercícios)`}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>

      {/* Add Exercise Dialog for creating new exercises inline */}
      <AddExerciseDialog
        externalOpen={addExerciseDialogOpen}
        onExternalOpenChange={setAddExerciseDialogOpen}
        defaultName={addExerciseDefaultName}
        defaultValues={addExerciseDefaultValues}
        onCreated={(newExercise) => {
          if (addExerciseTargetIdx !== null) {
            handleExerciseMatch(addExerciseTargetIdx, newExercise.id, newExercise.name);
          }
          setAddExerciseDialogOpen(false);
          setAddExerciseTargetIdx(null);
          setAddExerciseDefaultValues(undefined);
        }}
      />

      {/* Confirm-before-discard when work is in progress. */}
      <AlertDialog open={confirmDiscardOpen} onOpenChange={setConfirmDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {hasAnySaved
                ? "Existem treinos não salvos"
                : "Descartar importação?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {hasAnySaved
                ? `Você salvou ${savedIndexes.size} de ${prescriptions.length} treino(s). Os outros ${prescriptions.length - savedIndexes.size} ainda não foram criados. Deseja sair mesmo assim?`
                : "Você tem prescrições importadas em revisão. Se descartar, o trabalho de vinculação será perdido."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar revisando</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDiscard}
              className="bg-destructive hover:bg-destructive/90"
            >
              {hasAnySaved ? "Sair mesmo assim" : "Descartar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
