/**
 * Componente de Revisão de Dimensões de Exercícios
 * Fase 1 do plano v14.5 — UI para classificação e revisão
 */

import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { notify } from "@/lib/notify";
import { useClassifyExercises } from "@/hooks/useClassifyExercises";
import { EXERCISE_DIMENSIONS, EXERCISE_CATEGORIES } from "@/constants/backToBasics";
import { Brain, Save, RefreshCw, CheckCircle2, AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { buildErrorDescription } from "@/utils/errorParsing";

const DIMENSION_KEYS = ["axial_load", "lumbar_demand", "technical_complexity", "metabolic_potential", "knee_dominance", "hip_dominance"] as const;

type DimensionKey = typeof DIMENSION_KEYS[number];

const PAGE_SIZE = 100;

interface DimensionEdit {
  id: string;
  [key: string]: string | number | null | undefined;
}

export const ExerciseDimensionReview = () => {
  const queryClient = useQueryClient();
  const { progress, runBatchClassification } = useClassifyExercises();
  const [edits, setEdits] = useState<Record<string, DimensionEdit>>({});
  const [filter, setFilter] = useState<"all" | "classified" | "unclassified">("unclassified");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);

  // Fetch exercises with dimension data
  const { data: exercises, isLoading } = useQuery({
    queryKey: ["exercises-dimensions", filter, categoryFilter],
    staleTime: 2 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      let allData: Array<{ id: string; name: string; category: string | null; movement_pattern: string | null; axial_load: number | null; lumbar_demand: number | null; technical_complexity: number | null; metabolic_potential: number | null; knee_dominance: number | null; hip_dominance: number | null }> = [];
      let from = 0;
      const batchSize = 500;
      let hasMore = true;

      while (hasMore) {
        let query = supabase
          .from("exercises_library")
          .select("id, name, category, movement_pattern, axial_load, lumbar_demand, technical_complexity, metabolic_potential, knee_dominance, hip_dominance")
          .order("name")
          .range(from, from + batchSize - 1);

        if (categoryFilter !== "all") {
          query = query.eq("category", categoryFilter);
        }

        const { data, error } = await query;
        if (error) throw error;
        if (data) {
          allData = [...allData, ...data];
          hasMore = data.length === batchSize;
          from += batchSize;
        } else {
          hasMore = false;
        }
      }

      // Apply filter
      if (filter === "classified") {
        return allData.filter((ex) => ex.axial_load !== null);
      }
      if (filter === "unclassified") {
        return allData.filter((ex) => ex.axial_load === null);
      }
      return allData;
    },
  });

  // Stats
  const stats = useMemo(() => {
    if (!exercises) return { total: 0, classified: 0, unclassified: 0, percentage: 0 };

    // We need total count regardless of filter
    return {
      total: exercises.length,
      classified: exercises.filter((e) => e.axial_load !== null).length,
      unclassified: exercises.filter((e) => e.axial_load === null).length,
      percentage: 0,
    };
  }, [exercises]);

  // Client-side pagination over the in-memory (fully fetched) list, so the
  // reviewer can reach every item instead of only the first 100 of a filter.
  const allExercises = exercises || [];
  const totalPages = Math.max(1, Math.ceil(allExercises.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pageExercises = allExercises.slice(pageStart, pageStart + PAGE_SIZE);

  // Back to page 1 whenever the filters change the dataset.
  useEffect(() => {
    setCurrentPage(1);
  }, [filter, categoryFilter]);

  // Keep the page in range if the list shrinks (refetch/save reclassification).
  useEffect(() => {
    setCurrentPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  // Total stats (unfiltered)
  const { data: totalStats } = useQuery({
    queryKey: ["exercises-dimension-stats"],
    staleTime: 2 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { count: total } = await supabase
        .from("exercises_library")
        .select("id", { count: "exact", head: true });

      const { count: classified } = await supabase
        .from("exercises_library")
        .select("id", { count: "exact", head: true })
        .not("axial_load", "is", null);

      const t = total || 0;
      const c = classified || 0;
      return {
        total: t,
        classified: c,
        unclassified: t - c,
        percentage: t > 0 ? Math.round((c / t) * 100) : 0,
      };
    },
  });

  const handleDimensionChange = useCallback((exerciseId: string, dimension: DimensionKey, value: number) => {
    setEdits((prev) => ({
      ...prev,
      [exerciseId]: {
        ...prev[exerciseId],
        id: exerciseId,
        [dimension]: value,
      },
    }));
  }, []);

  const saveMutation = useMutation({
    mutationFn: async (changes: DimensionEdit[]) => {
      for (const change of changes) {
        const { id, ...fields } = change;
        const cleanFields = Object.fromEntries(
          Object.entries(fields).filter(([, v]) => v !== undefined)
        );
        if (Object.keys(cleanFields).length === 0) continue;
        const { error } = await supabase
          .from("exercises_library")
          .update(cleanFields as never)
          .eq("id", id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exercises-dimensions"] });
      queryClient.invalidateQueries({ queryKey: ["exercises-dimension-stats"] });
      queryClient.invalidateQueries({ queryKey: ["exercises-library"] });
      setEdits({});
      notify.success("Dimensões atualizadas!");
    },
    onError: (err) => {
      notify.error("Erro ao salvar", { description: buildErrorDescription(err, "Tente novamente.") });
    },
  });

  const handleSave = () => {
    const changes = Object.values(edits);
    if (changes.length === 0) return;
    saveMutation.mutate(changes);
  };

  const handleRunClassification = async () => {
    await runBatchClassification();
    queryClient.invalidateQueries({ queryKey: ["exercises-dimensions"] });
    queryClient.invalidateQueries({ queryKey: ["exercises-dimension-stats"] });
    queryClient.invalidateQueries({ queryKey: ["exercises-library"] });
  };

  const editCount = Object.keys(edits).length;

  const getValue = (exerciseId: string, dimension: DimensionKey, originalValue: number | null): number | null => {
    const edit = edits[exerciseId];
    if (edit && edit[dimension] !== undefined) return edit[dimension] as number;
    return originalValue;
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total de Exercícios</CardDescription>
            <CardTitle className="text-2xl">{totalStats?.total || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Classificados</CardDescription>
            <CardTitle className="text-2xl text-primary">{totalStats?.classified || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pendentes</CardDescription>
            <CardTitle className="text-2xl text-destructive">{totalStats?.unclassified || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Cobertura</CardDescription>
            <CardTitle className="text-2xl">{totalStats?.percentage || 0}%</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Progress value={totalStats?.percentage || 0} className="h-2" />
          </CardContent>
        </Card>
      </div>

      {/* AI Classification */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Classificação por IA
          </CardTitle>
          <CardDescription>
            Usa IA para classificar exercícios pendentes nas 6 dimensões (AX, LOM, TEC, MET, JOE, QUA) com base nos exercícios de referência do documento v14.5.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={handleRunClassification}
            disabled={progress.isRunning || (totalStats?.unclassified || 0) === 0}
            className="w-full"
            size="lg"
          >
            {progress.isRunning ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Classificando... Lote {progress.currentBatch} ({progress.totalClassified} feitos, {progress.totalRemaining} restantes)
              </>
            ) : (totalStats?.unclassified || 0) === 0 ? (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Todos os exercícios estão classificados!
              </>
            ) : (
              <>
                <Brain className="h-4 w-4 mr-2" />
                Classificar {totalStats?.unclassified || 0} exercícios pendentes
              </>
            )}
          </Button>

          {progress.isRunning && (
            <Progress
              value={totalStats?.total ? ((progress.totalClassified / totalStats.total) * 100) : 0}
              className="h-2"
            />
          )}

          {progress.errors.length > 0 && (
            <div className="text-sm text-destructive space-y-1">
              <div className="flex items-center gap-1">
                <AlertTriangle className="h-4 w-4" />
                {progress.errors.length} erro(s):
              </div>
              {progress.errors.slice(0, 5).map((err, i) => (
                <p key={i} className="pl-5 text-xs">{err}</p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filters + Table */}
      <Card>
        <CardHeader>
          <CardTitle>Revisão Manual</CardTitle>
          <CardDescription>Revise e corrija as dimensões atribuídas pela IA.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            <Select value={filter} onValueChange={(v) => setFilter(v as "all" | "classified" | "unclassified")}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="classified">Classificados</SelectItem>
                <SelectItem value="unclassified">Pendentes</SelectItem>
              </SelectContent>
            </Select>

            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as categorias</SelectItem>
                {Object.entries(EXERCISE_CATEGORIES).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {editCount > 0 && (
              <Button onClick={handleSave} disabled={saveMutation.isPending} className="ml-auto">
                <Save className="h-4 w-4 mr-2" />
                Salvar {editCount} alterações
              </Button>
            )}
          </div>

          {isLoading ? (
            <p className="text-muted-foreground">Carregando...</p>
          ) : (
            <>
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[250px] sticky left-0 bg-background z-10">Nome</TableHead>
                    <TableHead className="text-center w-[80px]">Categoria</TableHead>
                    {DIMENSION_KEYS.map((dim) => (
                      <TableHead key={dim} className="text-center w-[80px]" title={EXERCISE_DIMENSIONS[dim].description}>
                        {EXERCISE_DIMENSIONS[dim].abbrev}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageExercises.map((ex) => (
                    <TableRow key={ex.id} className={edits[ex.id] ? "bg-accent/30" : ""}>
                      <TableCell className="font-medium text-sm sticky left-0 bg-background z-10">
                        {ex.name}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="text-[10px]">
                          {EXERCISE_CATEGORIES[ex.category as keyof typeof EXERCISE_CATEGORIES]?.slice(0, 8) || "—"}
                        </Badge>
                      </TableCell>
                      {DIMENSION_KEYS.map((dim) => {
                        const val = getValue(ex.id, dim, ex[dim]);
                        return (
                          <TableCell key={dim} className="text-center p-1">
                            <Select
                              value={val !== null && val !== undefined ? String(val) : ""}
                              onValueChange={(v) => handleDimensionChange(ex.id, dim, parseInt(v))}
                            >
                              <SelectTrigger className="h-8 w-[60px] text-xs mx-auto">
                                <SelectValue placeholder="—" />
                              </SelectTrigger>
                              <SelectContent>
                                {[0, 1, 2, 3, 4, 5].map((n) => (
                                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                  {allExercises.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        {filter === "unclassified" ? "Todos classificados! 🎉" : "Nenhum exercício encontrado."}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            {allExercises.length > 0 && (
              <div className="flex items-center justify-between gap-2 px-1 py-2 text-sm text-muted-foreground">
                <span>
                  Mostrando {pageStart + 1}–{pageStart + pageExercises.length} de {allExercises.length}
                </span>
                {totalPages > 1 && (
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setCurrentPage(safePage - 1)} disabled={safePage <= 1}>
                      <ChevronLeft className="h-4 w-4" />
                      Anterior
                    </Button>
                    <span>Página {safePage} de {totalPages}</span>
                    <Button variant="outline" size="sm" onClick={() => setCurrentPage(safePage + 1)} disabled={safePage >= totalPages}>
                      Próxima
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
