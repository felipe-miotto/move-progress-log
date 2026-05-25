import { useState } from "react";
import { ChevronDown, ChevronRight, Folder, FolderOpen, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { DraggablePrescriptionCard } from "./DraggablePrescriptionCard";
import { WorkoutPrescription } from "@/hooks/usePrescriptions";
import { PrescriptionFolder } from "@/hooks/useFolders";

interface FolderSectionProps {
  folder: PrescriptionFolder | null; // null for "Sem Pasta" section
  prescriptions: WorkoutPrescription[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  onRename?: () => void;
  onDelete?: () => void;
  onEdit: (id: string) => void;
  onAssign: (id: string) => void;
  onAddSession: (id: string) => void;
  onMoveToFolder: (prescriptionId: string, folderId: string) => void;
  onRemoveFromFolder: (prescriptionId: string) => void;
  onDeletePrescription?: (prescriptionId: string) => void;
}

export function FolderSection({
  folder,
  prescriptions,
  isExpanded,
  onToggleExpand,
  onRename,
  onDelete,
  onEdit,
  onAssign,
  onAddSession,
  onMoveToFolder,
  onRemoveFromFolder,
  onDeletePrescription,
}: FolderSectionProps) {
  const folderId = folder?.id || "no-folder";
  const folderName = folder?.name || "Sem Pasta";
  const isNoFolder = !folder;

  const { setNodeRef, isOver, active } = useDroppable({
    id: folderId,
    data: {
      type: 'folder',
      folderId: folder?.id || null,
    }
  });

  // A folder being dragged can be dropped here to move it to the root.
  const isFolderDrag = active?.data?.current?.type === 'folder';

  return (
    <div className="space-y-3">
      {/* Folder Header */}
      <div
        ref={setNodeRef}
        className={cn(
          "flex items-center justify-between p-3 rounded-md transition-all duration-200",
          isOver && "drop-zone-hover",
          !isOver && "hover:bg-muted/50"
        )}
      >
        <button
          onClick={onToggleExpand}
          className="flex items-center gap-2 flex-1 text-left"
          aria-label={`${isExpanded ? 'Recolher' : 'Expandir'} pasta ${folderName}`}
          aria-expanded={isExpanded}
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          
          {isExpanded ? (
            <FolderOpen className="h-5 w-5 text-primary" />
          ) : (
            <Folder className="h-5 w-5 text-muted-foreground" />
          )}
          
          <h3 className="font-semibold text-lg">{folderName}</h3>
          
          <Badge variant="secondary" className="ml-2">
            {prescriptions.length}
          </Badge>
        </button>

        {/* Folder Actions Menu (only for real folders, not "Sem Pasta") */}
        {!isNoFolder && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={(e) => e.stopPropagation()}
                aria-label={`Mais opções para pasta ${folderName}`}
              >
                <MoreVertical className="h-4 w-4" />
                <span className="sr-only">Menu da pasta</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onRename}>
                <Pencil className="h-4 w-4 mr-2" />
                Renomear Pasta
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={onDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Excluir Pasta
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Prescriptions List */}
      {isExpanded && (
        <div className="space-y-4 pl-7">
          {prescriptions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              {isNoFolder
                ? isFolderDrag
                  ? "Solte aqui para mover a pasta para a raiz"
                  : "Sem prescrições fora de pasta"
                : "Arraste prescrições para esta pasta"}
            </p>
          ) : (
            <SortableContext
              items={prescriptions.map(p => p.id)}
              strategy={verticalListSortingStrategy}
            >
              {prescriptions.map((prescription) => (
                <DraggablePrescriptionCard
                  key={prescription.id}
                  prescription={prescription}
                  onEdit={onEdit}
                  onAssign={onAssign}
                  onAddSession={onAddSession}
                  onMoveToFolder={onMoveToFolder}
                  onRemoveFromFolder={onRemoveFromFolder}
                  onDelete={onDeletePrescription}
                />
              ))}
            </SortableContext>
          )}
        </div>
      )}
    </div>
  );
}