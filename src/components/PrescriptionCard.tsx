import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePrescriptionDetails, WorkoutPrescription, PrescriptionExercise } from "@/hooks/usePrescriptions";
import { useFolders } from "@/hooks/useFolders";
import { Calendar, Users, ClipboardList, Pencil, MoreVertical, FolderInput, FolderX, Trash2, Monitor } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import { memo, useState } from "react";
import { PrescriptionTVMode } from "@/components/PrescriptionTVMode";
import { ExerciseLoadHistoryPopover } from "@/components/ExerciseLoadHistoryPopover";

// Agrupa exercícios baseado no campo group_with_previous
const groupExercises = (exercises: PrescriptionExercise[]) => {
  const groups: Array<{ exercises: PrescriptionExercise[]; isGroup: boolean; method: string | null }> = [];
  let currentGroup: PrescriptionExercise[] = [];

  exercises.forEach((exercise, index) => {
    if (index === 0) {
      // Primeiro exercício sempre inicia um novo grupo
      currentGroup = [exercise];
    } else if (exercise.group_with_previous) {
      // Se deve agrupar com o anterior, adiciona ao grupo atual
      currentGroup.push(exercise);
    } else {
      // Se não deve agrupar, fecha o grupo anterior e inicia novo
      if (currentGroup.length > 0) {
        groups.push({ 
          exercises: currentGroup, 
          isGroup: currentGroup.length > 1,
          method: currentGroup[0].training_method
        });
      }
      currentGroup = [exercise];
    }
  });

  // Adiciona o último grupo
  if (currentGroup.length > 0) {
    groups.push({ 
      exercises: currentGroup, 
      isGroup: currentGroup.length > 1,
      method: currentGroup[0].training_method
    });
  }

  return groups;
};

interface PrescriptionCardProps {
  prescription: WorkoutPrescription;
  onEdit: (id: string) => void;
  onAssign: (id: string) => void;
  onAddSession: (id: string) => void;
  onMoveToFolder: (prescriptionId: string, folderId: string) => void;
  onRemoveFromFolder: (prescriptionId: string) => void;
  onDelete?: (prescriptionId: string) => void;
}

const getAssignmentBadge = (count: number) => {
  if (count === 0) {
    return (
      <Badge variant="outline" className="gap-xs border-destructive/50 text-destructive">
        <div className="h-2 w-2 rounded-full bg-destructive" />
        Não atribuída
      </Badge>
    );
  }
  if (count === 1) {
    return (
      <Badge variant="outline-warning" className="gap-xs">
        <div className="h-2 w-2 rounded-full bg-warning" />
        1 aluno
      </Badge>
    );
  }
  return (
    <Badge variant="outline-success" className="gap-xs">
      <div className="h-2 w-2 rounded-full bg-success" />
      {count} alunos
    </Badge>
  );
};

