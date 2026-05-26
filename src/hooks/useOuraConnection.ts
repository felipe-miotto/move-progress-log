import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { notify } from "@/lib/notify";
import i18n from "@/i18n/pt-BR.json";

interface OuraConnection {
  id: string;
  student_id: string;
  connected_at: string;
  last_sync_at: string | null;
  is_active: boolean;
}

interface UseOuraConnectionOptions {
  pollUntilConnected?: boolean;
  refetchIntervalMs?: number;
}

// Configuração de timeout por tipo de operação
const SYNC_TIMEOUT_CONFIG = {
  singleDay: 30000,    // 30s para sync de 1 dia
  multiDayBase: 45000, // 45s base para multi-day
  perDayIncrement: 5000, // +5s por dia adicional
  maxTimeout: 120000,  // máximo 2 minutos
} as const;

/**
 * Calcula timeout dinâmico baseado no número de dias a sincronizar
 */
const calculateSyncTimeout = (days: number): number => {
  if (days <= 1) {
    return SYNC_TIMEOUT_CONFIG.singleDay;
  }
  
  const calculated = SYNC_TIMEOUT_CONFIG.multiDayBase + 
    (days - 1) * SYNC_TIMEOUT_CONFIG.perDayIncrement;
  
  return Math.min(calculated, SYNC_TIMEOUT_CONFIG.maxTimeout);
};

export const useOuraConnection = (
  studentId: string,
  options: UseOuraConnectionOptions = {}
) => {
  return useQuery({
    queryKey: ["oura-connection", studentId],
    enabled: !!studentId,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: options.pollUntilConnected
      ? (query) => query.state.data ? false : options.refetchIntervalMs ?? 5000
      : false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("oura_connections")
        .select("*")
        .eq("student_id", studentId)
        .eq("is_active", true)
        .maybeSingle();

      if (error) throw error;
      return data as OuraConnection | null;
    },
  });
};

/**
 * Helper function to invoke edge functions with configurable timeout
 * Previne requisições que ficam travadas indefinidamente
 */
const invokeWithTimeout = async (
  functionName: string,
  body: Record<string, unknown>,
  timeoutMs: number
): Promise<unknown> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const { data, error } = await supabase.functions.invoke(functionName, {
      body,
      // @ts-expect-error - Supabase types may not include signal yet
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (error) throw error;
    return data;
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    
    const isAbortError = error instanceof Error && error.name === "AbortError";
    if (isAbortError) {
      throw new Error(
        "Timeout: A sincronização demorou muito. Verifique sua conexão com a internet."
      );
    }
    throw error;
  }
};

interface SyncParams {
  student_id: string;
  date?: string;
  days?: number;
  onProgress?: (current: number, total: number) => void;
}

interface MultiDaySyncResult {
  success: boolean;
  total: number;
  successful: number;
  failed: number;
  message: string;
}

type SyncResult = { status: "fulfilled"; value: unknown } | { status: "rejected"; reason: unknown };

