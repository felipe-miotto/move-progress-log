interface SparklineProps {
  /** chronological values; NaN entries are treated as gaps */
  series: number[];
  color: string; // css color, e.g. "hsl(var(--success))"
  className?: string;
  height?: number;
}

/** Tiny trend sparkline: soft area fill + line + emphasized endpoint. */
export function Sparkline({ series, color, className, height = 38 }: SparklineProps) {
  const W = 100;
  const H = height;
  const pad = 3;
  const valid = series.filter((v) => !Number.isNaN(v));
  if (valid.length < 2) {
    return (
      <div
        className={className}
        style={{ height, display: "flex", alignItems: "center" }}
        aria-hidden
      >
        <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
          sem histórico
        </span>
      </div>
    );
  }
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const rng = max - min || 1;
  const n = series.length;
  const pts = series.map((v, i) => {
    const x = pad + ((W - 2 * pad) * i) / (n - 1);
    const y = Number.isNaN(v) ? NaN : pad + (H - 2 * pad) * (1 - (v - min) / rng);
    return [x, y] as const;
  });
  const drawn = pts.filter(([, y]) => !Number.isNaN(y));
  const line = drawn.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const last = drawn[drawn.length - 1];
  const area = `${drawn[0][0].toFixed(1)},${H - pad} ${line} ${drawn[drawn.length - 1][0].toFixed(1)},${H - pad}`;

  return (
    <svg
      className={className}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height, display: "block" }}
      aria-hidden
    >
      <polygon points={area} fill={color} opacity={0.1} />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={last[0].toFixed(1)} cy={last[1].toFixed(1)} r={2.4} fill={color} />
    </svg>
  );
}
