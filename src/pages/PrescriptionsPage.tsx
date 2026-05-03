import { useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Plus, Search, FolderPlus, MoreVertical, Sparkles, FileUp, FileWarning, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePrescriptions, useDeletePrescription } from "@/hooks/usePrescriptions";
import { useFolders, useMovePrescription, useReorderPrescriptions, useDeleteFolder, PrescriptionFolder } from "@/hooks/useFolders";
import { usePrescriptionSearch } from "@/hooks/usePrescriptionSearch";
import { usePrescriptionsStagnantFilter } from "@/hooks/usePrescriptionsStagnantFilter";
import { CreatePrescriptionDialog } from "@/components/CreatePrescriptionDialog";
import { ImportPrescriptionFromWordDialog } from "@/components/ImportPrescriptionFromWordDialog";
import { EditPrescriptionDialog } from "@/components/EditPrescriptionDialog";
import { AssignPrescriptionDialog } from "@/components/AssignPrescriptionDialog";
import { RecordGroupSessionDialog } from "@/components/RecordGroupSessionDialog";
import { GenerateGroupSessionDialog } from "@/components/GenerateGroupSessionDialog";
import { CreateSubfolderDialog } from "@/components/CreateSubfolderDialog";
import { RenameFolderDialog } from "@/components/RenameFolderDialog";
import { FolderTree } from "@/components/FolderTree";
import { PrescriptionSearchBar } from "@/components/PrescriptionSearchBar";
import { FolderSection } from "@/components/FolderSection";
import { PageLayout } from "@/components/PageLayout";
import { PageHeader } from "@/components/PageHeader";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { PageLoadingSkeleton } from "@/components/PageLoadingSkeleton";
import { PrescriptionCardSkeleton } from "@/components/skeletons/PrescriptionCardSkeleton";
import EmptyState from "@/components/EmptyState";
import { NAV_LABELS } from "@/constants/navigation";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useSEOHead, SEO_PRESETS } from "@/hooks/useSEOHead";
import { getWebPageSchema, getBreadcrumbSchema } from "@/utils/structuredData";
import { DndContext, DragEndEvent, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
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

export default function PrescriptionsPage() {
  usePageTitle(NAV_LABELS.prescriptions);
  useSEOHead(SEO_PRESETS.private);
  
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: allPrescriptions, isLoading } = usePrescriptions();
  const { data: folders } = useFolders();
  const movePrescription = useMovePrescription();
  const reorderPrescriptions = useReorderPrescriptions();
  const deleteFolder = useDeleteFolder();
  const deletePrescription = useDeletePrescription();

  // Search and filter states
  const [searchFilters, setSearchFilters] = useState<{
    searchText?: string;
    folderId?: string | null;
    dayOfWeek?: string;
  }>({});
  const [showSearch, setShowSearch] = useState(false);

  // Drill-down filter from dashboard KPI (?stagnant=N)
  const stagnantWeeks = useMemo<number | null>(() => {
    const raw = searchParams.get("stagnant");
    if (!raw) return null;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [searchParams]);

  const {
    data: stagnantSet,
    isLoading: isStagnantLoading,
    isError: isStagnantError,
  } = usePrescriptionsStagnantFilter(stagnantWeeks);

  const clearStagnantFilter = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("stagnant");
    setSearchParams(next, { replace: true });
  };

  // While the stagnant filter is loading, hide the full prescription list to
  // avoid the flash of "all prescriptions" before the drill-down narrows it.
  const isApplyingStagnantFilter = stagnantWeeks !== null && isStagnantLoading;

  // Use search results if filters are active, otherwise use all prescriptions
  const { data: searchResults } = usePrescriptionSearch(searchFilters);
  const hasActiveSearch = Boolean(searchFilters.searchText?.trim())
    || searchFilters.folderId !== undefined
    || Boolean(searchFilters.dayOfWeek);
  const baseList = hasActiveSearch ? searchResults : allPrescriptions;
  const prescriptions = useMemo(() => {
    if (!baseList) return baseList;
    // Hide the underlying list while the drill-down filter is still loading
    // so the UI does not flash "all prescriptions" first.
    if (stagnantWeeks !== null && !stagnantSet) return [];
    if (stagnantWeeks === null || !stagnantSet) return baseList;
    return baseList.filter((p) => stagnantSet.has(p.id));
  }, [baseList, stagnantWeeks, stagnantSet]);

  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [importWordDialogOpen, setImportWordDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [recordGroupDialogOpen, setRecordGroupDialogOpen] = useState(false);
  const [generateSessionDialogOpen, setGenerateSessionDialogOpen] = useState(false);
  const [createSubfolderDialogOpen, setCreateSubfolderDialogOpen] = useState(false);
  const [renameFolderDialogOpen, setRenameFolderDialogOpen] = useState(false);
  const [deleteFolderDialogOpen, setDeleteFolderDialogOpen] = useState(false);
  
  const [selectedPrescriptionId, setSelectedPrescriptionId] = useState<string | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<PrescriptionFolder | null>(null);
  const [selectedParentFolderId, setSelectedParentFolderId] = useState<string | null>(null);
  const [reopenGroupSession, setReopenGroupSession] = useState<{
    prescriptionId: string;
    date: string;
    time: string;
  } | null>(null);

  // Expanded folders state (persist which folders are open)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  // Drag and drop sensors - configuração mais permissiva
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  // Flatten folder tree for easier access
  const flattenFolders = (folders: PrescriptionFolder[]): PrescriptionFolder[] => {
    return folders.reduce((acc, folder) => {
      acc.push(folder);
      if (folder.children && folder.children.length > 0) {
        acc.push(...flattenFolders(folder.children));
      }
      return acc;
    }, [] as PrescriptionFolder[]);
  };

  const allFoldersFlat = folders ? flattenFolders(folders) : [];

  // Group prescriptions by folder (including nested folders)
  const groupedPrescriptions = useMemo(() => {
    if (!prescriptions) return {};

    const groups: { [key: string]: typeof prescriptions } = {};

    prescriptions.forEach(prescription => {
      const folderId = prescription.folder_id || 'no-folder';
      if (!groups[folderId]) {
        groups[folderId] = [];
      }
      groups[folderId].push(prescription);
    });

    return groups;
  }, [prescriptions]);

  const handleEdit = (prescriptionId: string) => {
    setSelectedPrescriptionId(prescriptionId);
    setEditDialogOpen(true);
  };

  const handleAssign = (prescriptionId: string) => {
    setSelectedPrescriptionId(prescriptionId);
    setAssignDialogOpen(true);
  };

  const handleAddSession = (prescriptionId: string) => {
    setSelectedPrescriptionId(prescriptionId);
    setRecordGroupDialogOpen(true);
  };

  const handleToggleFolder = (folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const handleCreateSubfolder = (parentId: string) => {
    setSelectedParentFolderId(parentId);
    setCreateSubfolderDialogOpen(true);
  };

  const handleRenameFolder = (folder: PrescriptionFolder) => {
    setSelectedFolder(folder);
    setRenameFolderDialogOpen(true);
  };

  const handleDeleteFolderClick = (folder: PrescriptionFolder) => {
    setSelectedFolder(folder);
    setDeleteFolderDialogOpen(true);
  };

  const handleConfirmDeleteFolder = async () => {
    if (!selectedFolder) return;
    await deleteFolder.mutateAsync(selectedFolder.id);
    setDeleteFolderDialogOpen(false);
    setSelectedFolder(null);
  };

  const handleMoveToFolder = async (prescriptionId: string, folderId: string) => {
    // Get prescriptions in target folder
    const targetFolderPrescriptions = prescriptions?.filter(
      p => p.folder_id === folderId
    ) || [];
    
    const maxOrder = targetFolderPrescriptions.length > 0
      ? Math.max(...targetFolderPrescriptions.map(p => p.order_index))
      : -1;

    await movePrescription.mutateAsync({
      prescriptionId,
      folderId,
      orderIndex: maxOrder + 1,
    });
  };

  const handleRemoveFromFolder = async (prescriptionId: string) => {
    const prescription = prescriptions?.find(p => p.id === prescriptionId);
    if (!prescription) return;

    // Get max order_index in no-folder group
    const noFolderPrescriptions = prescriptions?.filter(p => !p.folder_id) || [];
    const maxOrder = noFolderPrescriptions.length > 0
      ? Math.max(...noFolderPrescriptions.map(p => p.order_index))
      : -1;

    await movePrescription.mutateAsync({
      prescriptionId,
      folderId: null,
      orderIndex: maxOrder + 1,
    });
  };

  const [deletePrescriptionDialogOpen, setDeletePrescriptionDialogOpen] = useState(false);
  const [prescriptionToDelete, setPrescriptionToDelete] = useState<string | null>(null);

  const handleDeletePrescription = (prescriptionId: string) => {
    setPrescriptionToDelete(prescriptionId);
    setDeletePrescriptionDialogOpen(true);
  };

  const handleConfirmDeletePrescription = async () => {
    if (!prescriptionToDelete) return;
    await deletePrescription.mutateAsync(prescriptionToDelete);
    setDeletePrescriptionDialogOpen(false);
    setPrescriptionToDelete(null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || !prescriptions) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const activePrescription = prescriptions.find(p => p.id === activeId);
    if (!activePrescription) return;

    // Check if dropped on a folder
    const overData = over.data.current;
    if (overData?.type === 'folder') {
      const targetFolderId = overData.folderId;
      
      // Get prescriptions in target folder
      const targetFolderPrescriptions = prescriptions.filter(
        p => (targetFolderId ? p.folder_id === targetFolderId : !p.folder_id)
      );
      
      const maxOrder = targetFolderPrescriptions.length > 0
        ? Math.max(...targetFolderPrescriptions.map(p => p.order_index))
        : -1;

      await movePrescription.mutateAsync({
        prescriptionId: activeId,
        folderId: targetFolderId,
        orderIndex: maxOrder + 1,
      });
      
      return;
    }

    // Reordering within same folder
    if (activeId !== overId) {
      const activePrescription = prescriptions.find(p => p.id === activeId);
      const overPrescription = prescriptions.find(p => p.id === overId);

      if (!activePrescription || !overPrescription) return;

      // Only allow reordering within same folder
      if (activePrescription.folder_id !== overPrescription.folder_id) return;

      const folderPrescriptions = prescriptions.filter(
        p => p.folder_id === activePrescription.folder_id
      );

      const oldIndex = folderPrescriptions.findIndex(p => p.id === activeId);
      const newIndex = folderPrescriptions.findIndex(p => p.id === overId);

      const reordered = arrayMove(folderPrescriptions, oldIndex, newIndex);
      
      // Update order_index for all affected prescriptions
      const updates = reordered.map((prescription, index) => ({
        id: prescription.id,
        order_index: index,
      }));

      await reorderPrescriptions.mutateAsync(updates);
    }
  };

  const hasContent = prescriptions && prescriptions.length > 0;
  const noFolderPrescriptions = groupedPrescriptions['no-folder'] || [];

  return (
    <PageLayout
      structuredData={[
        { data: getWebPageSchema(NAV_LABELS.prescriptions, "Crie e gerencie prescrições de treino personalizadas com organização hierárquica em pastas"), id: "webpage-schema" },
        { data: getBreadcrumbSchema([{ label: "Home", href: "/" }, { label: NAV_LABELS.prescriptions, href: "/prescricoes" }]), id: "breadcrumb-schema" },
      ]}
    >
      <PageHeader
        title={NAV_LABELS.prescriptions}
        breadcrumbs={[{ label: NAV_LABELS.prescriptions }]}
        actions={
          <div className="flex gap-xs">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Ações secundárias">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => setShowSearch(!showSearch)}>
                  <Search className="h-4 w-4 mr-2" />
                  Buscar prescrições
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                  setSelectedParentFolderId(null);
                  setCreateSubfolderDialogOpen(true);
                }}>
                  <FolderPlus className="h-4 w-4 mr-2" />
                  Nova pasta
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            
            <Button
              onClick={() => setGenerateSessionDialogOpen(true)}
              variant="outline"
              className="gap-2"
              aria-label="Gerar sessão com IA"
            >
              <Sparkles className="h-4 w-4" />
              Gerar com IA
            </Button>

            <Button
              onClick={() => setImportWordDialogOpen(true)}
              variant="outline"
              className="gap-2"
              aria-label="Importar prescrição do Word"
            >
              <FileUp className="h-4 w-4" />
              Importar Word
            </Button>
            
            <Button
              onClick={() => setCreateDialogOpen(true)}
              variant="default"
              aria-label="Nova prescrição"
            >
              <Plus className="h-4 w-4 mr-2" />
              Nova Prescrição
            </Button>
          </div>
        }
      />

        {stagnantWeeks !== null && (
          <div
            className={`flex items-center gap-sm rounded-md border px-md py-sm text-sm ${
              isStagnantError
                ? "border-destructive/30 bg-destructive/5"
                : "border-warning/30 bg-warning/5"
            }`}
          >
            <FileWarning
              className={`h-4 w-4 ${isStagnantError ? "text-destructive" : "text-warning"}`}
              aria-hidden="true"
            />
            <span className="font-medium">
              {isStagnantError
                ? "Erro ao aplicar filtro do dashboard"
                : isApplyingStagnantFilter
                  ? `Aplicando filtro: prescrições estagnadas há ${stagnantWeeks}+ semanas…`
                  : stagnantSet
                    ? `${stagnantSet.size} ${stagnantSet.size === 1 ? "prescrição estagnada" : "prescrições estagnadas"} (sem atualização há ${stagnantWeeks}+ semanas)`
                    : `Filtro ativo: prescrições estagnadas há ${stagnantWeeks}+ semanas`}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearStagnantFilter}
              className="ml-auto h-7 px-sm"
              aria-label="Limpar filtro de prescrições estagnadas"
            >
              <X className="h-3 w-3 mr-1" />
              Limpar filtro
            </Button>
          </div>
        )}

        {/* Search bar */}
        {showSearch && (
          <PrescriptionSearchBar
            onSearchChange={(searchText) => 
              setSearchFilters(prev => ({ ...prev, searchText: searchText || undefined }))
            }
            onFolderFilter={(folderId) => 
              setSearchFilters(prev => ({ ...prev, folderId }))
            }
            onDayFilter={(dayOfWeek) => 
              setSearchFilters(prev => ({ ...prev, dayOfWeek }))
            }
            folders={folders || []}
            activeFilters={searchFilters}
          />
        )}

        {isLoading || isApplyingStagnantFilter ? (
          <div className="space-y-md">
            {[...Array(4)].map((_, i) => (
              <PrescriptionCardSkeleton key={i} />
            ))}
          </div>
        ) : hasContent ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <div className="space-y-lg">
              {/* Hierarchical folder tree */}
              {folders && folders.length > 0 && (
                <FolderTree
                  folders={folders}
                  prescriptionsByFolder={groupedPrescriptions}
                  expandedFolders={expandedFolders}
                  onToggleFolder={handleToggleFolder}
                  onCreateSubfolder={handleCreateSubfolder}
                  onRenameFolder={handleRenameFolder}
                  onDeleteFolder={handleDeleteFolderClick}
                  onEditPrescription={handleEdit}
                  onAssignPrescription={handleAssign}
                  onAddSession={handleAddSession}
                  onMoveToFolder={handleMoveToFolder}
                  onRemoveFromFolder={handleRemoveFromFolder}
                  onDeletePrescription={handleDeletePrescription}
                />
              )}

              {/* Prescriptions without folder */}
              {noFolderPrescriptions.length > 0 && (
                <FolderSection
                  folder={null}
                  prescriptions={noFolderPrescriptions}
                  isExpanded={expandedFolders.has('no-folder')}
                  onToggleExpand={() => handleToggleFolder('no-folder')}
                  onEdit={handleEdit}
                  onAssign={handleAssign}
                  onAddSession={handleAddSession}
                  onMoveToFolder={handleMoveToFolder}
                  onRemoveFromFolder={handleRemoveFromFolder}
                  onDeletePrescription={handleDeletePrescription}
                />
              )}
            </div>
          </DndContext>
        ) : hasActiveSearch ? (
          <EmptyState
            icon={<Search className="h-6 w-6" />}
            title="Nenhuma prescrição encontrada"
            description="Nenhuma prescrição corresponde aos critérios de busca. Tente ajustar os termos de busca, limpar os filtros ou criar uma nova prescrição."
            primaryAction={{
              label: "Limpar Filtros",
              onClick: () => setSearchFilters({})
            }}
            secondaryAction={{
              label: "Nova Prescrição",
              onClick: () => setCreateDialogOpen(true)
            }}
          />
        ) : stagnantWeeks !== null ? (
          <EmptyState
            icon={<FileWarning className="h-6 w-6" />}
            title="Nenhuma prescrição estagnada"
            description={`Não há prescrições com atribuição ativa que estejam sem atualização há ${stagnantWeeks}+ semanas. Tudo em dia!`}
            primaryAction={{
              label: "Limpar filtro",
              onClick: clearStagnantFilter,
            }}
          />
        ) : (
          <EmptyState
            icon={<Plus className="h-6 w-6" />}
            title="Comece criando sua primeira prescrição"
            description="Prescrições são templates de treino que você pode atribuir aos seus alunos. Organize exercícios, defina séries e repetições, e acompanhe a evolução de forma estruturada."
            primaryAction={{
              label: "Criar Primeira Prescrição",
              onClick: () => setCreateDialogOpen(true)
            }}
          />
        )}

      {/* Dialogs */}
      <CreatePrescriptionDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />

      <ImportPrescriptionFromWordDialog
        open={importWordDialogOpen}
        onOpenChange={setImportWordDialogOpen}
      />
      
      <EditPrescriptionDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        prescriptionId={selectedPrescriptionId}
      />
      
      <AssignPrescriptionDialog
        open={assignDialogOpen}
        onOpenChange={setAssignDialogOpen}
        prescriptionId={selectedPrescriptionId}
      />
      
      <RecordGroupSessionDialog
        open={recordGroupDialogOpen}
        onOpenChange={setRecordGroupDialogOpen}
        prescriptionId={selectedPrescriptionId}
        reopenDate={reopenGroupSession?.date}
        reopenTime={reopenGroupSession?.time}
      />

      <GenerateGroupSessionDialog
        open={generateSessionDialogOpen}
        onOpenChange={setGenerateSessionDialogOpen}
      />

      <CreateSubfolderDialog
        open={createSubfolderDialogOpen}
        onOpenChange={setCreateSubfolderDialogOpen}
        folders={folders || []}
        defaultParentId={selectedParentFolderId}
      />

      {selectedFolder && (
        <>
          <RenameFolderDialog
            open={renameFolderDialogOpen}
            onOpenChange={setRenameFolderDialogOpen}
            folderId={selectedFolder.id}
            currentName={selectedFolder.name}
            existingNames={allFoldersFlat
              .filter(f => f.id !== selectedFolder.id)
              .map(f => f.name)
            }
          />

          <AlertDialog open={deleteFolderDialogOpen} onOpenChange={setDeleteFolderDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir pasta "{selectedFolder.name}"?</AlertDialogTitle>
                <AlertDialogDescription>
                  As prescrições dentro desta pasta não serão excluídas, apenas movidas para "Sem Pasta".
                  {selectedFolder.children && selectedFolder.children.length > 0 && (
                    <span className="block mt-2 font-medium text-amber-600">
                      Atenção: Esta pasta contém {selectedFolder.children.length} subpasta(s) que também serão excluídas.
                    </span>
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleConfirmDeleteFolder}
                  className="bg-destructive hover:bg-destructive/90"
                >
                  Excluir
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Delete Prescription Confirmation */}
          <AlertDialog open={deletePrescriptionDialogOpen} onOpenChange={setDeletePrescriptionDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir prescrição</AlertDialogTitle>
                <AlertDialogDescription>
                  Tem certeza que deseja excluir esta prescrição? Esta ação não pode ser desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleConfirmDeletePrescription}
                  className="bg-destructive hover:bg-destructive/90"
                >
                  Excluir
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </PageLayout>
  );
}
