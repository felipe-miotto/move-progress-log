import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { notify } from "@/lib/notify";
import i18n from "@/i18n/pt-BR.json";
import { buildErrorDescription } from "@/utils/errorParsing";

/**
 * Maximum folder nesting depth (0-based `depth_level`).
 *
 * Mirrors the `check_max_depth` constraint and the `update_folder_full_path()`
 * limit in the database. A folder can hold subfolders only while its
 * `depth_level` is strictly below this value.
 */
export const MAX_FOLDER_DEPTH = 5;

export interface PrescriptionFolder {
  id: string;
  name: string;
  trainer_id: string;
  order_index: number;
  parent_id: string | null;
  depth_level: number;
  full_path: string | null;
  created_at: string;
  updated_at: string;
  children?: PrescriptionFolder[];
}

const PRESCRIPTION_FOLDERS_SELECT =
  "id, name, trainer_id, order_index, parent_id, depth_level, full_path, created_at, updated_at";

// Build hierarchical structure from flat list
const buildFolderTree = (folders: PrescriptionFolder[]): PrescriptionFolder[] => {
  const folderMap = new Map<string, PrescriptionFolder>();
  const rootFolders: PrescriptionFolder[] = [];

  // First pass: create map and initialize children arrays
  folders.forEach(folder => {
    folderMap.set(folder.id, { ...folder, children: [] });
  });

  // Second pass: build tree structure
  folders.forEach(folder => {
    const folderWithChildren = folderMap.get(folder.id)!;
    
    if (!folder.parent_id) {
      rootFolders.push(folderWithChildren);
    } else {
      const parent = folderMap.get(folder.parent_id);
      if (parent) {
        parent.children!.push(folderWithChildren);
      }
    }
  });

  return rootFolders;
};

/**
 * Relative height of a folder's subtree (0 when it has no children).
 * Used to predict whether a move would exceed MAX_FOLDER_DEPTH.
 */
export const getFolderSubtreeHeight = (folder: PrescriptionFolder): number => {
  if (!folder.children || folder.children.length === 0) return 0;
  return 1 + Math.max(...folder.children.map(getFolderSubtreeHeight));
};

/**
 * Ids of every descendant folder (children, grandchildren, ...). Used to
 * block dropping a folder into itself or one of its own descendants.
 */
export const getDescendantFolderIds = (folder: PrescriptionFolder): string[] => {
  if (!folder.children || folder.children.length === 0) return [];
  return folder.children.flatMap((child) => [
    child.id,
    ...getDescendantFolderIds(child),
  ]);
};

/**
 * Flatten a hierarchical folder list into a depth-first array with each
 * node's indentation level and full path. Useful for rendering folder
 * pickers (Select) where every folder — at any depth — is a valid target.
 */
export const flattenFolderTree = (
  folders: PrescriptionFolder[],
  level = 0,
): Array<{ id: string; name: string; level: number; full_path: string | null }> =>
  folders.reduce((acc, folder) => {
    acc.push({
      id: folder.id,
      name: folder.name,
      level,
      full_path: folder.full_path,
    });
    if (folder.children && folder.children.length > 0) {
      acc.push(...flattenFolderTree(folder.children, level + 1));
    }
    return acc;
  }, [] as Array<{ id: string; name: string; level: number; full_path: string | null }>);

// Fetch all folders for current trainer (returns hierarchical structure)
export const useFolders = () => {
  return useQuery({
    queryKey: ["prescription-folders"],
    staleTime: 5 * 60 * 1000,
    gcTime: 20 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { data, error } = await supabase
        .from("prescription_folders")
        .select(PRESCRIPTION_FOLDERS_SELECT)
        .eq("trainer_id", user.id)
        .order("depth_level", { ascending: true })
        .order("order_index", { ascending: true });

      if (error) throw error;
      
      const folders = data as PrescriptionFolder[];
      return buildFolderTree(folders);
    },
  });
};

