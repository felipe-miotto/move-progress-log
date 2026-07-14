import { describe, expect, it } from "vitest";
import {
  MIN_BASELINE_VALUES,
  normalizeOura,
  normalizeWhoop,
  RECOVERY_LABEL,
} from "../normalizeRecovery";
import type { OuraMetrics } from "@/hooks/useOuraMetrics";
import type { WhoopMetrics } from "@/hooks/useWhoopMetrics";

const oura = (over: Partial<OuraMetrics>): OuraMetrics =>
  ({
    id: over.date ?? "o", student_id: "s", date: "2026-07-01",
    readiness_score: null, sleep_score: null, hrv_balance: null,
    resting_heart_rate: null, temperature_deviation: null, activity_balance: null,
    activity_score: null, steps: null, active_calories: null, total_calories: null,
    met_minutes: null, high_activity_time: null, medium_activity_time: null,
    low_activity_time: null, sedentary_time: null, training_volume: null,
    training_frequency: null, total_sleep_duration: null, deep_sleep_duration: null,
    rem_sleep_duration: null, light_sleep_duration: null, awake_time: null,
    sleep_efficiency: null, sleep_latency: null, lowest_heart_rate: null,
    average_sleep_hrv: null, average_breath: null, stress_high_time: null,
    recovery_high_time: null, day_summary: null, spo2_average: null,
    breathing_disturbance_index: null, vo2_max: null, resilience_level: null,
    created_at: "2026-07-01T00:00:00Z", ...over,
  }) as OuraMetrics;

const whoop = (over: Partial<WhoopMetrics>): WhoopMetrics =>
  ({
    id: over.date ?? "w", student_id: "s", date: "2026-07-01", cycle_id: 1,
    recovery_score: null, hrv_rmssd: null, resting_heart_rate: null, spo2: null,
    skin_temp: null, day_strain: null, kilojoules: null, sleep_performance: null,
    sleep_efficiency: null, respiratory_rate: null, total_sleep_duration: null,
    deep_sleep_duration: null, rem_sleep_duration: null, light_sleep_duration: null,
    awake_time: null, disturbance_count: null, score_state: "SCORED",
    created_at: "2026-07-01T00:00:00Z", ...over,
  }) as WhoopMetrics;

// date-desc rows (newest first), like the hooks return
const daysDesc = (n: number, make: (i: number) => Partial<OuraMetrics>): OuraMetrics[] =>
  Array.from({ length: n }, (_, i) =>
    oura({ date: `2026-06-${String(30 - i).padStart(2, "0")}`, ...make(i) }),
  );

describe("normalizeOura", () => {
  it("returns null for no rows", () => {
    expect(normalizeOura([])).toBeNull();
  });

  it("maps readiness to native Oura bands (85/70)", () => {
    expect(normalizeOura([oura({ readiness_score: 85 })])!.recovery!.status).toBe("good");
    expect(normalizeOura([oura({ readiness_score: 84 })])!.recovery!.status).toBe("watch");
    expect(normalizeOura([oura({ readiness_score: 70 })])!.recovery!.status).toBe("watch");
    expect(normalizeOura([oura({ readiness_score: 69 })])!.recovery!.status).toBe("poor");
  });

  it("reads HRV from average_sleep_hrv, not hrv_balance", () => {
    const r = normalizeOura([oura({ average_sleep_hrv: 44, hrv_balance: 99 })])!;
    expect(r.hrv.value).toBe(44);
    expect(r.hrv.unit).toBe("ms");
  });

  it("typed temperature is a deviation for Oura", () => {
    const r = normalizeOura([oura({ temperature_deviation: 0.3 })])!;
    expect(r.secondary.temperature).toEqual({ kind: "deviation", value: 0.3 });
  });

  it(`hasBaseline is false below ${MIN_BASELINE_VALUES} valid values`, () => {
    const rows = daysDesc(6, () => ({ average_sleep_hrv: 45 }));
    expect(normalizeOura(rows)!.hrv.hasBaseline).toBe(false);
    expect(normalizeOura(rows)!.hrv.status).toBeNull();
  });

  it("hasBaseline counts VALID values, not calendar rows", () => {
    // 10 rows but only 6 have HRV -> still below threshold
    const rows = daysDesc(10, (i) => (i < 6 ? { average_sleep_hrv: 45 } : {}));
    expect(normalizeOura(rows)!.hrv.hasBaseline).toBe(false);
    const rows2 = daysDesc(10, () => ({ average_sleep_hrv: 45 }));
    expect(normalizeOura(rows2)!.hrv.hasBaseline).toBe(true);
  });

  it("computes delta vs baseline and a low-recovery streak", () => {
    const rows = daysDesc(8, (i) => ({
      readiness_score: i < 3 ? 60 : 90, // 3 most-recent poor days
      average_sleep_hrv: 40,
    }));
    const r = normalizeOura(rows)!;
    expect(r.lowRecoveryStreak).toBe(3);
    expect(r.hrv.hasBaseline).toBe(true);
    expect(r.hrv.delta).toBe(0); // all 40
  });
});

describe("normalizeWhoop", () => {
  it("maps recovery to native Whoop bands (67/34)", () => {
    expect(normalizeWhoop([whoop({ recovery_score: 67 })])!.recovery!.status).toBe("good");
    expect(normalizeWhoop([whoop({ recovery_score: 66 })])!.recovery!.status).toBe("watch");
    expect(normalizeWhoop([whoop({ recovery_score: 34 })])!.recovery!.status).toBe("watch");
    expect(normalizeWhoop([whoop({ recovery_score: 33 })])!.recovery!.status).toBe("poor");
  });

  it("suppresses recovery when score_state is not final", () => {
    const r = normalizeWhoop([whoop({ recovery_score: 80, score_state: "PENDING_SCORE" })])!;
    expect(r.recovery).toBeNull();
    expect(r.scoreState).toBe("PENDING_SCORE");
  });

  it("typed temperature is absolute for Whoop skin_temp", () => {
    const r = normalizeWhoop([whoop({ skin_temp: 33.4 })])!;
    expect(r.secondary.temperature).toEqual({ kind: "absolute", value: 33.4 });
    expect(r.secondary.strain).toBe(null);
  });

  it("does not count unscored rows in the low-recovery streak", () => {
    const rows = [
      whoop({ date: "2026-06-30", recovery_score: 20, score_state: "SCORED" }),
      whoop({ date: "2026-06-29", recovery_score: 25, score_state: "PENDING_SCORE" }),
      whoop({ date: "2026-06-28", recovery_score: 20, score_state: "SCORED" }),
    ];
    // streak stops at the unscored middle row
    expect(normalizeWhoop(rows)!.lowRecoveryStreak).toBe(1);
  });
});

describe("labels", () => {
  it("maps status to pt-BR labels", () => {
    expect(RECOVERY_LABEL.good).toBe("Recuperado");
    expect(RECOVERY_LABEL.watch).toBe("Atenção");
    expect(RECOVERY_LABEL.poor).toBe("Descansar");
  });
});
