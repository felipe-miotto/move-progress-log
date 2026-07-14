import { Card } from "@/components/ui/card";
import { statusStyle } from "./recoveryStatus";
import { RECOVERY_LABEL, type RecoveryStatus, type WearableSource } from "@/lib/wearables/normalizeRecovery";

interface RecoveryHeadlineProps {
  recovery: { value: number; status: RecoveryStatus } | null;
  source: WearableSource;
  latestDate: string;
}

const SOURCE_LABEL: Record<WearableSource, string> = { oura: "Oura", whoop: "Whoop" };

const MESSAGE: Record<RecoveryStatus, string> = {
  good: "Pronta para treinar com intensidade — o corpo está recuperado.",
  watch: "Recuperação abaixo do normal dela. Bom dia para reduzir a carga e priorizar técnica e mobilidade.",
  poor: "Recuperação baixa. Priorize descanso ativo, sono e mobilidade — evite alta intensidade hoje.",
};

const R = 56;
const CIRC = 2 * Math.PI * R;

const fmtDate = (ymd: string) => {
  try {
    return new Date(`${ymd}T00:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  } catch {
    return ymd;
  }
};

export function RecoveryHeadline({ recovery, source, latestDate }: RecoveryHeadlineProps) {
  const s = recovery ? statusStyle(recovery.status, RECOVERY_LABEL[recovery.status]) : null;
  const pct = recovery ? Math.max(0, Math.min(100, recovery.value)) : 0;
  const ringColor = s ? (s.fg.color as string) : "hsl(var(--muted-foreground))";

  return (
    <Card className="grid grid-cols-[auto_1fr] items-center gap-5 p-6 sm:gap-8">
      <div className="relative h-[132px] w-[132px]" role="img" aria-label={`Recuperação ${recovery ? pct + "%" : "sem dados"}`}>
        <svg width="132" height="132" viewBox="0 0 132 132" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="66" cy="66" r={R} fill="none" stroke="hsl(var(--muted))" strokeWidth="13" />
          {recovery && (
            <circle
              cx="66" cy="66" r={R} fill="none" stroke={ringColor} strokeWidth="13"
              strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - pct / 100)}
            />
          )}
        </svg>
        <div className="absolute inset-0 grid place-content-center text-center">
          {recovery ? (
            <>
              <b className="text-[34px] font-bold leading-none tracking-tight tabular-nums">
                {pct}
                <span className="text-base">%</span>
              </b>
              <span className="mt-1 block text-xs text-muted-foreground">recuperação</span>
            </>
          ) : (
            <span className="px-2 text-xs text-muted-foreground">aguardando dados</span>
          )}
        </div>
      </div>

      <div>
        {s ? (
          <span
            className="mb-2.5 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[15px] font-semibold"
            style={s.chip}
          >
            <s.Icon className="h-4 w-4" />
            {s.label}
          </span>
        ) : (
          <span className="mb-2.5 inline-flex items-center rounded-full bg-muted px-3 py-1.5 text-[15px] font-semibold text-muted-foreground">
            Sem leitura de recuperação
          </span>
        )}
        <p className="max-w-[56ch] text-[14.5px] text-muted-foreground">
          {recovery
            ? MESSAGE[recovery.status]
            : "Ainda não há um score de recuperação finalizado para o dia mais recente."}
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          Fonte: <b className="text-foreground">{SOURCE_LABEL[source]}</b> · {fmtDate(latestDate)}
        </p>
      </div>
    </Card>
  );
}
