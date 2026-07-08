import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { notify } from "@/lib/notify";
import { buildErrorDescription } from "@/utils/errorParsing";

export interface WhoopConnection {
  id: string;
  student_id: string;
  connected_at: string;
  last_sync_at: string | null;
  is_active: boolean;
}

const WHOOP_CONNECTION_SELECT = "id, student_id, connected_at, last_sync_at, is_active";

export const useWhoopConnection = (studentId: string) => {
  return useQuery({
    queryKey: ["whoop-connection", studentId],
    enabled: !!studentId,
    staleTime: 0,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      // whoop_* tables are new; generated Database types don't include them yet
      // (Lovable regenerates on merge). Query via an untyped view.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = supabase as any;
      const { data, error } = await client
        .from("whoop_connections")
        .select(WHOOP_CONNECTION_SELECT)
        .eq("student_id", studentId)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      return (data as WhoopConnection | null) ?? null;
    },
  });
};

export const useDisconnectWhoop = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (student_id: string) => {
      const { data, error } = await supabase.functions.invoke("whoop-disconnect", {
        body: { student_id },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, student_id) => {
      void queryClient.invalidateQueries({ queryKey: ["whoop-connection", student_id] });
      void queryClient.invalidateQueries({ queryKey: ["whoop-metrics", student_id] });
      notify.success("Whoop desconectado", {
        description: "Os dados já sincronizados foram preservados. Você pode reconectar a qualquer momento.",
      });
    },
    onError: (error: Error) => {
      notify.error("Erro ao desconectar Whoop", {
        description: buildErrorDescription(error, "Tente novamente em alguns instantes"),
      });
    },
  });
};
