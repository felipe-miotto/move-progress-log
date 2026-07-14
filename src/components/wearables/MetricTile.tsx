import { Card } from "@/components/ui/card";
import { Sparkline } from "./Sparkline";
import { statusStyle } from "./recoveryStatus";
import type { MetricView } from "@/lib/wearables/normalizeRecovery";

interface MetricTileProps {
  title: string;
  metric: MetricView;
  higherIsBetter: boolean;
  /** decimals for the delta / baseline (default 0) */
  precision?: number;
}

const fmt = (v: number | null, p: number) =>
  v == null || Number.isNaN(v) ? "—" : v.toFixed(p).replace(".", ",");

export function MetricTile({ title, metric, higherIsBetter, precision = 0 }: MetricTileProps) {
  const s = metric.status ? statusStyle(metric.status) : null;
  const hasValue = metric.value != null && !Number.isNaN(metric.value);
  const sparkColor = s ? (s.fg.color as string) : "hsl(var(--primary))";

  const deltaGood =
    metric.delta != null && (higherIsBetter ? metric.delta >= 0 : metric.delta <= 0);
  const deltaColor =
    metric.delta == null
      ? "hsl(var(--muted-foreground))"
      : deltaGood
        ? "hsl(var(--success))"
        : "hsl(var(--destructive))";
  const deltaSign = metric.delta != null && metric.delta > 0 ? "+" : "";

  return (
    <Card className="flex flex-col gap-2 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-semibold text-muted-foreground">{title}</span>
        {s && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={s.chip}
          >
            <s.Icon className="h-3 w-3" />
            {s.label}
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-1.5">
        <b className="text-[28px] font-bold leading-none tracking-tight tabular-nums">
          {fmt(metric.value, precision)}
        </b>
        <span className="text-[13px] text-muted-foreground">{metric.unit}</span>
      </div>

      {hasValue && metric.hasBaseline && metric.baseline != null ? (
        <div className="text-[12.5px] text-muted-foreground">
          Linha de base{" "}
          <b className="tabular-nums">
            {fmt(metric.baseline, precision)} {metric.unit}
          </b>
          {metric.delta != null && (
            <>
              {" · "}
              <span className="font-semibold tabular-nums" style={{ color: deltaColor }}>
                {deltaSign}
                {fmt(metric.delta, precision)} {metric.unit}
              </span>
            </>
          )}
        </div>
      ) : (
        <div className="text-[12.5px] text-muted-foreground">
          {hasValue ? "Linha de base em construção" : "Sem dados suficientes"}
        </div>
      )}

      <Sparkline series={metric.series} color={sparkColor} className="mt-0.5" />
    </Card>
  );
}
