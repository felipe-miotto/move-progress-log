import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageLayout } from "@/components/PageLayout";
import { PageHeader } from "@/components/PageHeader";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pencil, Trash2, Filter, X, Database, Search, MoreVertical, AlertTriangle, Video, Zap, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { AddExerciseDialog } from "@/components/AddExerciseDialog";
import { EditExerciseLibraryDialog } from "@/components/EditExerciseLibraryDialog";
import {
  useExercisesLibrary,
  useDeleteExercise,
  ExerciseLibrary,
  MOVEMENT_PATTERNS,
  LATERALITY_OPTIONS,
  MOVEMENT_PLANES,
  CONTRACTION_TYPES,
  LEVEL_OPTIONS,
  EXERCISE_CATEGORIES,
  RISK_LEVELS,
  EXERCISE_DIMENSIONS,
  BOYLE_SCORE_SCALE,
  STRENGTH_SUBCATEGORIES,
  POTENCIA_SUBCATEGORIES,
  STABILITY_POSITION_OPTIONS,
  ExerciseFilters,
} from "@/hooks/useExercisesLibrary";
import { populateExercisesLibrary } from "@/utils/populateExercises";
import { toast } from "sonner";
import { logger } from "@/utils/logger";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import EmptyState from "@/components/EmptyState";
import { NAV_LABELS } from "@/constants/navigation";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useSEOHead, SEO_PRESETS } from "@/hooks/useSEOHead";
import { useOpenGraph, FABRIK_OG_DEFAULTS } from "@/hooks/useOpenGraph";
import { getWebPageSchema, getBreadcrumbSchema, getItemListSchema } from "@/utils/structuredData";

