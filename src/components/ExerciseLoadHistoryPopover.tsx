import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { History } from "lucide-react";
import { useExerciseLoadHistory } from "@/hooks/useExerciseLoadHistory";
import { formatDistanceToNow, parseISO, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ExerciseLoadHistoryPopoverProps {
  exerciseName: string;
  exerciseLibraryId?: string | null;
  prescriptionId: string;
  children: React.ReactNode;
  /** For TV mode dark theme */
  darkMode?: boolean;
}

export const ExerciseLoadHistoryPopover = ({
  exerciseName,
  exerciseLibraryId,
  prescriptionId,
  children,
  darkMode = false,
}: ExerciseLoadHistoryPopoverProps) => {
  const [open, setOpen] = useState(false);

  const { data: history, isLoading } = useExerciseLoadHistory({
    exerciseName,
    exerciseLibraryId,
    prescriptionId,
    enabled: open,
  });

  const hasStudents = history && history.length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="group inline-flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity"
          type="button"
          title="Ver histórico de cargas"
        >
          {children}
          <History
            className={`h-3.5 w-3.5 opacity-0 group-hover:opacity-60 transition-opacity ${
              darkMode ? "text-[#888]" : "text-muted-foreground"
            }`}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className={`w-80 p-0 ${
          darkMode
            ? "bg-[#1a1a1a] border-[#333] text-[#f0f0f0]"
            : ""
        }`}
        align="center"
        sideOffset={8}
      >
        {/* Header */}
        <div
          className={`px-4 py-3 border-b ${
            darkMode ? "border-[#333]" : "border-border"
          }`}
        >
          <p className="font-semibold text-sm truncate">{exerciseName}</p>
          <p
            className={`text-xs mt-0.5 ${
              darkMode ? "text-[#888]" : "text-muted-foreground"
            }`}
          >
            Histórico de cargas
          </p>
        </div>

        {/* Body */}
        <div className="px-4 py-3 space-y-2 max-h-60 overflow-y-auto">
          {isLoading ? (
            <>
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-3/4" />
            </>
          ) : !hasStudents ? (
            <p
              className={`text-xs text-center py-2 ${
                darkMode ? "text-[#666]" : "text-muted-foreground"
              }`}
            >
              Nenhum aluno atribuído
            </p>
          ) : history && history.length > 0 ? (
            history.map((item) => {
              const isStale =
                item.lastDate &&
                differenceInDays(new Date(), parseISO(item.lastDate)) > 30;

              return (
                <div
                  key={item.studentId}
                  className={`flex items-center justify-between gap-2 text-sm py-1 ${
                    darkMode
                      ? "border-b border-[#222] last:border-0"
                      : "border-b border-border/50 last:border-0"
                  }`}
                >
                  <span
                    className={`font-medium truncate flex-1 min-w-0 ${
                      darkMode ? "text-[#e0e0e0]" : ""
                    }`}
                  >
                    {item.studentName}
                  </span>
                  {item.lastDate ? (
                    <div className="flex flex-col items-end shrink-0 text-right">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-semibold ${
                            darkMode ? "text-[#f0f0f0]" : ""
                          }`}
                        >
                          {item.lastLoadKg
                            ? `${item.lastLoadKg} kg`
                            : item.lastLoadDescription || "—"}
                        </span>
                        <span
                          className={`text-xs ${
                            isStale
                              ? "text-warning"
                              : darkMode
                              ? "text-[#777]"
                              : "text-muted-foreground"
                          }`}
                        >
                          {formatDistanceToNow(parseISO(item.lastDate), {
                            addSuffix: true,
                            locale: ptBR,
                          })}
                        </span>
                      </div>
                      {item.lastObservations && (
                        <span
                          className={`text-xs italic mt-0.5 max-w-[200px] truncate ${
                            darkMode ? "text-[#999]" : "text-muted-foreground"
                          }`}
                          title={item.lastObservations}
                        >
                          {item.lastObservations}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span
                      className={`text-xs italic ${
                        darkMode ? "text-[#555]" : "text-muted-foreground"
                      }`}
                    >
                      sem registro
                    </span>
                  )}
                </div>
              );
            })
          ) : (
            <p
              className={`text-xs text-center py-2 ${
                darkMode ? "text-[#666]" : "text-muted-foreground"
              }`}
            >
              Sem dados disponíveis
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
