import { assembleDailyMetrics } from '../_shared/wearable/mapWhoop.ts';
import { WHOOP } from '../_shared/wearable/providerConfig.ts';

// deno-lint-ignore no-explicit-any
type Rec = Record<string, any>;

export interface Collections {
  cycles: Rec[];
  recoveries: Rec[];
  sleeps: Rec[];
  workouts: Rec[];
}

// Paginate one WHOOP v2 collection over [start, end].
async function page(accessToken: string, path: string, start: string, end: string): Promise<Rec[]> {
  const out: Rec[] = [];
  let nextToken: string | undefined;
  do {
    const url = new URL(`${WHOOP.apiBase}${path}`);
    url.searchParams.set('start', start);
    url.searchParams.set('end', end);
    url.searchParams.set('limit', '25');
    if (nextToken) url.searchParams.set('nextToken', nextToken);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new Error(`${path} ${res.status}`);
    const j = await res.json();
    out.push(...(j.records ?? []));
    nextToken = j.next_token || undefined;
  } while (nextToken);
  return out;
}

// Real network fetcher (prod). Injected in tests.
export async function fetchCollectionsReal(accessToken: string, start: string, end: string): Promise<Collections> {
  const [cycles, recoveries, sleeps, workouts] = await Promise.all([
    page(accessToken, '/v2/cycle', start, end),
    page(accessToken, '/v2/recovery', start, end),
    page(accessToken, '/v2/activity/sleep', start, end),
    page(accessToken, '/v2/activity/workout', start, end),
  ]);
  return { cycles, recoveries, sleeps, workouts };
}

export interface SyncDeps {
  // deno-lint-ignore no-explicit-any
  supa: any;
  fetchCollections: (token: string, start: string, end: string) => Promise<Collections>;
}

// Fetch → map (cycle-join) → upsert whoop_metrics → log. The fetch layer is
// injected so the whole path is unit-tested against fixtures (no device).
export async function syncStudent(
  deps: SyncDeps,
  args: { student_id: string; start: string; end: string; accessToken: string },
): Promise<{ synced: number }> {
  const { supa } = deps;
  try {
    const { cycles, recoveries, sleeps } = await deps.fetchCollections(args.accessToken, args.start, args.end);
    const rows = assembleDailyMetrics(cycles, recoveries, sleeps, 'America/Sao_Paulo')
      .map((r) => ({ ...r, student_id: args.student_id }));
    if (rows.length) {
      const { error } = await supa.from('whoop_metrics').upsert(rows, { onConflict: 'student_id,date' });
      if (error) throw error;
    }
    await supa.from('whoop_sync_logs').insert({ student_id: args.student_id, status: 'success', metrics_synced: rows.length });
    return { synced: rows.length };
  } catch (e) {
    await supa.from('whoop_sync_logs').insert({ student_id: args.student_id, status: 'failed', error_message: String(e) });
    throw e;
  }
}
