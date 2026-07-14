/**
 * Device-agnostic normalization for wearable recovery data (Op 2).
 *
 * PURE functions only — no data fetching, no `Date.now()`. The hook
 * (`useWearableRecovery`) owns the queries and injects `now` for staleness.
 * Op 3 (Whoop deep build-out) consumes this same layer.
 *
 * Key decisions (grill + 3-round Codex review, 2026-07-14):
 * - Oura HRV comes from `average_sleep_hrv` (ms), NOT `hrv_balance`.
 * - Recovery status uses PROVIDER-NATIVE thresholds mapped to shared labels
 *   (Oura 85/70, Whoop 67/34) — never a shared numeric cutoff.
 * - Baseline validity is per metric from >= 7 VALID (non-null) values.
 * - Whoop `score_state` must be final ('SCORED') for recovery band / streak.
 * - Temperature is typed ({kind:'deviation'|'absolute'}) — Oura deviation vs
 *   Whoop absolute skin_temp are never conflated.
 */
import type { OuraMetrics } from "@/hooks/useOuraMetrics";
import type { WhoopMetrics } from "@/hooks/useWhoopMetrics";

export type WearableSource = "oura" | "whoop";
export type RecoveryStatus = "good" | "watch" | "poor";

export interface MetricView {
  value: number | null;
  unit: string;
  /** latest - baseline (null when no value or no baseline) */
  delta: number | null;
  baseline: number | null;
  /** true only when >= MIN_BASELINE_VALUES valid values exist for this metric */
  hasBaseline: boolean;
  /** chronological (oldest -> newest) valid-or-null series for the sparkline */
  series: number[];
  /** derived from trend vs the person's OWN baseline; null when no baseline */
  status: RecoveryStatus | null;
}

export interface TemperatureView {
  kind: "deviation" | "absolute";
  value: number;
}

export interface WearableRecovery {
  source: WearableSource;
  latestDate: string;
  /** Whoop score_state ('SCORED' etc.); null for Oura (always usable) */
  scoreState: string | null;
  /** null when the latest row has no usable recovery score / is not final */
  recovery: { value: number; status: RecoveryStatus } | null;
  hrv: MetricView;
  restingHr: MetricView;
  sleep: MetricView;
  secondary: {
    respiratoryRate: number | null;
    temperature: TemperatureView | null;
    strain: number | null;
  };
  /** consecutive most-recent final rows whose recovery status is 'poor' */
  lowRecoveryStreak: number;
  hasAnyData: boolean;
}

export const MIN_BASELINE_VALUES = 7;
const WINDOW = 28; // rolling-baseline window (days of valid values considered)
const SPARK_POINTS = 14;

const ouraRecoveryStatus = (score: number): RecoveryStatus =>
  score >= 85 ? "good" : score >= 70 ? "watch" : "poor";

const whoopRecoveryStatus = (score: number): RecoveryStatus =>
  score >= 67 ? "good" : score >= 34 ? "watch" : "poor";

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Build a MetricView from date-DESC rows. `pick` extracts the metric value.
 * `higherIsBetter` sets the trend polarity for the derived status.
 */
function buildMetric<T extends { date: string }>(
  rowsDesc: T[],
  pick: (row: T) => number | null,
  unit: string,
  higherIsBetter: boolean,
): MetricView {
  const chrono = [...rowsDesc].reverse(); // oldest -> newest
  const values = chrono.map(pick);
  const valid = values.filter((v): v is number => v != null && !Number.isNaN(v));
  const latest = (() => {
    for (const row of rowsDesc) {
      const v = pick(row);
      if (v != null && !Number.isNaN(v)) return v;
    }
    return null;
  })();

  const windowValid = valid.slice(-WINDOW);
  const hasBaseline = windowValid.length >= MIN_BASELINE_VALUES;
  const baseline = hasBaseline ? mean(windowValid) : null;
  const delta = latest != null && baseline != null ? latest - baseline : null;

  let status: RecoveryStatus | null = null;
  if (latest != null && baseline != null && baseline !== 0) {
    const ratio = latest / baseline;
    if (higherIsBetter) {
      status = ratio >= 0.98 ? "good" : ratio >= 0.9 ? "watch" : "poor";
    } else {
      status = ratio <= 1.02 ? "good" : ratio <= 1.08 ? "watch" : "poor";
    }
  }

  const series = values.slice(-SPARK_POINTS).map((v) => (v == null ? NaN : v));
  return { value: latest, unit, delta, baseline, hasBaseline, series, status };
}

