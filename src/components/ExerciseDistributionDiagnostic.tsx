import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  EXERCISE_CATEGORIES,
  getMovementPatternLabel,
} from "@/constants/backToBasics";

interface DistributionRow {
  category: string | null;
  movement_pattern: string | null;
  subcategory: string | null;
  total: number;
}

const useExerciseDistribution = () => {
  return useQuery({
    queryKey: ["exercise-distribution-diagnostic"],
    staleTime: 2 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      // Query 1: By category + movement_pattern
      const { data: byPattern, error: e1 } = await supabase
        .rpc("get_exercise_distribution_by_pattern" as never) as { data: null; error: { message: string } | null };

      // Fallback: manual aggregation
      const { data: allExercises, error: e2 } = await supabase
        .from("exercises_library")
        .select("category, movement_pattern, subcategory, laterality, level, numeric_level");

      if (e2) throw e2;

      const exercises = allExercises || [];

      // Aggregate by category
      const byCategory = new Map<string, number>();
      const byCatPattern = new Map<string, Map<string, number>>();
      const byCatSubcat = new Map<string, Map<string, number>>();
      const noCategory: string[] = [];
      let nullMovementInForce = 0;
      let nullSubcategory = 0;
      let nullLevel = 0;

      for (const ex of exercises) {
        const cat = ex.category || "__null__";
        byCategory.set(cat, (byCategory.get(cat) || 0) + 1);

        // Pattern within category
        if (!byCatPattern.has(cat)) byCatPattern.set(cat, new Map());
        const mp = ex.movement_pattern || "__null__";
        const patternMap = byCatPattern.get(cat)!;
        patternMap.set(mp, (patternMap.get(mp) || 0) + 1);

        // Subcategory
        if (!byCatSubcat.has(cat)) byCatSubcat.set(cat, new Map());
        const sc = ex.subcategory || "__null__";
        const subcatMap = byCatSubcat.get(cat)!;
        subcatMap.set(sc, (subcatMap.get(sc) || 0) + 1);

        // Integrity checks
        if (!ex.category) noCategory.push(ex.category || "?");
        if (cat === "forca_hipertrofia" && !ex.movement_pattern) nullMovementInForce++;
        if (!ex.subcategory) nullSubcategory++;
        if (ex.numeric_level === null && ex.level === null) nullLevel++;
      }

      return {
        total: exercises.length,
        byCategory,
        byCatPattern,
        byCatSubcat,
        issues: {
          noCategory: noCategory.length,
          nullMovementInForce,
          nullSubcategory,
          nullLevel,
        },
      };
    },
  });
};

const categoryLabel = (key: string) =>
  EXERCISE_CATEGORIES[key as keyof typeof EXERCISE_CATEGORIES] || key;

const patternLabel = (key: string) => getMovementPatternLabel(key) ?? key;

export const ExerciseDistributionDiagnostic = () => {
  const { data, isLoading } = useExerciseDistribution();

  if (isLoading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-6 w-64" /></CardHeader>
        <CardContent><Skeleton className="h-60 w-full" /></CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const hasIssues =
    data.issues.noCategory > 0 ||
    data.issues.nullMovementInForce > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Distribuição de Exercícios
          <Badge variant={hasIssues ? "destructive" : "secondary"} className="ml-2">
            {data.total} exercícios
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Integrity Issues */}
        {hasIssues && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 space-y-2">
            <h4 className="font-medium flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Problemas de Integridade
            </h4>
            {data.issues.noCategory > 0 && (
              <p className="text-sm">⚠️ {data.issues.noCategory} exercícios sem categoria</p>
            )}
            {data.issues.nullMovementInForce > 0 && (
              <p className="text-sm">⚠️ {data.issues.nullMovementInForce} exercícios de Força sem padrão de movimento</p>
            )}
            {data.issues.nullSubcategory > 0 && (
              <p className="text-sm text-muted-foreground">ℹ️ {data.issues.nullSubcategory} exercícios sem subcategoria</p>
            )}
            {data.issues.nullLevel > 0 && (
              <p className="text-sm text-muted-foreground">ℹ️ {data.issues.nullLevel} exercícios sem nível definido</p>
            )}
          </div>
        )}

        {!hasIssues && (
          <div className="rounded-md border border-primary/30 bg-primary/5 p-4">
            <p className="text-sm flex items-center gap-2 text-primary">
              <CheckCircle2 className="h-4 w-4" />
              Todas as categorias e padrões de movimento estão consistentes.
            </p>
          </div>
        )}

        {/* Category Breakdown */}
        <div className="space-y-4">
          {Array.from(data.byCategory.entries())
            .filter(([k]) => k !== "__null__")
            .sort((a, b) => b[1] - a[1])
            .map(([cat, count]) => {
              const patternMap = data.byCatPattern.get(cat);
              const subcatMap = data.byCatSubcat.get(cat);

              return (
                <div key={cat} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">{categoryLabel(cat)}</h4>
                    <Badge variant="outline">{count}</Badge>
                  </div>

                  {/* Movement patterns (only for força) */}
                  {cat === "forca_hipertrofia" && patternMap && (
                    <div className="pl-4 space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Padrões de Movimento</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {Array.from(patternMap.entries())
                          .filter(([k]) => k !== "__null__")
                          .sort((a, b) => b[1] - a[1])
                          .map(([pattern, pCount]) => (
                            <div key={pattern} className="flex items-center justify-between text-sm bg-muted/50 rounded px-3 py-1.5">
                              <span>{patternLabel(pattern)}</span>
                              <Badge variant="secondary" className="ml-2 text-xs">{pCount}</Badge>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Subcategories */}
                  {subcatMap && (
                    <div className="pl-4 space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Subcategorias</p>
                      <div className="flex flex-wrap gap-2">
                        {Array.from(subcatMap.entries())
                          .filter(([k]) => k !== "__null__")
                          .sort((a, b) => b[1] - a[1])
                          .map(([subcat, sCount]) => (
                            <Badge key={subcat} variant="outline" className="text-xs">
                              {subcat} ({sCount})
                            </Badge>
                          ))}
                        {subcatMap.has("__null__") && (
                          <Badge variant="destructive" className="text-xs">
                            sem subcategoria ({subcatMap.get("__null__")})
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </CardContent>
    </Card>
  );
};