const PrescriptionCardComponent = ({ 
  prescription, 
  onEdit, 
  onAssign, 
  onAddSession,
  onMoveToFolder,
  onRemoveFromFolder,
  onDelete
}: PrescriptionCardProps) => {
  const { data: details, isLoading } = usePrescriptionDetails(prescription.id);
  const { data: folders } = useFolders();
  const [tvMode, setTvMode] = useState(false);
  const hasAnyObservations = (details?.exercises || []).some(
    (ex) => ex.observations?.trim()
  );

  return (
    <Card className="animate-fade-in card-interactive">
      <CardHeader className="pb-sm">
        <div className="flex items-start justify-between gap-sm flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-sm mb-2">
              <CardTitle className="text-2xl">{prescription.name}</CardTitle>
              {getAssignmentBadge(prescription.assigned_students_count || 0)}
            </div>
            {prescription.objective && (
              <CardDescription className="text-base">
                {prescription.objective}
              </CardDescription>
            )}
            <div className="flex items-center gap-xs text-sm text-muted-foreground mt-3">
              <Calendar className="h-4 w-4" />
              <span>
                Criada em {format(new Date(prescription.created_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
              </span>
            </div>
          </div>
          <div className="flex gap-xs flex-wrap items-center">
            <Button
              variant="ghost"
              size="sm"
              className="gap-2"
              onClick={() => setTvMode(true)}
              title="Modo TV"
            >
              <Monitor className="h-4 w-4" />
              Modo TV
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => onEdit(prescription.id)}
            >
              <Pencil className="h-4 w-4" />
              Editar
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => onAssign(prescription.id)}
            >
              <Users className="h-4 w-4" />
              Atribuir
            </Button>
            <Button
              variant="default"
              size="sm"
              className="gap-2"
              onClick={() => onAddSession(prescription.id)}
            >
              <ClipboardList className="h-4 w-4" />
              Registrar Sessão
            </Button>

            {/* Context Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                >
                  <MoreVertical className="h-4 w-4" />
                  <span className="sr-only">Menu da prescrição</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 bg-background z-50">
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <FolderInput className="h-4 w-4 mr-2" />
                    Mover para Pasta
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="bg-background z-50">
                    {folders && folders.length > 0 ? (
                      folders
                        .filter(f => f.id !== prescription.folder_id)
                        .map(folder => (
                          <DropdownMenuItem
                            key={folder.id}
                            onClick={() => onMoveToFolder(prescription.id, folder.id)}
                          >
                            {folder.name}
                          </DropdownMenuItem>
                        ))
                    ) : (
                      <DropdownMenuItem disabled>
                        Nenhuma pasta disponível
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                
                {prescription.folder_id && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => onRemoveFromFolder(prescription.id)}>
                      <FolderX className="h-4 w-4 mr-2" />
                      Remover da Pasta
                    </DropdownMenuItem>
                  </>
                )}
                
                {onDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      onClick={() => onDelete(prescription.id)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Excluir Prescrição
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-sm">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : details?.exercises && details.exercises.length > 0 ? (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold text-center uppercase tracking-wider">Exercício</TableHead>
                  <TableHead className="font-semibold text-center uppercase tracking-wider">Sets x Reps / Int</TableHead>
                  <TableHead className="font-semibold text-center uppercase tracking-wider">
                    {prescription.prescription_type === 'individual' ? 'Carga' : 'PSE'}
                  </TableHead>
                  {prescription.prescription_type === 'individual' && (
                    <TableHead className="font-semibold text-center uppercase tracking-wider">RR</TableHead>
                  )}
                  <TableHead className="font-semibold text-center uppercase tracking-wider">Método</TableHead>
                  {hasAnyObservations && (
                    <TableHead className="font-semibold text-center uppercase tracking-wider">OBS</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(() => {
                  const groups = groupExercises(details.exercises);
                  
                  return groups.map((group, groupIndex) => {
                    return group.exercises.map((exercise, exIndex) => {
                      const isFirstInGroup = exIndex === 0;
                      const isLastInGroup = exIndex === group.exercises.length - 1;

                      const setsReps = `${exercise.sets} x ${exercise.reps}`;
                      const interval = exercise.interval_seconds ? ` / ${exercise.interval_seconds}s` : '';
                      const setsRepsInt = `${setsReps}${interval}`;

                      const intensityValue = prescription.prescription_type === 'individual' 
                        ? exercise.load 
                        : exercise.pse;
                      
                      return (
                        <TableRow 
                          key={exercise.id} 
                          className={`hover:bg-muted/30 ${
                            group.isGroup && !isLastInGroup ? 'border-b-0' : ''
                          }`}
                          style={group.isGroup ? {
                            borderLeft: '4px solid hsl(var(--primary) / 0.6)'
                          } : undefined}
                        >
                          <TableCell className="font-medium">
                            {exercise.exercise_name}
                          </TableCell>
                          <TableCell className="text-center font-semibold whitespace-nowrap">
                            {setsRepsInt}
                          </TableCell>
                          <TableCell className="text-center">
                            <ExerciseLoadHistoryPopover
                              exerciseName={exercise.exercise_name}
                              exerciseLibraryId={exercise.exercise_library_id}
                              prescriptionId={prescription.id}
                            >
                              {intensityValue ? (
                                <span className="text-sm font-medium">{intensityValue}</span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </ExerciseLoadHistoryPopover>
                          </TableCell>
                          {prescription.prescription_type === 'individual' && (
                            <TableCell className="text-center">
                              {exercise.rir ? (
                                <span className="text-sm font-medium">{exercise.rir}</span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          )}
                          {!(group.isGroup && !isFirstInGroup) && (
                            <TableCell className="text-center" rowSpan={group.isGroup && isFirstInGroup ? group.exercises.length : undefined}>
                              {exercise.training_method ? (
                                <Badge variant="secondary" className="text-xs">
                                  {exercise.training_method}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          )}
                          {hasAnyObservations && (
                            <TableCell className="text-sm text-muted-foreground text-center max-w-xs truncate">
                              {exercise.observations || "—"}
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    });
                  });
                })()}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            Nenhum exercício cadastrado nesta prescrição
          </div>
        )}
      </CardContent>

      {/* TV Mode Overlay */}
      <PrescriptionTVMode
        open={tvMode}
        onClose={() => setTvMode(false)}
        prescription={prescription}
        exercises={details?.exercises || []}
      />
    </Card>
  );
};

export const PrescriptionCard = memo(PrescriptionCardComponent, (prevProps, nextProps) => {
  return (
    prevProps.prescription.id === nextProps.prescription.id &&
    prevProps.prescription.name === nextProps.prescription.name &&
    prevProps.prescription.objective === nextProps.prescription.objective &&
    prevProps.prescription.folder_id === nextProps.prescription.folder_id &&
    prevProps.prescription.updated_at === nextProps.prescription.updated_at &&
    prevProps.prescription.prescription_type === nextProps.prescription.prescription_type
  );
});
