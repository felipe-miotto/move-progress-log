import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { usePrescriptionDraftHistory } from "@/hooks/usePrescriptionDraftHistory";
import type { PrescriptionDraftExercise, PrescriptionType } from "@/hooks/usePrescriptionDraft";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Trash2, Clock, FileText, ListChecks } from "lucide-react";
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

interface PrescriptionDraft {
  id: string;
  timestamp: string;
  name: string;
  objective: string;
  prescriptionType?: PrescriptionType;
  exercises: PrescriptionDraftExercise[];
}

interface PrescriptionDraftHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRestoreDraft: (draft: PrescriptionDraft) => void;
}

export function PrescriptionDraftHistoryDialog({
  open,
  onOpenChange,
  onRestoreDraft,
}: PrescriptionDraftHistoryDialogProps) {
  const { draftHistory, deleteDraft, clearAllDrafts, getTotalExerciseCount } = usePrescriptionDraftHistory();
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [showClearAllDialog, setShowClearAllDialog] = useState(false);
  const [draftToDelete, setDraftToDelete] = useState<string | null>(null);

  const selectedDraft = draftHistory.find(d => d.id === selectedDraftId);

  const handleRestore = (draft: PrescriptionDraft) => {
    onRestoreDraft(draft);
    onOpenChange(false);
  };

  const handleDeleteDraft = (draftId: string) => {
    deleteDraft(draftId);
    if (selectedDraftId === draftId) {
      setSelectedDraftId(null);
    }
    setDraftToDelete(null);
  };

  const handleClearAll = () => {
    clearAllDrafts();
    setSelectedDraftId(null);
    setShowClearAllDialog(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Histórico de Rascunhos</DialogTitle>
            <DialogDescription>
              Últimas 10 versões salvas automaticamente a cada 60 segundos
            </DialogDescription>
          </DialogHeader>

          {draftHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Clock className="h-12 w-12 mb-2 opacity-50" />
              <p>Nenhum rascunho salvo ainda</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {/* Lista de rascunhos */}
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-2">
                  {draftHistory.map((draft) => (
                    <div
                      key={draft.id}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors hover:bg-accent ${
                        selectedDraftId === draft.id ? "bg-accent border-primary" : ""
                      }`}
                      onClick={() => setSelectedDraftId(draft.id)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <span className="font-medium truncate">
                              {draft.name || "Sem nome"}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                            <Clock className="h-3 w-3" />
                            <span>
                              {formatDistanceToNow(new Date(draft.timestamp), {
                                addSuffix: true,
                                locale: ptBR,
                              })}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              <ListChecks className="h-3 w-3 mr-1" />
                              {getTotalExerciseCount(draft)} exercícios
                            </Badge>
                          </div>
                        </div>

                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="flex-shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDraftToDelete(draft.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              {/* Detalhes do rascunho selecionado */}
              <div className="border rounded-lg p-4">
                {selectedDraft ? (
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-semibold mb-1">Nome da Prescrição</h4>
                        <p className="text-sm text-muted-foreground">
                          {selectedDraft.name || "Sem nome"}
                        </p>
                      </div>

                      {selectedDraft.objective && (
                        <div>
                          <h4 className="font-semibold mb-1">Objetivo</h4>
                          <p className="text-sm text-muted-foreground">
                            {selectedDraft.objective}
                          </p>
                        </div>
                      )}

                      <Separator />

                      <div>
                        <h4 className="font-semibold mb-2">
                          Exercícios ({selectedDraft.exercises.length})
                        </h4>
                        <div className="space-y-2">
                          {selectedDraft.exercises.map((exercise, idx) => (
                            <div
                              key={exercise.id}
                              className="text-sm p-2 bg-muted/50 rounded"
                            >
                              <div className="font-medium">
                                {idx + 1}. {exercise.exercise_library_id ? "Exercício configurado" : "Exercício vazio"}
                              </div>
                              {exercise.sets && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  {exercise.sets} séries × {exercise.reps} reps
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      <Separator />

                      <div className="flex gap-2">
                        <Button
                          onClick={() => handleRestore(selectedDraft)}
                          className="flex-1"
                        >
                          Restaurar este Rascunho
                        </Button>
                      </div>
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    Selecione um rascunho para ver detalhes
                  </div>
                )}
              </div>
            </div>
          )}

          {draftHistory.length > 0 && (
            <>
              <Separator />
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  onClick={() => setShowClearAllDialog(true)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Limpar Todo Histórico
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmação para deletar rascunho individual */}
      <AlertDialog open={!!draftToDelete} onOpenChange={() => setDraftToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Rascunho</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este rascunho? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => draftToDelete && handleDeleteDraft(draftToDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de confirmação para limpar todo histórico */}
      <AlertDialog open={showClearAllDialog} onOpenChange={setShowClearAllDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Limpar Todo Histórico</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir todos os {draftHistory.length} rascunhos salvos? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClearAll}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Limpar Tudo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
