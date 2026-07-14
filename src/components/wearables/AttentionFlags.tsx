import { AlertOctagon, AlertTriangle, WifiOff } from "lucide-react";

interface AttentionFlagsProps {
  lowRecoveryStreak: number;
  syncStale: boolean;
  metricStale: boolean;
  metricStaleDays: number | null;
}

type Flag = { key: string; tone: "warn" | "bad"; Icon: typeof AlertTriangle; title: string; why: string };

const STREAK_THRESHOLD = 3;

export function AttentionFlags({ lowRecoveryStreak, syncStale, metricStale, metricStaleDays }: AttentionFlagsProps) {
  const flags: Flag[] = [];

  if (lowRecoveryStreak >= STREAK_THRESHOLD) {
    flags.push({
      key: "streak",
      tone: "bad",
      Icon: AlertOctagon,
      title: `Recuperação baixa há ${lowRecoveryStreak} dias seguidos.`,
      why: "Padrão de fadiga acumulada — considere um dia leve ou de descanso.",
    });
  }
  if (metricStale) {
    flags.push({
      key: "metric-stale",
      tone: "warn",
      Icon: AlertTriangle,
      title: metricStaleDays != null ? `Sem dados novos há ${metricStaleDays} dias.` : "Sem dados recentes.",
      why: "A última medição não é de hoje — os números abaixo podem estar defasados.",
    });
  } else if (syncStale) {
    flags.push({
      key: "sync-stale",
      tone: "warn",
      Icon: WifiOff,
      title: "Sem sincronizar há mais de 36 h.",
      why: "O aparelho não envia dados há um tempo — vale um lembrete ao aluno.",
    });
  }

  if (flags.length === 0) return null;

  return (
    <div className="flex flex-col gap-2.5">
      {flags.map((f) => {
        const token = f.tone === "bad" ? "--destructive" : "--warning";
        return (
          <div
            key={f.key}
            className="flex items-center gap-3 rounded-lg border px-4 py-3 text-sm"
            style={{
              color: `hsl(var(${token}))`,
              backgroundColor: `hsl(var(${token}) / 0.1)`,
              borderColor: `hsl(var(${token}) / 0.28)`,
            }}
          >
            <f.Icon className="h-4 w-4 shrink-0" />
            <span>
              <b className="font-semibold">{f.title}</b>{" "}
              <span className="opacity-80">{f.why}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
