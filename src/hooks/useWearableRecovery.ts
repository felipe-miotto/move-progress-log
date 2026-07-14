/**
 * Composes Oura + Whoop metrics/connections into the device-agnostic
 * `WearableRecovery` shape (Op 2). Owns the recovery-tab queries (>= 28-30 rows
 * for both providers) so the page never double-fetches; the normalizer stays pure.
 */
import { useMemo } from "react";
import { useOuraMetrics } from "@/hooks/useOuraMetrics";
import { useWhoopMetrics } from "@/hooks/useWhoopMetrics";
import { useOuraConnection } from "@/hooks/useOuraConnection";
import { useWhoopConnection } from "@/hooks/useWhoopConnection";
import {
  normalizeOura,
  normalizeWhoop,
  type WearableRecovery,
  type WearableSource,
} from "@/lib/wearables/normalizeRecovery";

const LOOKBACK_ROWS = 30;
const SYNC_STALE_HOURS = 36;
const METRIC_STALE_DAYS = 2;

export interface Staleness {
  syncStale: boolean;
  metricStale: boolean;
}

export interface WearableRecoveryResult {
  oura: WearableRecovery | null;
  whoop: WearableRecovery | null;
  ouraConnected: boolean;
  whoopConnected: boolean;
  /** sources that returned data, newest-first-friendly */
  sources: WearableSource[];
  /** freshest non-stale final source (Codex R2): user can override in the UI */
  defaultSource: WearableSource | null;
  staleness: Record<WearableSource, Staleness>;
  connections: { oura: { lastSyncAt: string | null } | null; whoop: { lastSyncAt: string | null } | null };
  isLoading: boolean;
  isError: boolean;
}

const hoursSince = (iso: string | null, now: number): number | null =>
  iso ? (now - new Date(iso).getTime()) / 3_600_000 : null;

const daysSinceDate = (ymd: string, now: number): number => {
  // treat the metric `date` as a local calendar day
  const d = new Date(`${ymd}T00:00:00`).getTime();
  return Math.floor((now - d) / 86_400_000);
};

export function useWearableRecovery(
  studentId: string,
  enabled: boolean,
): WearableRecoveryResult {
  const id = enabled ? studentId : "";
  const ouraQ = useOuraMetrics(id, LOOKBACK_ROWS);
  const whoopQ = useWhoopMetrics(id, LOOKBACK_ROWS);
  const ouraConnQ = useOuraConnection(studentId);
  const whoopConnQ = useWhoopConnection(studentId);

  return useMemo<WearableRecoveryResult>(() => {
    const now = Date.now();
    const oura = normalizeOura(ouraQ.data ?? []);
    const whoop = normalizeWhoop(whoopQ.data ?? []);
    const ouraConn = (ouraConnQ.data as { last_sync_at: string | null } | null | undefined) ?? null;
    const whoopConn = (whoopConnQ.data as { last_sync_at: string | null } | null | undefined) ?? null;

    const staleFor = (rec: WearableRecovery | null, lastSyncAt: string | null): Staleness => {
      const syncH = hoursSince(lastSyncAt, now);
      return {
        syncStale: syncH != null && syncH > SYNC_STALE_HOURS,
        metricStale: rec != null && daysSinceDate(rec.latestDate, now) >= METRIC_STALE_DAYS,
      };
    };

    const staleness: Record<WearableSource, Staleness> = {
      oura: staleFor(oura, ouraConn?.last_sync_at ?? null),
      whoop: staleFor(whoop, whoopConn?.last_sync_at ?? null),
    };

    const sources: WearableSource[] = [];
    if (whoop?.hasAnyData) sources.push("whoop");
    if (oura?.hasAnyData) sources.push("oura");

    // default = freshest non-stale FINAL recovery source; else freshest final; else any data
    const candidates: { src: WearableSource; rec: WearableRecovery; final: boolean; stale: boolean }[] = [];
    if (whoop) candidates.push({ src: "whoop", rec: whoop, final: whoop.recovery != null, stale: staleness.whoop.metricStale });
    if (oura) candidates.push({ src: "oura", rec: oura, final: oura.recovery != null, stale: staleness.oura.metricStale });
    const rank = (c: (typeof candidates)[number]) =>
      (c.final ? 2 : 0) + (!c.stale ? 1 : 0);
    candidates.sort((a, b) => {
      const r = rank(b) - rank(a);
      if (r !== 0) return r;
      return b.rec.latestDate.localeCompare(a.rec.latestDate);
    });
    const defaultSource = candidates[0]?.src ?? null;

    return {
      oura,
      whoop,
      ouraConnected: !!ouraConn,
      whoopConnected: !!whoopConn,
      sources,
      defaultSource,
      staleness,
      connections: {
        oura: ouraConn ? { lastSyncAt: ouraConn.last_sync_at ?? null } : null,
        whoop: whoopConn ? { lastSyncAt: whoopConn.last_sync_at ?? null } : null,
      },
      isLoading: ouraQ.isLoading || whoopQ.isLoading,
      isError: ouraQ.isError || whoopQ.isError,
    };
  }, [ouraQ.data, whoopQ.data, ouraConnQ.data, whoopConnQ.data, ouraQ.isLoading, whoopQ.isLoading, ouraQ.isError, whoopQ.isError]);
}
