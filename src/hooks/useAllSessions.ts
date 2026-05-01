import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatSessionTime } from "@/utils/sessionTime";
import { format } from "date-fns";

interface SessionFilters {
  studentIds?: string[];
  prescriptionIds?: string[];
  startDate?: Date;
  endDate?: Date;
  startTime?: string;
  endTime?: string;
  sessionType?: "individual" | "group" | "all";
  finalized?: boolean;
}

export interface SessionWithDetails {
  id: string;
  date: string;
  time: string;
  session_type: string;
  workout_name: string | null;
  room_name: string | null;
  trainer_name: string | null;
  is_finalized: boolean;
  can_reopen: boolean;
  prescription_id: string | null;
  student_id: string;
  student: {
    name: string;
    avatar_url: string | null;
  };
  prescription: {
    name: string;
  } | null;
  exercises: Array<{
    load_kg: number | null;
  }>;
}

const ALL_SESSIONS_PAGE_SIZE = 500;
const ALL_SESSIONS_MAX_PAGES = 40;

const SESSION_SELECT = `
  id, date, time, session_type, workout_name, room_name,
  trainer_name, is_finalized, can_reopen, prescription_id, student_id,
  student:students!student_id ( name, avatar_url ),
  prescription:workout_prescriptions!prescription_id ( name ),
  exercises!session_id ( load_kg )
`;

const normalizeSessionRows = (rows: SessionWithDetails[]): SessionWithDetails[] =>
  rows.map((row) => ({
    ...row,
    time: formatSessionTime(row.time),
  }));

function buildSessionQuery(filters?: SessionFilters) {
  let query = supabase
    .from("workout_sessions")
    .select(SESSION_SELECT);

  if (filters?.studentIds && filters.studentIds.length > 0) {
    query = query.in("student_id", filters.studentIds);
  }
  if (filters?.prescriptionIds && filters.prescriptionIds.length > 0) {
    query = query.in("prescription_id", filters.prescriptionIds);
  }
  if (filters?.startDate) {
    query = query.gte("date", format(filters.startDate, "yyyy-MM-dd"));
  }
  if (filters?.endDate) {
    query = query.lte("date", format(filters.endDate, "yyyy-MM-dd"));
  }
  if (filters?.startTime) {
    query = query.gte("time", filters.startTime);
  }
  if (filters?.endTime) {
    query = query.lte("time", filters.endTime);
  }
  if (filters?.sessionType && filters.sessionType !== "all") {
    query = query.eq("session_type", filters.sessionType);
  }
  if (typeof filters?.finalized === "boolean") {
    query = query.eq("is_finalized", filters.finalized);
  }
  return query;
}

function buildStableQueryKey(prefix: string, filters?: SessionFilters) {
  // INC-005: Serialized primitives for stable queryKey
  const stableStudentIds = filters?.studentIds ? [...filters.studentIds].sort().join(",") : "";
  const stablePrescriptionIds = filters?.prescriptionIds
    ? [...filters.prescriptionIds].sort().join(",")
    : "";

  return [
    prefix,
    stableStudentIds,
    stablePrescriptionIds,
    filters?.startDate?.toISOString() ?? "",
    filters?.endDate?.toISOString() ?? "",
    filters?.startTime ?? "",
    filters?.endTime ?? "",
    filters?.sessionType ?? "all",
    typeof filters?.finalized === "boolean" ? String(filters.finalized) : "all",
  ];
}

// Legacy hook — loads all sessions at once (kept for backward compatibility)
export function useAllSessions(filters?: SessionFilters) {
  return useQuery({
    queryKey: buildStableQueryKey("all-sessions", filters),
    staleTime: 2 * 60 * 1000,
    gcTime: 20 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const allSessions: SessionWithDetails[] = [];

      for (let pageIndex = 0; pageIndex < ALL_SESSIONS_MAX_PAGES; pageIndex += 1) {
        const from = pageIndex * ALL_SESSIONS_PAGE_SIZE;
        const to = from + ALL_SESSIONS_PAGE_SIZE - 1;

        const query = buildSessionQuery(filters)
          .order("date", { ascending: false })
          .order("time", { ascending: false })
          .order("id", { ascending: false })
          .range(from, to);

        const { data, error } = await query;
        if (error) throw error;
        if (!data || data.length === 0) break;

        allSessions.push(...normalizeSessionRows(data as SessionWithDetails[]));
        if (data.length < ALL_SESSIONS_PAGE_SIZE) break;
      }

      return allSessions;
    },
  });
}

// MEL-003: Paginated hook with cursor-based infinite scrolling
const PAGE_SIZE = 50;

export function useAllSessionsPaginated(filters?: SessionFilters) {
  return useInfiniteQuery({
    queryKey: buildStableQueryKey("all-sessions-paginated", filters),
    staleTime: 2 * 60 * 1000,
    gcTime: 20 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async ({ pageParam = 0 }) => {
      const from = pageParam * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const query = buildSessionQuery(filters)
        .order("date", { ascending: false })
        .order("time", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to);

      const { data, error } = await query;
      if (error) throw error;
      return {
        sessions: normalizeSessionRows((data || []) as SessionWithDetails[]),
        page: pageParam,
        hasMore: (data?.length ?? 0) === PAGE_SIZE,
      };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.page + 1 : undefined,
  });
}
