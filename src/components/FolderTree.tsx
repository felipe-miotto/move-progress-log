import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FolderPlus,
  GripVertical,
  MoreVertical,
  Pencil,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  MAX_FOLDER_DEPTH,
  PrescriptionFolder,
  getFolderSubtreeHeight,
} from "@/hooks/useFolders";
import { WorkoutPrescription } from "@/hooks/usePrescriptions";
import { DraggablePrescriptionCard } from "./DraggablePrescriptionCard";
import { useDroppable, useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
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
  /** Ids of every ancestor of the folders rendered here (root-most first). */
  ancestorIds?: string[];
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
  ancestorIds = [],
}: FolderTreeProps) {
  if (folders.length === 0) return null;

  return (
    <div className="space-y-2" style={{ paddingLeft: level > 0 ? '12px' : '0' }}>
      {folders.map((folder) => (
        <FolderTreeNode
          key={folder.id}
          folder={folder}
          ancestorIds={ancestorIds}
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
              ancestorIds={[...ancestorIds, folder.id]}
            />
          )}
        </FolderTreeNode>
      ))}
    </div>
  );
}

interface FolderTreeNodeProps {
  folder: PrescriptionFolder;
  /** Ids of every ancestor of this folder (root-most first). */
  ancestorIds: string[];
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
  ancestorIds,
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
  const subtreeHeight = getFolderSubtreeHeight(folder);

  // Drag source — the folder can be picked up by its grip handle. The drag
  // data carries depth/subtree info so any drop target can predict validity.
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    transform,
    isDragging,
  } = useDraggable({
    id: `folder-${folder.id}`,
    data: {
      type: 'folder',
      folderId: folder.id,
      depthLevel: folder.depth_level,
      subtreeHeight,
    },
  });

  // Drop target — accepts prescriptions (move into folder) and folders
  // (re-parent). `active` exposes whatever is currently being dragged.
  const { setNodeRef: setDropRef, isOver, active } = useDroppable({
    id: `folder-drop-${folder.id}`,
    data: {
      type: 'folder',
      folderId: folder.id,
    },
  });

  const activeData = active?.data?.current;
  const isFolderDrag = activeData?.type === 'folder';
  const draggedFolderId = isFolderDrag
    ? (activeData?.folderId as string | undefined) ?? null
    : null;
  const draggedSubtreeHeight = isFolderDrag
    ? (activeData?.subtreeHeight as number | undefined) ?? 0
    : 0;

  // A folder may not be dropped onto itself or one of its own descendants...
  const isInvalidFolderTarget =
    isFolderDrag &&
    draggedFolderId != null &&
    (draggedFolderId === folder.id || ancestorIds.includes(draggedFolderId));
  // ...nor onto a target that would push the moved subtree past the limit.
  const exceedsDepthLimit =
    isFolderDrag &&
    folder.depth_level + 1 + draggedSubtreeHeight > MAX_FOLDER_DEPTH;

  const dropBlocked = isInvalidFolderTarget || exceedsDepthLimit;
  const dropAccepted = isOver && !dropBlocked;
  const dropRejected = isOver && dropBlocked;

  const canHaveSubfolders = folder.depth_level < MAX_FOLDER_DEPTH;
  const hasPrescriptions = prescriptions.length > 0;
  const hasChildren = folder.children && folder.children.length > 0;

  return (
    <div className="space-y-2">
      {/* Folder header — outer element is the drop zone */}
      <div
        ref={setDropRef}
        className={cn(
          "rounded-lg border bg-card transition-smooth",
          dropAccepted && "bg-accent border-primary ring-2 ring-primary/40",
          dropRejected && "bg-destructive/10 border-destructive ring-2 ring-destructive/40 cursor-not-allowed"
        )}
      >
        {/* Inner element is the drag node (follows the pointer while dragging) */}
        <div
          ref={setDragRef}
          style={{ transform: CSS.Translate.toString(transform) }}
          className={cn(
            "flex items-center gap-2 p-3",
            isDragging && "opacity-50"
          )}
        >
          {/* Drag handle */}
          <button
            type="button"
            className="cursor-grab active:cursor-grabbing touch-none p-1 rounded-md text-muted-foreground opacity-50 hover:opacity-100 hover:bg-accent transition-smooth focus-visible-ring"
            {...attributes}
            {...listeners}
            aria-label={`Mover pasta ${folder.name}`}
          >
            <GripVertical className="h-4 w-4" />
          </button>

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
            {/* Create subfolder button — or a discrete disabled affordance
                when the folder already sits at MAX_FOLDER_DEPTH. */}
            {canHaveSubfolders ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onCreateSubfolder(folder.id)}
                className="h-8 w-8 p-0"
                title="Criar subpasta"
              >
                <FolderPlus className="h-4 w-4" />
              </Button>
            ) : (
              <span
                className="inline-flex items-center justify-center h-8 w-8 p-0 opacity-30 cursor-not-allowed"
                title="Limite de 5 níveis atingido"
                aria-label="Limite de 5 níveis atingido"
              >
                <FolderPlus className="h-4 w-4" />
              </span>
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
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="ml-4 space-y-2 animate-accordion-down">
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
