import { useState } from "react";
import { ChevronRight, ChevronDown, Folder, FolderOpen, FolderPlus, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MAX_FOLDER_DEPTH, PrescriptionFolder } from "@/hooks/useFolders";
import { WorkoutPrescription } from "@/hooks/usePrescriptions";
import { DraggablePrescriptionCard } from "./DraggablePrescriptionCard";
import { useDroppable, DndContext, closestCenter, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface FolderTreeProps {
  folders: PrescriptionFolder[];
  prescriptionsByFolder: Record<string, WorkoutPrescription[]>;
  expandedFolders: Set<string>;
  onToggleFolder: (folderId: string) => void;
  onCreateSubfolder: (parentId: string) => void;
  onRenameFolder: (folder: PrescriptionFolder) => void;
  onDeleteFolder: (folder: PrescriptionFolder) => void;
  onEditPrescription: (id: string) => void;
  onAssignPrescription: (id: string) => void;
  onAddSession: (id: string) => void;
  onMoveToFolder: (prescriptionId: string, folderId: string) => void;
  onRemoveFromFolder: (prescriptionId: string) => void;
  onDeletePrescription?: (prescriptionId: string) => void;
  level?: number;
}

export function FolderTree({
  folders,
  prescriptionsByFolder,
  expandedFolders,
  onToggleFolder,
  onCreateSubfolder,
  onRenameFolder,
  onDeleteFolder,
  onEditPrescription,
  onAssignPrescription,
  onAddSession,
  onMoveToFolder,
  onRemoveFromFolder,
  onDeletePrescription,
  level = 0,
}: FolderTreeProps) {
  if (folders.length === 0) return null;

  return (
    <div className="space-y-2" style={{ paddingLeft: level > 0 ? '20px' : '0' }}>
      {folders.map((folder) => (
        <FolderTreeNode
          key={folder.id}
          folder={folder}
          prescriptions={prescriptionsByFolder[folder.id] || []}
          isExpanded={expandedFolders.has(folder.id)}
          onToggle={() => onToggleFolder(folder.id)}
          onCreateSubfolder={onCreateSubfolder}
          onRename={() => onRenameFolder(folder)}
          onDelete={() => onDeleteFolder(folder)}
          onEditPrescription={onEditPrescription}
          onAssignPrescription={onAssignPrescription}
          onAddSession={onAddSession}
          onMoveToFolder={onMoveToFolder}
          onRemoveFromFolder={onRemoveFromFolder}
          onDeletePrescription={onDeletePrescription}
          level={level}
        >
          {folder.children && folder.children.length > 0 && (
            <FolderTree
              folders={folder.children}
              prescriptionsByFolder={prescriptionsByFolder}
              expandedFolders={expandedFolders}
              onToggleFolder={onToggleFolder}
              onCreateSubfolder={onCreateSubfolder}
              onRenameFolder={onRenameFolder}
              onDeleteFolder={onDeleteFolder}
              onEditPrescription={onEditPrescription}
              onAssignPrescription={onAssignPrescription}
              onAddSession={onAddSession}
              onMoveToFolder={onMoveToFolder}
              onRemoveFromFolder={onRemoveFromFolder}
              onDeletePrescription={onDeletePrescription}
              level={level + 1}
            />
          )}
        </FolderTreeNode>
      ))}
    </div>
  );
}

interface FolderTreeNodeProps {
  folder: PrescriptionFolder;
  prescriptions: WorkoutPrescription[];
  isExpanded: boolean;
  onToggle: () => void;
  onCreateSubfolder: (parentId: string) => void;
  onRename: () => void;
  onDelete: () => void;
  onEditPrescription: (id: string) => void;
  onAssignPrescription: (id: string) => void;
  onAddSession: (id: string) => void;
  onMoveToFolder: (prescriptionId: string, folderId: string) => void;
  onRemoveFromFolder: (prescriptionId: string) => void;
  onDeletePrescription?: (prescriptionId: string) => void;
  level: number;
  children?: React.ReactNode;
}

function FolderTreeNode({
  folder,
  prescriptions,
  isExpanded,
  onToggle,
  onCreateSubfolder,
  onRename,
  onDelete,
  onEditPrescription,
  onAssignPrescription,
  onAddSession,
  onMoveToFolder,
  onRemoveFromFolder,
  onDeletePrescription,
  level,
  children,
}: FolderTreeNodeProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `folder-${folder.id}`,
    data: {
      type: 'folder',
      folderId: folder.id,
    },
  });

  const canHaveSubfolders = folder.depth_level < MAX_FOLDER_DEPTH;
  const hasPrescriptions = prescriptions.length > 0;
  const hasChildren = folder.children && folder.children.length > 0;

  return (
    <div className="space-y-2">
      {/* Folder header */}
      <div
        ref={setNodeRef}
        className={cn(
          "flex items-center gap-2 p-3 rounded-lg border bg-card transition-smooth",
          isOver && "bg-accent border-primary"
        )}
      >
        {/* Expand/collapse button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggle}
          className="h-6 w-6 p-0 transition-smooth hover:scale-110 focus-visible-ring"
          aria-label={isExpanded ? "Recolher pasta" : "Expandir pasta"}
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </Button>

        {/* Folder icon */}
        {isExpanded ? (
          <FolderOpen className="h-5 w-5 text-primary" />
        ) : (
          <Folder className="h-5 w-5 text-muted-foreground" />
        )}

        {/* Folder name and count */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{folder.name}</span>
            {hasPrescriptions && (
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                {prescriptions.length}
              </span>
            )}
          </div>
          {folder.full_path && folder.depth_level > 0 && (
            <p className="text-xs text-muted-foreground truncate">
              {folder.full_path}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {/* Create subfolder button (only while depth_level allows nesting) */}
          {canHaveSubfolders && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onCreateSubfolder(folder.id)}
              className="h-8 w-8 p-0"
              title="Criar subpasta"
            >
              <FolderPlus className="h-4 w-4" />
            </Button>
          )}

          {/* More options */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onRename}>
                <Pencil className="h-4 w-4 mr-2" />
                Renomear
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={onDelete}
                className="text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="ml-8 space-y-2 animate-accordion-down">
          {/* Prescriptions in this folder */}
          {hasPrescriptions && (
            <SortableContext
              items={prescriptions.map((p) => p.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {prescriptions.map((prescription) => (
                  <DraggablePrescriptionCard
                    key={prescription.id}
                    prescription={prescription}
                    onEdit={onEditPrescription}
                    onAssign={onAssignPrescription}
                    onAddSession={onAddSession}
                    onMoveToFolder={onMoveToFolder}
                    onRemoveFromFolder={onRemoveFromFolder}
                    onDelete={onDeletePrescription}
                  />
                ))}
              </div>
            </SortableContext>
          )}

          {/* Child folders */}
          {children}

          {/* Empty state */}
          {!hasPrescriptions && !hasChildren && (
            <div className="p-4 text-center text-sm text-muted-foreground border border-dashed rounded-lg">
              Pasta vazia. Arraste prescrições aqui.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
