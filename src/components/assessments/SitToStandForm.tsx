/**
 * Form de registro do teste Sit-to-Stand (Araújo 2012 split sentar/levantar).
 *
 * Decisão MVP (PR #116): coach digita sit_score e rise_score já
 * descontados. UI mostra um preview do cálculo `5 - apoios - 0.5 × instab.`
 * ao lado do input via <SitToStandScorePreview /> pra coach validar.
 *
 * jsonb `sit_supports` / `rise_supports` + int `sit_instabilities` /
 * `rise_instabilities` viram audit trail (preservados pra display no PDF).
 *
 * Fluxo:
 *   1. Coach abre form pelo botão "Nova avaliação" no StudentDetailPage
 *   2. Preenche fase sentar (apoios + instab + score final)
 *   3. Preenche fase levantar (idem)
 *   4. Notas livres
 *   5. Submit → useCreateAssessment cria parent + filha
 */

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { z } from "zod";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { SitToStandScorePreview } from "./SitToStandScorePreview";
import { useCreateAssessment } from "@/hooks/useAssessments";
import {
  assessmentBaseSchema,
  emptySupports,
  sitToStandSchema,
  sitToStandSupportsSchema,
} from "@/utils/assessmentValidation";

// ────────────────────────────────────────────────────────────────────────────
// Schema do form (combina base + sit-to-stand)
// ────────────────────────────────────────────────────────────────────────────

const formSchema = assessmentBaseSchema.extend({
  sit_score: sitToStandSchema.shape.sit_score,
  sit_supports: sitToStandSupportsSchema,
  sit_instabilities: sitToStandSchema.shape.sit_instabilities,
  rise_score: sitToStandSchema.shape.rise_score,
  rise_supports: sitToStandSupportsSchema,
  rise_instabilities: sitToStandSchema.shape.rise_instabilities,
  sit_to_stand_notes: z.string().max(500).optional(),
});

type FormData = z.infer<typeof formSchema>;

interface SitToStandFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  /** Default age/weight/height/sex (do aluno) pra pre-preencher */
  defaults?: {
    age_years?: number | null;
    weight_kg?: number | null;
    height_cm?: number | null;
    sex?: "M" | "F" | null;
  };
  onCreated?: (assessmentId: string) => void;
}

// ────────────────────────────────────────────────────────────────────────────
// Componente
// ────────────────────────────────────────────────────────────────────────────

const SUPPORT_LABELS: Array<{ key: keyof ReturnType<typeof emptySupports>; label: string }> = [
  { key: "hand", label: "Mão no chão" },
  { key: "knee", label: "Joelho no chão" },
  { key: "forearm", label: "Antebraço" },
  { key: "leg_side", label: "Lateral perna" },
  { key: "hand_on_knee", label: "Mão no joelho" },
];

export const SitToStandForm = ({
  open,
  onOpenChange,
  studentId,
  defaults,
  onCreated,
}: SitToStandFormProps) => {
  const createAssessment = useCreateAssessment();
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      student_id: studentId,
      assessment_date: new Date().toISOString().slice(0, 10),
      age_years: defaults?.age_years ?? null,
      weight_kg: defaults?.weight_kg ?? null,
      height_cm: defaults?.height_cm ?? null,
      sex: defaults?.sex ?? null,
      notes: "",
      sit_score: 5,
      sit_supports: emptySupports(),
      sit_instabilities: 0,
      rise_score: 5,
      rise_supports: emptySupports(),
      rise_instabilities: 0,
      sit_to_stand_notes: "",
    },
  });

  // Watch supports + instabilities pra preview reativo
  const sitSupports = form.watch("sit_supports");
  const sitInstabilities = form.watch("sit_instabilities") ?? 0;
  const riseSupports = form.watch("rise_supports");
  const riseInstabilities = form.watch("rise_instabilities") ?? 0;

  const onSubmit = async (data: FormData) => {
    setIsSaving(true);
    try {
      const result = await createAssessment.mutateAsync({
        parent: {
          student_id: data.student_id,
          assessment_type: "sit_to_stand",
          assessment_date: data.assessment_date,
          status: "completed",
          age_years: data.age_years ?? null,
          weight_kg: data.weight_kg ?? null,
          height_cm: data.height_cm ?? null,
          sex: data.sex ?? null,
          notes: data.notes ?? null,
        },
        child: {
          kind: "sit_to_stand",
          data: {
            sit_score: data.sit_score,
            sit_supports: data.sit_supports,
            sit_instabilities: data.sit_instabilities,
            rise_score: data.rise_score,
            rise_supports: data.rise_supports,
            rise_instabilities: data.rise_instabilities,
            classification: null,
            notes: data.sit_to_stand_notes || null,
          },
        },
      });
      form.reset();
      onOpenChange(false);
      onCreated?.(result.id);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Sit-to-Stand (Araújo 2012)</DialogTitle>
          <DialogDescription>
            Registre os hemitestes de sentar e levantar. O coach digita o
            score final de cada fase (0–5). Contagem de apoios e
            instabilidades fica como audit trail e ajusta o preview
            sugerido ao lado.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Base — data, peso, idade, etc. */}
            <section className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="assessment_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data do teste</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="age_years"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Idade (anos)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        max={120}
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value === "" ? null : Number(e.target.value),
                          )
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </section>

            {/* SIT phase */}
            <section className="space-y-3 rounded-md border p-4">
              <header className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Sentar (descida)</h3>
                <SitToStandScorePreview
                  supports={sitSupports}
                  instabilities={Number(sitInstabilities)}
                />
              </header>

              <div className="grid grid-cols-5 gap-2">
                {SUPPORT_LABELS.map((s) => (
                  <FormField
                    key={`sit_${s.key}`}
                    control={form.control}
                    name={`sit_supports.${s.key}` as const}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">{s.label}</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            max={10}
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="sit_instabilities"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Instabilidades (sentar)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          max={20}
                          {...field}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="sit_score"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Score final sentar (0–5)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.5"
                          min={0}
                          max={5}
                          {...field}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </section>

            {/* RISE phase */}
            <section className="space-y-3 rounded-md border p-4">
              <header className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Levantar (subida)</h3>
                <SitToStandScorePreview
                  supports={riseSupports}
                  instabilities={Number(riseInstabilities)}
                />
              </header>

              <div className="grid grid-cols-5 gap-2">
                {SUPPORT_LABELS.map((s) => (
                  <FormField
                    key={`rise_${s.key}`}
                    control={form.control}
                    name={`rise_supports.${s.key}` as const}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">{s.label}</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            max={10}
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="rise_instabilities"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Instabilidades (levantar)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          max={20}
                          {...field}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="rise_score"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Score final levantar (0–5)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.5"
                          min={0}
                          max={5}
                          {...field}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </section>

            <FormField
              control={form.control}
              name="sit_to_stand_notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações do coach</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Notas sobre execução, sintomas, contexto…"
                      rows={2}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSaving}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar avaliação
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