export default function ExercisesLibraryPage() {
  usePageTitle(NAV_LABELS.exercises);
  useSEOHead(SEO_PRESETS.private);
  useOpenGraph({
    ...FABRIK_OG_DEFAULTS,
    title: `${NAV_LABELS.exercises} · Fabrik Performance`,
    description: 'Biblioteca completa de exercícios funcionais, HIIT, yoga e mindfulness do método Body & Mind Fitness.',
    type: 'website',
    url: true,
  });
  
  const [filters, setFilters] = useState<ExerciseFilters>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [editingExercise, setEditingExercise] = useState<ExerciseLibrary | null>(null);
  const [deletingExerciseId, setDeletingExerciseId] = useState<string | null>(null);
  const [isPopulating, setIsPopulating] = useState(false);

  const { data: exercises, isLoading, refetch } = useExercisesLibrary({
    ...filters,
    search: searchTerm.trim() || undefined,
  });
  const deleteExercise = useDeleteExercise();

  const handlePopulateDatabase = async () => {
    setIsPopulating(true);
    try {
      const result = await populateExercisesLibrary();
      
      if (result.success) {
        toast.success(
          `${result.added} exercícios adicionados com sucesso! ${result.skipped} já existiam.`
        );
        refetch();
      } else {
        toast.error("Erro ao popular banco de dados");
      }
    } catch (error) {
      logger.error("Erro ao popular banco:", error);
      toast.error("Erro ao popular banco de dados");
    } finally {
      setIsPopulating(false);
    }
  };

  const handleDelete = async () => {
    if (deletingExerciseId) {
      await deleteExercise.mutateAsync(deletingExerciseId);
      setDeletingExerciseId(null);
    }
  };

  const clearFilters = () => {
    setFilters({});
    setSearchTerm("");
  };

  const hasActiveFilters =
    Object.values(filters).some((v) => v !== undefined && v !== null && String(v).trim() !== "") ||
    searchTerm.trim().length > 0;

  const filteredExercises = exercises;

  return (
    <PageLayout
      structuredData={[
        { data: getWebPageSchema(NAV_LABELS.exercises, "Biblioteca completa de exercícios com classificações por padrões de movimento, lateralidade, planos e tipos de contração"), id: "webpage-schema" },
        { data: getBreadcrumbSchema([{ label: "Home", href: "/" }, { label: NAV_LABELS.exercises, href: "/exercicios" }]), id: "breadcrumb-schema" },
        ...(exercises && exercises.length > 0 ? [{ data: getItemListSchema(exercises.map(ex => ({ name: ex.name })), "Biblioteca de Exercícios"), id: "exercises-list-schema" }] : []),
      ]}
    >
      <PageHeader
        title={NAV_LABELS.exercises}
        description={NAV_LABELS.subtitleExercises}
        breadcrumbs={[{ label: NAV_LABELS.exercises }]}
        actions={
          <div className="flex gap-xs">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Ações secundárias">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 bg-popover">
                <DropdownMenuItem
                  onClick={handlePopulateDatabase}
                  disabled={isPopulating}
                  className="gap-xs"
                >
                  <Database className="h-4 w-4" />
                  {isPopulating ? "Importando..." : NAV_LABELS.importExercises}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <AddExerciseDialog />
          </div>
        }
      />

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-xs">
              <Filter className="h-5 w-5" />
              <CardTitle>{NAV_LABELS.sectionFilters}</CardTitle>
            </div>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="h-4 w-4 mr-2" />
                Limpar Filtros
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-md">
          {/* Busca + filtros primários */}
          <div className="flex gap-md items-end flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar exercícios por nome..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            
            <div className="space-y-xs min-w-[180px]">
              <label className="text-sm font-medium">Categoria</label>
              <Select
                value={filters.category || "all"}
                onValueChange={(value) =>
                  setFilters((prev) => ({ 
                    ...prev, 
                    category: value === "all" ? undefined : value,
                    // Limpar filtros dependentes quando categoria muda
                    movement_pattern: value === "forca_hipertrofia" ? prev.movement_pattern : undefined,
                    subcategory: undefined,
                  }))
                }
              >
                <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {Object.entries(EXERCISE_CATEGORIES).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-xs min-w-[160px]">
              <label className="text-sm font-medium">Nível de Risco</label>
              <Select
                value={filters.risk_level || "all"}
                onValueChange={(value) =>
                  setFilters((prev) => ({ ...prev, risk_level: value === "all" ? undefined : value }))
                }
              >
                <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {Object.entries(RISK_LEVELS).map(([key, config]) => (
                    <SelectItem key={key} value={key}>{config.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {/* Filtros avançados — colapsáveis */}
          <details className="group">
            <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
              <Filter className="h-3.5 w-3.5" />
              Mais filtros
              {[filters.movement_pattern, filters.subcategory, filters.laterality, filters.movement_plane, filters.contraction_type, filters.stability_position].filter(Boolean).length > 0 && (
                <span className="text-xs ml-1">
                  ({[filters.movement_pattern, filters.subcategory, filters.laterality, filters.movement_plane, filters.contraction_type, filters.stability_position].filter(Boolean).length} ativos)
                </span>
              )}
            </summary>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-md pt-md mt-md border-t border-border/50">
              {/* Padrão de Movimento — só aparece para Força/Hipertrofia */}
              {filters.category === "forca_hipertrofia" && (
                <div className="space-y-xs">
                  <label className="text-sm font-medium">Padrão de Movimento</label>
                  <Select
                    value={filters.movement_pattern || "all"}
                    onValueChange={(value) =>
                      setFilters((prev) => ({ 
                        ...prev, 
                        movement_pattern: value === "all" ? undefined : value,
                        subcategory: undefined, // reset subcategory when pattern changes
                      }))
                    }
                  >
                    <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {Object.entries(MOVEMENT_PATTERNS).map(([key, label]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {/* Subcategoria — aparece para padrões com subdivisão ou Potência/Pliometria */}
              {(() => {
                let subcatOptions: Record<string, string> | null = null;
                if (filters.category === "forca_hipertrofia" && filters.movement_pattern && STRENGTH_SUBCATEGORIES[filters.movement_pattern]) {
                  subcatOptions = STRENGTH_SUBCATEGORIES[filters.movement_pattern];
                } else if (filters.category === "potencia_pliometria") {
                  subcatOptions = POTENCIA_SUBCATEGORIES;
                }
                if (!subcatOptions) return null;
                return (
                  <div className="space-y-xs">
                    <label className="text-sm font-medium">Subcategoria</label>
                    <Select
                      value={filters.subcategory || "all"}
                      onValueChange={(value) =>
                        setFilters((prev) => ({ ...prev, subcategory: value === "all" ? undefined : value }))
                      }
                    >
                      <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        {Object.entries(subcatOptions).map(([key, label]) => (
                          <SelectItem key={key} value={key}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })()}
              <div className="space-y-xs">
                <label className="text-sm font-medium">Lateralidade</label>
                <Select
                  value={filters.laterality || "all"}
                  onValueChange={(value) =>
                    setFilters((prev) => ({ ...prev, laterality: value === "all" ? undefined : value }))
                  }
                >
                  <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {Object.entries(LATERALITY_OPTIONS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-xs">
                <label className="text-sm font-medium">Plano de Movimento</label>
                <Select
                  value={filters.movement_plane || "all"}
                  onValueChange={(value) =>
                    setFilters((prev) => ({ ...prev, movement_plane: value === "all" ? undefined : value }))
                  }
                >
                  <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {Object.entries(MOVEMENT_PLANES).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-xs">
                <label className="text-sm font-medium">Tipo de Contração</label>
                <Select
                  value={filters.contraction_type || "all"}
                  onValueChange={(value) =>
                    setFilters((prev) => ({ ...prev, contraction_type: value === "all" ? undefined : value }))
                  }
                >
                  <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {Object.entries(CONTRACTION_TYPES).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-xs">
                <label className="text-sm font-medium">Base / Posição</label>
                <Select
                  value={filters.stability_position || "all"}
                  onValueChange={(value) =>
                    setFilters((prev) => ({ ...prev, stability_position: value === "all" ? undefined : value }))
                  }
                >
                  <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {Object.entries(STABILITY_POSITION_OPTIONS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

            </div>
          </details>
        </CardContent>
      </Card>

      {/* Exercise List */}
      {isLoading ? (
        <div className="grid gap-md md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="animate-fade-in" style={{ animationDelay: `${i * 0.05}s` }}>
              <CardContent className="pt-6 space-y-3">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-16 w-full" />
                <div className="flex gap-2">
                  <Skeleton className="h-6 w-20" />
                  <Skeleton className="h-6 w-20" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !filteredExercises || filteredExercises.length === 0 ? (
        hasActiveFilters ? (
          <EmptyState
            icon={<Search className="h-6 w-6" />}
            title="Nenhum exercício encontrado"
            description="Ajuste seus filtros ou limpe-os para ver todos os exercícios disponíveis. Você também pode adicionar novos exercícios à biblioteca."
            primaryAction={{
              label: "Limpar Filtros",
              onClick: clearFilters
            }}
            secondaryAction={{
              label: "Adicionar exercício",
              onClick: () => document.querySelector('[aria-label="Adicionar Exercício"]')?.dispatchEvent(new Event('click', { bubbles: true })),
            }}
          />
        ) : (
          <EmptyState
            icon={<Database className="h-6 w-6" />}
            title="Biblioteca de exercícios vazia"
            description="Comece sua biblioteca importando exercícios pré-configurados ou adicione seus próprios exercícios personalizados. Uma biblioteca bem organizada facilita a criação de prescrições eficazes."
            primaryAction={{
              label: "Importar Exercícios",
              onClick: handlePopulateDatabase
            }}
          />
        )
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md">
          {filteredExercises.map((exercise) => (
            <Card key={exercise.id}>
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-lg">{exercise.name}</CardTitle>
                      {exercise.video_url && (
                        <span title="Possui vídeo"><Video className="h-4 w-4 text-primary" /></span>
                      )}
                      {exercise.risk_level === 'high' && (
                        <span title="Alto risco"><AlertTriangle className="h-4 w-4 text-destructive" /></span>
                      )}
                    </div>
                    {/* Apenas Categoria + Nível visíveis */}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {exercise.category && (
                        <Badge variant="outline">
                          {EXERCISE_CATEGORIES[exercise.category as keyof typeof EXERCISE_CATEGORIES] || exercise.category}
                        </Badge>
                      )}
                      {exercise.level && (
                        <Badge variant="secondary">
                          {LEVEL_OPTIONS[exercise.level as keyof typeof LEVEL_OPTIONS]}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                
                {/* Detalhes técnicos — visíveis sob demanda */}
                <details className="group">
                  <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                    <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
                    Detalhes técnicos
                  </summary>
                  <div className="mt-2 space-y-2">
                    <div className="flex flex-wrap gap-1">
                      {exercise.movement_pattern && (
                        <Badge variant="outline" className="text-xs">
                          {MOVEMENT_PATTERNS[exercise.movement_pattern as keyof typeof MOVEMENT_PATTERNS] || exercise.movement_pattern}
                        </Badge>
                      )}
                      {exercise.risk_level && (
                        <Badge 
                          variant="outline"
                          className={`text-xs ${
                            exercise.risk_level === 'high' 
                              ? 'border-destructive text-destructive' 
                              : exercise.risk_level === 'medium' 
                                ? 'border-accent text-accent-foreground' 
                                : 'border-primary/50 text-primary'
                          }`}
                        >
                          {RISK_LEVELS[exercise.risk_level as keyof typeof RISK_LEVELS]?.label || exercise.risk_level}
                        </Badge>
                      )}
                      {exercise.laterality && (
                        <Badge variant="outline" className="text-xs">
                          {LATERALITY_OPTIONS[exercise.laterality as keyof typeof LATERALITY_OPTIONS] || exercise.laterality}
                        </Badge>
                      )}
                      {exercise.stability_position && (
                        <Badge variant="outline" className="text-xs">
                          {STABILITY_POSITION_OPTIONS[exercise.stability_position as keyof typeof STABILITY_POSITION_OPTIONS] || exercise.stability_position}
                        </Badge>
                      )}
                      {exercise.movement_plane && (
                        <Badge variant="outline" className="text-xs">
                          {MOVEMENT_PLANES[exercise.movement_plane as keyof typeof MOVEMENT_PLANES] || exercise.movement_plane}
                        </Badge>
                      )}
                      {exercise.contraction_type && (
                        <Badge variant="outline" className="text-xs">
                          {CONTRACTION_TYPES[exercise.contraction_type as keyof typeof CONTRACTION_TYPES] || exercise.contraction_type}
                        </Badge>
                      )}
                      {exercise.plyometric_phase && (
                        <Badge variant="outline" className="text-xs border-primary/50 text-primary">
                          <Zap className="h-3 w-3 mr-1" />
                          Fase {exercise.plyometric_phase}
                        </Badge>
                      )}
                    </div>
                    {/* Scores */}
                    {exercise.boyle_score != null && (
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="outline" className="text-xs font-mono">B{exercise.boyle_score}</Badge>
                        {exercise.axial_load != null && <Badge variant="outline" className="text-xs font-mono">AX{exercise.axial_load}</Badge>}
                        {exercise.lumbar_demand != null && <Badge variant="outline" className="text-xs font-mono">LOM{exercise.lumbar_demand}</Badge>}
                        {exercise.technical_complexity != null && <Badge variant="outline" className="text-xs font-mono">TEC{exercise.technical_complexity}</Badge>}
                        {exercise.metabolic_potential != null && <Badge variant="outline" className="text-xs font-mono">MET{exercise.metabolic_potential}</Badge>}
                        {exercise.knee_dominance != null && <Badge variant="outline" className="text-xs font-mono">JOE{exercise.knee_dominance}</Badge>}
                        {exercise.hip_dominance != null && <Badge variant="outline" className="text-xs font-mono">QUA{exercise.hip_dominance}</Badge>}
                      </div>
                    )}
                    {exercise.description && (
                      <p className="text-xs text-muted-foreground">{exercise.description}</p>
                    )}
                    {exercise.equipment_required && exercise.equipment_required.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        <strong>Equipamentos:</strong> {exercise.equipment_required.join(', ')}
                      </p>
                    )}
                  </div>
                </details>

                <div className="flex gap-xs items-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingExercise(exercise)}
                    className="flex-1"
                  >
                    <Pencil className="h-4 w-4 mr-2" />
                    Editar
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeletingExerciseId(exercise.id)}
                    className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                    aria-label="Excluir exercício"
                    title="Excluir exercício"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      {editingExercise && (
        <EditExerciseLibraryDialog
          exercise={editingExercise}
          open={!!editingExercise}
          onOpenChange={(open) => !open && setEditingExercise(null)}
        />
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingExerciseId} onOpenChange={() => setDeletingExerciseId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este exercício? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageLayout>
  );
}