function lowStreak(
  rowsDesc: { status: RecoveryStatus | null }[],
): number {
  let n = 0;
  for (const r of rowsDesc) {
    if (r.status == null) break; // stop at first non-final / unscored row
    if (r.status === "poor") n += 1;
    else break;
  }
  return n;
}

export function normalizeOura(rowsDesc: OuraMetrics[]): WearableRecovery | null {
  if (!rowsDesc || rowsDesc.length === 0) return null;
  const latest = rowsDesc[0];

  const recovery =
    latest.readiness_score != null
      ? { value: latest.readiness_score, status: ouraRecoveryStatus(latest.readiness_score) }
      : null;

  const streak = lowStreak(
    rowsDesc.map((r) => ({
      status: r.readiness_score != null ? ouraRecoveryStatus(r.readiness_score) : null,
    })),
  );

  return {
    source: "oura",
    latestDate: latest.date,
    scoreState: null,
    recovery,
    hrv: buildMetric(rowsDesc, (r) => r.average_sleep_hrv, "ms", true),
    restingHr: buildMetric(rowsDesc, (r) => r.resting_heart_rate, "bpm", false),
    sleep: buildMetric(rowsDesc, (r) => r.sleep_score, "/100", true),
    secondary: {
      respiratoryRate: latest.average_breath,
      temperature:
        latest.temperature_deviation != null
          ? { kind: "deviation", value: latest.temperature_deviation }
          : null,
      strain: null,
    },
    lowRecoveryStreak: streak,
    hasAnyData: true,
  };
}

/** Whoop rows count toward recovery band / streak only when scored (final). */
const whoopIsFinal = (row: WhoopMetrics): boolean =>
  (row.score_state == null || row.score_state.toUpperCase() === "SCORED") &&
  row.recovery_score != null;

export function normalizeWhoop(rowsDesc: WhoopMetrics[]): WearableRecovery | null {
  if (!rowsDesc || rowsDesc.length === 0) return null;
  const latest = rowsDesc[0];

  const recovery = whoopIsFinal(latest)
    ? { value: latest.recovery_score as number, status: whoopRecoveryStatus(latest.recovery_score as number) }
    : null;

  const streak = lowStreak(
    rowsDesc.map((r) => ({
      status: whoopIsFinal(r) ? whoopRecoveryStatus(r.recovery_score as number) : null,
    })),
  );

  return {
    source: "whoop",
    latestDate: latest.date,
    scoreState: latest.score_state ?? null,
    recovery,
    hrv: buildMetric(rowsDesc, (r) => r.hrv_rmssd, "ms", true),
    restingHr: buildMetric(rowsDesc, (r) => r.resting_heart_rate, "bpm", false),
    sleep: buildMetric(rowsDesc, (r) => r.sleep_performance, "/100", true),
    secondary: {
      respiratoryRate: latest.respiratory_rate,
      temperature:
        latest.skin_temp != null ? { kind: "absolute", value: latest.skin_temp } : null,
      strain: latest.day_strain,
    },
    lowRecoveryStreak: streak,
    hasAnyData: true,
  };
}

/** Human labels (pt-BR) for a recovery status — used by the headline. */
export const RECOVERY_LABEL: Record<RecoveryStatus, string> = {
  good: "Recuperado",
  watch: "Atenção",
  poor: "Descansar",
};
