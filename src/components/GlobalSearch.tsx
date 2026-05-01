import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Search, Users, FileText, Dumbbell, Loader2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ROUTES } from "@/constants/navigation";
import { useDebounce } from "@/hooks/useDebounce";
import { logger } from "@/utils/logger";

interface SearchResult {
  id: string;
  name: string;
  type: "student" | "prescription" | "exercise";
  subtitle?: string;
}

export const GlobalSearch = () => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const navigate = useNavigate();
  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery || searchQuery.length < 2) {
      setResults([]);
      setSearchError(null);
      return;
    }

    setIsSearching(true);
    setSearchError(null);
    const searchResults: SearchResult[] = [];

    try {
      const [studentsData, prescriptionsData, exercisesData] = await Promise.all([
        supabase
          .from("students")
          .select("id, name")
          .ilike("name", `%${searchQuery}%`)
          .limit(5),
        supabase
          .from("workout_prescriptions")
          .select("id, name, objective")
          .ilike("name", `%${searchQuery}%`)
          .limit(5),
        supabase
          .from("exercises_library")
          .select("id, name, movement_pattern")
          .ilike("name", `%${searchQuery}%`)
          .limit(5),
      ]);

      const searchErrors = [
        studentsData.error,
        prescriptionsData.error,
        exercisesData.error,
      ].filter(Boolean);

      if (searchErrors.length > 0) {
        throw new Error(searchErrors.map((error) => error?.message).join(" | "));
      }

      if (studentsData.data) {
        studentsData.data.forEach((student) => {
          searchResults.push({
            id: student.id,
            name: student.name,
            type: "student",
          });
        });
      }

      if (prescriptionsData.data) {
        prescriptionsData.data.forEach((prescription) => {
          searchResults.push({
            id: prescription.id,
            name: prescription.name,
            type: "prescription",
            subtitle: prescription.objective || undefined,
          });
        });
      }

      if (exercisesData.data) {
        exercisesData.data.forEach((exercise) => {
          searchResults.push({
            id: exercise.id,
            name: exercise.name,
            type: "exercise",
            subtitle: exercise.movement_pattern,
          });
        });
      }

      setResults(searchResults);
    } catch (error) {
      logger.error("Erro ao buscar:", error);
      setResults([]);
      setSearchError("Não foi possível carregar a busca agora. Tente novamente.");
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    performSearch(debouncedQuery);
  }, [debouncedQuery, performSearch]);

  const handleSelect = (result: SearchResult) => {
    setOpen(false);
    setQuery("");
    
    switch (result.type) {
      case "student":
        navigate(`${ROUTES.students}/${result.id}`);
        break;
      case "prescription":
        navigate(ROUTES.prescriptions);
        break;
      case "exercise":
        navigate(ROUTES.exercises);
        break;
    }
  };

  const getIcon = (type: SearchResult["type"]) => {
    switch (type) {
      case "student":
        return <Users className="h-4 w-4 mr-2" />;
      case "prescription":
        return <FileText className="h-4 w-4 mr-2" />;
      case "exercise":
        return <Dumbbell className="h-4 w-4 mr-2" />;
    }
  };

  const getTypeLabel = (type: SearchResult["type"]) => {
    switch (type) {
      case "student":
        return "Aluno";
      case "prescription":
        return "Prescrição";
      case "exercise":
        return "Exercício";
    }
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput 
          placeholder="Buscar alunos, prescrições ou exercícios..." 
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {isSearching && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          
          {!isSearching && query.length >= 2 && searchError && (
            <CommandEmpty>
              <div className="px-6 py-6 text-center" role="alert">
                <AlertCircle className="h-8 w-8 mx-auto mb-2 text-destructive" />
                <p className="text-sm font-medium">Erro ao buscar</p>
                <p className="text-sm text-muted-foreground mt-1">{searchError}</p>
                <button
                  type="button"
                  className="mt-4 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => performSearch(query)}
                >
                  Tentar novamente
                </button>
              </div>
            </CommandEmpty>
          )}

          {!isSearching && query.length >= 2 && !searchError && results.length === 0 && (
            <CommandEmpty>
              <div className="text-center py-6">
                <Search className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Nenhum resultado encontrado para "{query}"
                </p>
              </div>
            </CommandEmpty>
          )}

          {!isSearching && results.length > 0 && (
            <>
              {["student", "prescription", "exercise"].map((type) => {
                const typeResults = results.filter((r) => r.type === type);
                if (typeResults.length === 0) return null;

                return (
                  <CommandGroup key={type} heading={getTypeLabel(type as SearchResult["type"]) + "s"}>
                    {typeResults.map((result) => (
                      <CommandItem
                        key={`${result.type}-${result.id}`}
                        value={`${result.type}-${result.name}`}
                        onSelect={() => handleSelect(result)}
                        className="gap-2"
                      >
                        {getIcon(result.type)}
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">{result.name}</span>
                          {result.subtitle && (
                            <span className="text-xs text-muted-foreground">{result.subtitle}</span>
                          )}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                );
              })}
            </>
          )}

          {query.length < 2 && !isSearching && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Digite pelo menos 2 caracteres para buscar</p>
              <p className="text-xs mt-2">
                Use <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">⌘K</kbd> para abrir rapidamente
              </p>
            </div>
          )}
        </CommandList>
      </CommandDialog>
  );
};
