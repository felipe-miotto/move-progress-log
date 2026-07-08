import { assertEquals } from "jsr:@std/assert";
import { syncStudent } from "./sync.ts";
import { CYCLES, RECOVERIES, SLEEPS } from "../_shared/wearable/fixtures/whoop_v2.ts";

Deno.test("syncStudent maps fixtures → one whoop_metrics upsert + success log", async () => {
  // deno-lint-ignore no-explicit-any
  const calls: { upserts: any[]; logs: any[] } = { upserts: [], logs: [] };
  const supa = {
    from(table: string) {
      return {
        // deno-lint-ignore no-explicit-any
        upsert(rows: any[], opts: any) {
          calls.upserts.push({ table, rows, opts });
          return Promise.resolve({ error: null });
        },
        // deno-lint-ignore no-explicit-any
        insert(row: any) {
          calls.logs.push({ table, row });
          return Promise.resolve({ error: null });
        },
      };
    },
  };

  const res = await syncStudent(
    { supa, fetchCollections: () => Promise.resolve({ cycles: CYCLES, recoveries: RECOVERIES, sleeps: SLEEPS, workouts: [] }) },
    { student_id: "s1", start: "2026-06-07", end: "2026-07-07", accessToken: "a" },
  );

  assertEquals(res.synced, 1);
  assertEquals(calls.upserts[0].table, "whoop_metrics");
  assertEquals(calls.upserts[0].opts.onConflict, "student_id,date");
  assertEquals(calls.upserts[0].rows[0].recovery_score, 66);
  assertEquals(calls.upserts[0].rows[0].student_id, "s1");
  assertEquals(calls.logs[0].table, "whoop_sync_logs");
  assertEquals(calls.logs[0].row.status, "success");
  assertEquals(calls.logs[0].row.metrics_synced, 1);
});

Deno.test("syncStudent logs a failure row and rethrows when the fetch fails", async () => {
  // deno-lint-ignore no-explicit-any
  const logs: any[] = [];
  const supa = {
    from() {
      return {
        // deno-lint-ignore no-explicit-any
        upsert() { return Promise.resolve({ error: null }); },
        // deno-lint-ignore no-explicit-any
        insert(row: any) { logs.push(row); return Promise.resolve({ error: null }); },
      };
    },
  };
  let threw = false;
  try {
    await syncStudent(
      { supa, fetchCollections: () => Promise.reject(new Error("boom")) },
      { student_id: "s1", start: "x", end: "y", accessToken: "a" },
    );
  } catch (_e) {
    threw = true;
  }
  assertEquals(threw, true);
  assertEquals(logs[0].status, "failed");
});
