import { ChevronRight } from "lucide-react";
import type { WearableRecovery } from "@/lib/wearables/normalizeRecovery";

const fmt1 = (v: number) => v.toFixed(1).replace(".", ",");

/** Progressive disclosure for secondary metrics — off the card face by default. */
export function WearableDetails({ rec }: { rec: WearableRecovery }) {
  const items: { k: string; v: string }[] = [];
  if (rec.secondary.respiratoryRate != null) {
    items.push({ k: "Freq. respiratória", v: `${fmt1(rec.secondary.respiratoryRate)} rpm` });
  }
  if (rec.secondary.temperature != null) {
    const t = rec.secondary.temperature;
    items.push({
      k: "Temperatura da pele",
      v: t.kind === "deviation" ? `${t.value >= 0 ? "+" : ""}${fmt1(t.value)} °C vs base` : `${fmt1(t.value)} °C`,
    });
  }
  if (rec.secondary.strain != null) {
    items.push({ k: "Strain do dia", v: fmt1(rec.secondary.strain) });
  }

  if (items.length === 0) return null;

  return (
    <details className="group rounded-lg border bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold marker:hidden [&::-webkit-details-marker]:hidden">
        <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" />
        Detalhes
      </summary>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3 px-4 pb-4 pt-1">
        {items.map((it) => (
          <div key={it.k} className="rounded-md bg-muted/60 px-3.5 py-3">
            <div className="mb-1 text-[12.5px] text-muted-foreground">{it.k}</div>
            <div className="text-[19px] font-semibold tabular-nums">{it.v}</div>
          </div>
        ))}
      </div>
    </details>
  );
}