export const useSyncOura = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      student_id,
      date,
      days = 1,
      onProgress,
    }: SyncParams): Promise<MultiDaySyncResult | unknown> => {
      // Detectar status offline ANTES de fazer requisição
      if (!navigator.onLine) {
        throw new Error(
          "Você está offline. Conecte-se à internet para sincronizar."
        );
      }

      const timeout = calculateSyncTimeout(days);

      if (days === 1) {
        // Single day sync
        onProgress?.(1, 1);
        const data = await invokeWithTimeout("oura-sync", { student_id, date }, timeout);
        return data;
      } else {
        // Multiple days sync with progress tracking - Use Brazil timezone
        const results: SyncResult[] = [];
        let completed = 0;

        for (let i = 0; i < days; i++) {
          // Calculate date in Brazil timezone (UTC-3)
          const nowUTC = new Date();
          const brazilOffsetMinutes = 3 * 60;
          const syncDateBrazil = new Date(nowUTC.getTime() - brazilOffsetMinutes * 60 * 1000);
          syncDateBrazil.setDate(syncDateBrazil.getDate() - i);
          const dateStr = syncDateBrazil.toISOString().split("T")[0];

          try {
            const data = await invokeWithTimeout(
              "oura-sync",
              { student_id, date: dateStr },
              timeout
            );

            completed++;
            onProgress?.(completed, days);
            results.push({ status: "fulfilled", value: data });
          } catch (error) {
            completed++;
            onProgress?.(completed, days);
            results.push({ status: "rejected", reason: error });
          }
        }

        const successful = results.filter((r) => r.status === "fulfilled").length;
        const failed = results.filter((r) => r.status === "rejected").length;

        if (successful === 0) {
          throw new Error("Falha ao sincronizar todos os dias");
        }

        return {
          success: true,
          total: days,
          successful,
          failed,
          message:
            failed > 0
              ? `Sincronizados ${successful} de ${days} dias (${failed} com problemas)`
              : `Todos os ${days} dias sincronizados com sucesso!`,
        };
      }
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["oura-connection", variables.student_id],
      });
      queryClient.invalidateQueries({
        queryKey: ["oura-metrics", variables.student_id],
      });
      queryClient.invalidateQueries({
        queryKey: ["oura-metrics-latest", variables.student_id],
      });
      queryClient.invalidateQueries({
        queryKey: ["oura-workouts", variables.student_id],
      });

      const result = data as MultiDaySyncResult | undefined;
      
      if (variables.days && variables.days > 1 && result?.message) {
        const description = result.failed > 0
          ? `${result.successful} dias sincronizados. Alguns dias podem não ter dados disponíveis ainda.`
          : `${result.successful} dias sincronizados com sucesso!`;
        
        notify.success(result.message, { description });
      } else {
        notify.success(i18n.modules.oura.dataUpdated, {
          description: i18n.modules.oura.synced
        });
      }
    },
    onError: (error: Error) => {
      let title = "❌ Erro na sincronização";
      let description = "";

      // Detectar tipo específico de erro para feedback preciso
      if (
        !navigator.onLine ||
        error.message.includes("offline") ||
        error.message.includes("Você está offline")
      ) {
        title = "🔴 Sem conexão com a internet";
        description = "Conecte-se à internet e tente novamente.";
      } else if (
        error.message.includes("timeout") ||
        error.message.includes("Timeout")
      ) {
        title = "⏱️ Tempo esgotado";
        description =
          "A sincronização demorou muito. Verifique sua conexão e tente novamente.";
      } else if (
        error.message.includes("token") ||
        error.message.includes("unauthorized") ||
        error.message.includes("autenticação")
      ) {
        title = "🔒 Autenticação expirada";
        description =
          "Se a conexão acabou de ser aceita, aguarde alguns segundos e tente novamente. Se persistir, gere um novo link de convite.";
      } else if (error.message.includes("Falha ao sincronizar todos")) {
        title = "❌ Nenhum dado disponível";
        description =
          "Não foi possível sincronizar nenhum dia. Tente mais tarde.";
      } else {
        description =
          "Verifique se o Oura Ring está sincronizado e sua conexão com a internet. Tente novamente mais tarde.";
      }

      notify.error(title, {
        description,
        duration: 8000,
      });
    },
  });
};

export const useDisconnectOura = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (student_id: string) => {
      const { data, error } = await supabase.functions.invoke(
        "oura-disconnect",
        {
          body: { student_id },
        }
      );

      if (error) throw error;
      return data;
    },
    onSuccess: (_, student_id) => {
      queryClient.invalidateQueries({
        queryKey: ["oura-connection", student_id],
      });
      notify.success(i18n.modules.oura.disconnected, {
        description: "Seus dados já sincronizados foram preservados. Você pode reconectar a qualquer momento."
      });
    },
    onError: (error: Error) => {
      notify.error(i18n.modules.oura.errorDisconnect, {
        description: error.message || "Tente novamente em alguns instantes"
      });
    },
  });
};
