import { CheckCircle2, AlertTriangle, AlertOctagon, type LucideIcon } from "lucide-react";
import type { RecoveryStatus } from "@/lib/wearables/normalizeRecovery";

/**
 * Maps a recovery status to a pt-BR label, a lucide icon (so status is never
 * carried by color alone — Codex/impeccable a11y rule), and inline color styles
 * derived from the app's semantic tokens (--success / --warning / --destructive).
 */
const TOKEN: Record<RecoveryStatus, string> = {
  good: "--success",
  watch: "--warning",
  poor: "--destructive",
};

const ICON: Record<RecoveryStatus, LucideIcon> = {
  good: CheckCircle2,
  watch: AlertTriangle,
  poor: AlertOctagon,
};

export interface StatusStyle {
  label: string;
  Icon: LucideIcon;
  fg: React.CSSProperties;
  chip: React.CSSProperties;
}

export const METRIC_STATUS_LABEL: Record<RecoveryStatus, string> = {
  good: "Bom",
  watch: "Atenção",
  poor: "Baixo",
};

export function statusStyle(status: RecoveryStatus, label?: string): StatusStyle {
  const t = TOKEN[status];
  return {
    label: label ?? METRIC_STATUS_LABEL[status],
    Icon: ICON[status],
    fg: { color: `hsl(var(${t}))` },
    chip: { color: `hsl(var(${t}))`, backgroundColor: `hsl(var(${t}) / 0.12)` },
  };
}
