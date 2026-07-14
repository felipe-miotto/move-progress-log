import { useState } from "react";
import { Activity, Watch } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { OuraConnectionCard } from "@/components/OuraConnectionCard";
import { SendWhoopConnectDialog } from "@/components/SendWhoopConnectDialog";
import { useDisconnectWhoop } from "@/hooks/useWhoopConnection";
import { useWearableRecovery } from "@/hooks/useWearableRecovery";
import type { WearableSource } from "@/lib/wearables/normalizeRecovery";
import { RecoveryHeadline } from "./RecoveryHeadline";
import { MetricTile } from "./MetricTile";
import { AttentionFlags } from "./AttentionFlags";
import { WearableDetails } from "./WearableDetails";

const SOURCE_LABEL: Record<WearableSource, string> = { oura: "Oura", whoop: "Whoop" };

const daysSinceLocal = (ymd: string) =>
  Math.floor((Date.now() - new Date(`${ymd}T00:00:00`).getTime()) / 86_400_000);

interface RecoveryTabProps {
  studentId: string;
  studentName?: string;
}

export function RecoveryTab({ studentId, studentName }: RecoveryTabProps) {
  const r = useWearableRecovery(studentId, true);
  const disconnectWhoop = useDisconnectWhoop();
  const [override, setOverride] = useState<WearableSource | null>(null);

  const active: WearableSource | null = override ?? r.defaultSource;
  const rec = active === "whoop" ? r.whoop : active === "oura" ? r.oura : null;
  const bothWithData = r.sources.length > 1;

  if (r.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-[172px] w-full rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[150px] w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  // --- no device connected ---
  if (!r.ouraConnected && !r.whoopConnected) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <Watch className="mb-1 h-10 w-10 text-muted-foreground" />
            <p className="font-medium">Nenhum aparelho conectado</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Conecte o Oura Ring ou o Whoop de {studentName ?? "aluno"} para acompanhar a recuperação.
            </p>
          </CardContent>
        </Card>
        <ConnectionControls studentId={studentId} studentName={studentName} whoopConnected={r.whoopConnected} disconnect={() => disconnectWhoop.mutate(studentId)} disconnecting={disconnectWhoop.isPending} />
      </div>
    );
  }

  const staleness = active ? r.staleness[active] : { syncStale: false, metricStale: false };
  const metricStaleDays = rec && staleness.metricStale ? daysSinceLocal(rec.latestDate) : null;

  return (
    <div className="space-y-4">
      {/* source bar */}
      <div className="flex flex-wrap items-center gap-2.5">
        {r.ouraConnected && <SourceChip label="Oura" on={!!r.oura?.hasAnyData} />}
        {r.whoopConnected && <SourceChip label="Whoop" on={!!r.whoop?.hasAnyData} />}
        {bothWithData && active && (
          <div className="inline-flex overflow-hidden rounded-md border">
            {(["whoop", "oura"] as WearableSource[]).map((src) => (
              <button
                key={src}
                type="button"
                aria-pressed={active === src}
                onClick={() => setOverride(src)}
                className={`px-3 py-1.5 text-[13px] ${active === src ? "bg-primary font-semibold text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              >
                {SOURCE_LABEL[src]}
              </button>
            ))}
          </div>
        )}
        {active && (
          <span className="ml-auto text-[12.5px] text-muted-foreground">
            Fonte: {SOURCE_LABEL[active]}
            {override == null && bothWithData ? " (mais recente)" : ""}
          </span>
        )}
      </div>

      {rec ? (
        <>
          <RecoveryHeadline recovery={rec.recovery} source={rec.source} latestDate={rec.latestDate} />
          <AttentionFlags
            lowRecoveryStreak={rec.lowRecoveryStreak}
            syncStale={staleness.syncStale}
            metricStale={staleness.metricStale}
            metricStaleDays={metricStaleDays}
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <MetricTile title="VFC (HRV)" metric={rec.hrv} higherIsBetter />
            <MetricTile title="FC de repouso" metric={rec.restingHr} higherIsBetter={false} />
            <MetricTile title="Sono" metric={rec.sleep} higherIsBetter />
          </div>
          <WearableDetails rec={rec} />
        </>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <Activity className="mb-1 h-10 w-10 text-muted-foreground" />
            <p className="font-medium">Aparelho conectado, sem dados ainda</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Os dados aparecem após a primeira sincronização. Peça ao aluno para sincronizar o aparelho.
            </p>
          </CardContent>
        </Card>
      )}

      <ConnectionControls studentId={studentId} studentName={studentName} whoopConnected={r.whoopConnected} disconnect={() => disconnectWhoop.mutate(studentId)} disconnecting={disconnectWhoop.isPending} collapsed />
    </div>
  );
}

function SourceChip({ label, on }: { label: string; on: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-[13px] text-muted-foreground">
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: on ? "hsl(var(--success))" : "hsl(var(--muted-foreground) / 0.5)" }} />
      {label}
    </span>
  );
}

interface ConnCtrlProps {
  studentId: string;
  studentName?: string;
  whoopConnected: boolean;
  disconnect: () => void;
  disconnecting: boolean;
  collapsed?: boolean;
}

function ConnectionControls({ studentId, studentName, whoopConnected, disconnect, disconnecting, collapsed }: ConnCtrlProps) {
  const [whoopDialogOpen, setWhoopDialogOpen] = useState(false);
  const body = (
    <div className="space-y-4 pt-1">
      <OuraConnectionCard studentId={studentId} studentName={studentName} />
      <Card>
        <CardContent className="flex items-center justify-between gap-3 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
              <Activity className="h-4 w-4 text-primary" />
            </div>
            <span className="text-sm font-medium">Whoop {whoopConnected ? "conectado" : "não conectado"}</span>
          </div>
          {whoopConnected ? (
            <Button variant="outline" size="sm" onClick={disconnect} disabled={disconnecting}>
              Desconectar
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setWhoopDialogOpen(true)}>
              Enviar link
            </Button>
          )}
        </CardContent>
      </Card>
      <SendWhoopConnectDialog
        open={whoopDialogOpen}
        onOpenChange={setWhoopDialogOpen}
        studentId={studentId}
        studentName={studentName ?? "Aluno"}
      />
    </div>
  );

  if (!collapsed) return body;

  return (
    <details className="group rounded-lg border bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        <Watch className="h-4 w-4 text-muted-foreground" />
        Conexões e sincronização
      </summary>
      <div className="px-4 pb-4">{body}</div>
    </details>
  );
}
