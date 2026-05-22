import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MAX_FOLDER_DEPTH, useCreateFolder, PrescriptionFolder } from "@/hooks/useFolders";
import { Loader2, FolderPlus } from "lucide-react";
import { buildErrorDescription } from "@/utils/errorParsing";

interface CreateSubfolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folders: PrescriptionFolder[];
  defaultParentId?: string | null;
}

// Flatten folder tree for selection (only folders below MAX_FOLDER_DEPTH can have children)
const getEligibleParentFolders = (
  folders: PrescriptionFolder[],
  level = 0
): Array<{ id: string; name: string; level: number; fullPath: string }> => {
  return folders.reduce((acc, folder) => {
    // Only folders with depth_level < MAX_FOLDER_DEPTH can have children.
    if (folder.depth_level < MAX_FOLDER_DEPTH) {
      acc.push({
        id: folder.id,
        name: folder.name,
        level: folder.depth_level,
        fullPath: folder.full_path || folder.name,
      });
    }
    
    if (folder.children && folder.children.length > 0) {
      acc.push(...getEligibleParentFolders(folder.children, level + 1));
    }
    return acc;
  }, [] as Array<{ id: string; name: string; level: number; fullPath: string }>);
};

export function CreateSubfolderDialog({
  open,
  onOpenChange,
  folders,
  defaultParentId,
}: CreateSubfolderDialogProps) {
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string | null>(defaultParentId || null);
  const [error, setError] = useState("");
  const createFolder = useCreateFolder();

  const eligibleParents = getEligibleParentFolders(folders);

  useEffect(() => {
    if (open) {
      setName("");
      setParentId(defaultParentId || null);
      setError("");
    }
  }, [open, defaultParentId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      setError("Nome da pasta é obrigatório");
      return;
    }

    if (name.trim().length > 50) {
      setError("Nome deve ter no máximo 50 caracteres");
      return;
    }

    try {
      await createFolder.mutateAsync({ 
        name: name.trim(), 
        parentId: parentId || undefined 
      });
      onOpenChange(false);
    } catch (err: unknown) {
      const msg = buildErrorDescription(err) || String(err);
      if (msg.includes("Maximum folder depth")) {
        setError("Limite de profundidade atingido (máximo 5 níveis)");
      } else {
        setError(msg);
      }
    }
  };

  const selectedParent = eligibleParents.find(f => f.id === parentId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-sm">
            <FolderPlus className="h-5 w-5" />
            {parentId ? "Criar Subpasta" : "Criar Pasta"}
          </DialogTitle>
          <DialogDescription>
            {parentId
              ? `Criar uma subpasta dentro de "${selectedParent?.name}"`
              : "Criar uma nova pasta raiz para organizar suas prescrições"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-md">
          {/* Parent folder selection */}
          <div className="space-y-sm">
            <Label htmlFor="parent-folder">Pasta pai (opcional)</Label>
            <Select
              value={parentId || "root"}
              onValueChange={(value) => setParentId(value === "root" ? null : value)}
            >
              <SelectTrigger id="parent-folder">
                <SelectValue placeholder="Raiz (sem pasta pai)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="root">📁 Raiz (sem pasta pai)</SelectItem>
                {eligibleParents.map((folder) => (
                  <SelectItem key={folder.id} value={folder.id}>
                    <span style={{ paddingLeft: `${folder.level * 12}px` }}>
                      {folder.level > 0 && "└ "}
                      {folder.fullPath}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Limite: 5 níveis de profundidade
            </p>
          </div>

          {/* Folder name */}
          <div className="space-y-sm">
            <Label htmlFor="folder-name">
              Nome da {parentId ? "subpasta" : "pasta"}
            </Label>
            <Input
              id="folder-name"
              placeholder="Ex: Treinos de Segunda"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError("");
              }}
              maxLength={50}
              autoFocus
            />
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <p className="text-xs text-muted-foreground">
              {name.length}/50 caracteres
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={createFolder.isPending || !name.trim()}
            >
              {createFolder.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Criar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