// Create new folder (supports parent_id for subfolders)
export const useCreateFolder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ name, parentId }: { name: string; parentId?: string | null }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Get max order_index for folders at the same level
      const query = supabase
        .from("prescription_folders")
        .select("order_index")
        .eq("trainer_id", user.id);

      if (parentId) {
        query.eq("parent_id", parentId);
      } else {
        query.is("parent_id", null);
      }

      const { data: folders } = await query
        .order("order_index", { ascending: false })
        .limit(1);

      const maxOrder = folders && folders.length > 0 ? folders[0].order_index : -1;

      const { data, error } = await supabase
        .from("prescription_folders")
        .insert({
          name: name.trim(),
          trainer_id: user.id,
          parent_id: parentId || null,
          order_index: maxOrder + 1,
        })
        .select(PRESCRIPTION_FOLDERS_SELECT)
        .single();

      if (error) throw error;
      return data as PrescriptionFolder;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prescription-folders"] });
      notify.success("Pasta criada com sucesso!");
    },
    onError: (error: Error) => {
      notify.error("Erro ao criar pasta", {
        description: buildErrorDescription(error, i18n.errors.unknown),
      });
    },
  });
};

// Update folder (rename)
export const useUpdateFolder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase
        .from("prescription_folders")
        .update({ name: name.trim() })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prescription-folders"] });
      notify.success("Pasta renomeada com sucesso!");
    },
    onError: (error: Error) => {
      notify.error("Erro ao renomear pasta", {
        description: buildErrorDescription(error, i18n.errors.unknown),
      });
    },
  });
};

// Delete folder (prescriptions move to null folder_id)
export const useDeleteFolder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (folderId: string) => {
      // Prescriptions will be set to null automatically by ON DELETE SET NULL
      const { error } = await supabase
        .from("prescription_folders")
        .delete()
        .eq("id", folderId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prescription-folders"] });
      queryClient.invalidateQueries({ queryKey: ["prescriptions"] });
      notify.success("Pasta excluída com sucesso!");
    },
    onError: (error: Error) => {
      notify.error("Erro ao excluir pasta", {
        description: buildErrorDescription(error, i18n.errors.unknown),
      });
    },
  });
};

// Reorder folders
export const useReorderFolders = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (folders: Array<{ id: string; order_index: number }>) => {
      // Update all folders in a transaction-like manner
      const updates = folders.map(({ id, order_index }) =>
        supabase
          .from("prescription_folders")
          .update({ order_index })
          .eq("id", id)
      );

      await Promise.all(updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prescription-folders"] });
    },
    onError: (error: Error) => {
      notify.error("Erro ao reordenar pastas", {
        description: buildErrorDescription(error, i18n.errors.unknown),
      });
    },
  });
};

// Move a folder (and its whole subtree) to a new parent, or to the root.
// Delegates to the move_prescription_folder RPC, which is the authority for
// ownership, cycle and depth validation; frontend guards are UX-only.
export const useMoveFolder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      folderId,
      newParentId = null,
      orderIndex = null,
    }: {
      folderId: string;
      newParentId?: string | null;
      orderIndex?: number | null;
    }) => {
      const { error } = await supabase.rpc("move_prescription_folder", {
        p_folder_id: folderId,
        p_new_parent_id: newParentId,
        p_order_index: orderIndex,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prescription-folders"] });
      queryClient.invalidateQueries({ queryKey: ["prescriptions"] });
    },
    onError: (error: Error) => {
      notify.error("Erro ao mover pasta", {
        description: buildErrorDescription(error, i18n.errors.unknown),
      });
    },
  });
};

// Move prescription to folder
export const useMovePrescription = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      prescriptionId, 
      folderId, 
      orderIndex 
    }: { 
      prescriptionId: string; 
      folderId: string | null; 
      orderIndex: number;
    }) => {
      const { error } = await supabase
        .from("workout_prescriptions")
        .update({ 
          folder_id: folderId,
          order_index: orderIndex 
        })
        .eq("id", prescriptionId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prescriptions"] });
    },
    onError: (error: Error) => {
      notify.error("Erro ao mover prescrição", {
        description: buildErrorDescription(error, i18n.errors.unknown),
      });
    },
  });
};

// Reorder prescriptions within folder
export const useReorderPrescriptions = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (prescriptions: Array<{ id: string; order_index: number }>) => {
      const updates = prescriptions.map(({ id, order_index }) =>
        supabase
          .from("workout_prescriptions")
          .update({ order_index })
          .eq("id", id)
      );

      await Promise.all(updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prescriptions"] });
    },
    onError: (error: Error) => {
      notify.error("Erro ao reordenar prescrições", {
        description: buildErrorDescription(error, i18n.errors.unknown),
      });
    },
  });
};
