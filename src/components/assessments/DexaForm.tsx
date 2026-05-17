/**
 * Form de registro de scan DEXA.
 *
 * Fluxo MVP:
 *   1. Coach recebe o PDF do scan DEXA da clínica
 *   2. Faz upload do PDF no bucket privado `dexa-pdfs`
 *   3. Digita ~17 campos clínicos extraídos manualmente do laudo
 *   4. (Opcional) preenche regional_distribution por região anatômica
 *   5. Submit → RPC `create_precision12_assessment` com kind="dexa"
 *
 * Extração via IA (OpenAI extrai raw_extracted_json do PDF + sugere
 * preenchimento) fica pra E5 — neste form, extraction_method = "manual".
 *
 * Cores de visceral_fat_g (pra futuro): green <100g, amber 100-150g, red >150g.
 * Aqui só coleta valor; classificação fica em E5.
 */

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Upload, X } from "lucide-react";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { notify } from "@/lib/notify";
import { supabase } from "@/integrations/supabase/client";

import { useCreateAssessment } from "@/hooks/useAssessments";
import {
  assessmentBaseSchema,
  dexaRegionalDistributionSchema,
  dexaSchema,
  localTodayIso,
} from "@/utils/assessmentValidation";

// ────────────────────────────────────────────────────────────────────────────

const formSchema = assessmentBaseSchema.extend({
  total_mass_kg: dexaSchema.shape.total_mass_kg,
  fat_mass_kg: dexaSchema.shape.fat_mass_kg,
  fat_pct: dexaSchema.shape.fat_pct,
  lean_mass_kg: dexaSchema.shape.lean_mass_kg,
  bone_mass_kg: dexaSchema.shape.bone_mass_kg,
  bone_density_z_score: dexaSchema.shape.bone_density_z_score,
  visceral_fat_g: dexaSchema.shape.visceral_fat_g,
  android_gynoid_ratio: dexaSchema.shape.android_gynoid_ratio,
  appendicular_lean_mass_kg: dexaSchema.shape.appendicular_lean_mass_kg,
  imma_baumgartner: dexaSchema.shape.imma_baumgartner,
  fmi: dexaSchema.shape.fmi,
  fat_percentile: dexaSchema.shape.fat_percentile,
  bmr_harris_benedict_kcal: dexaSchema.shape.bmr_harris_benedict_kcal,
  bmr_mifflin_stjeor_kcal: dexaSchema.shape.bmr_mifflin_stjeor_kcal,
  regional_distribution: dexaRegionalDistributionSchema.nullable().optional(),
  conclusion_text: dexaSchema.shape.conclusion_text,
});

type FormData = z.infer<typeof formSchema>;

interface DexaFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  defaults?: {
    age_years?: number | null;
    weight_kg?: number | null;
    height_cm?: number | null;
    sex?: "M" | "F" | null;
  };
  onCreated?: (assessmentId: string) => void;
}

const parseNumber = (value: string): number | undefined =>
  value === "" ? undefined : Number(value);

const REGIONS = [
  { key: "trunk", label: "Tronco" },
  { key: "arms_right", label: "Braço direito" },
  { key: "arms_left", label: "Braço esquerdo" },
  { key: "legs_right", label: "Perna direita" },
  { key: "legs_left", label: "Perna esquerda" },
  { key: "android", label: "Android" },
  { key: "gynoid", label: "Gynoid" },
] as const;

// ────────────────────────────────────────────────────────────────────────────

export const DexaForm = ({
  open,
  onOpenChange,
  studentId,
  defaults,
  onCreated,
}: DexaFormProps) => {
  const createAssessment = useCreateAssessment();
  const [isSaving, setIsSaving] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      student_id: studentId,
      assessment_date: localTodayIso(),
      age_years: defaults?.age_years ?? null,
      weight_kg: defaults?.weight_kg ?? null,
      height_cm: defaults?.height_cm ?? null,
      sex: defaults?.sex ?? null,
      notes: "",
      total_mass_kg: null,
      fat_mass_kg: null,
      fat_pct: null,
      lean_mass_kg: null,
      bone_mass_kg: null,
      bone_density_z_score: null,
      visceral_fat_g: null,
      android_gynoid_ratio: null,
      appendicular_lean_mass_kg: null,
      imma_baumgartner: null,
      fmi: null,
      fat_percentile: null,
      bmr_harris_benedict_kcal: null,
      bmr_mifflin_stjeor_kcal: null,
      regional_distribution: null,
      conclusion_text: "",
    },
  });

  const handlePdfChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      notify.error("Arquivo muito grande (máx 20MB)");
      return;
    }
    if (!file.type.includes("pdf")) {
      notify.error("Envie um arquivo PDF");
      return;
    }

    setPdfFile(file);
  };

  const removePdf = () => {
    setPdfFile(null);
  };

  const onSubmit = async (data: FormData) => {
    setIsSaving(true);
    let uploadedPdfPath: string | null = null;
    let mutationStarted = false;
    try {
      if (pdfFile) {
        setIsUploading(true);
        const ext = pdfFile.name.split(".").pop() ?? "pdf";
        uploadedPdfPath = `${studentId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage
          .from("dexa-pdfs")
          .upload(uploadedPdfPath, pdfFile, { contentType: "application/pdf" });
        if (error) throw error;
      }

      mutationStarted = true;
      const result = await createAssessment.mutateAsync({
        parent: {
          student_id: data.student_id,
          assessment_type: "dexa",
          assessment_date: data.assessment_date,
          status: "completed",
          age_years: data.age_years ?? null,
          weight_kg: data.weight_kg ?? null,
          height_cm: data.height_cm ?? null,
          sex: data.sex ?? null,
          notes: data.notes ?? null,
        },
        child: {
          kind: "dexa",
          data: {
            total_mass_kg: data.total_mass_kg ?? null,
            fat_mass_kg: data.fat_mass_kg ?? null,
            fat_pct: data.fat_pct ?? null,
            lean_mass_kg: data.lean_mass_kg ?? null,
            bone_mass_kg: data.bone_mass_kg ?? null,
            bone_density_z_score: data.bone_density_z_score ?? null,
            visceral_fat_g: data.visceral_fat_g ?? null,
            android_gynoid_ratio: data.android_gynoid_ratio ?? null,
            appendicular_lean_mass_kg: data.appendicular_lean_mass_kg ?? null,
            imma_baumgartner: data.imma_baumgartner ?? null,
            fmi: data.fmi ?? null,
            fat_percentile: data.fat_percentile ?? null,
            bmr_harris_benedict_kcal: data.bmr_harris_benedict_kcal ?? null,
            bmr_mifflin_stjeor_kcal: data.bmr_mifflin_stjeor_kcal ?? null,
            scan_pdf_storage_path: uploadedPdfPath,
            scan_pdf_url: null,
            regional_distribution: data.regional_distribution ?? null,
            conclusion_text: data.conclusion_text || null,
            raw_extracted_json: null,
            extraction_confidence: null,
            extraction_method: "manual",
          },
        },
      });
      form.reset();
      setPdfFile(null);
      onOpenChange(false);
      onCreated?.(result.id);
    } catch (err) {
      if (!mutationStarted) {
        notify.error("Erro no upload do PDF", {
          description: err instanceof Error ? err.message : "Tente novamente",
        });
      }
    } finally {
      setIsUploading(false);
      setIsSaving(false);
    }
  };

  // Helper pra renderizar input numérico opcional
  const renderNumber = (
    name: keyof FormData,
    label: string,
    opts?: { min?: number; max?: number; step?: string; suffix?: string },
  ) => (
    <FormField
      control={form.control}
      name={name as never}
      render={({ field }) => (
        <FormItem>
          <FormLabel className="text-xs">
            {label}
            {opts?.suffix && (
              <span className="ml-1 text-muted-foreground">({opts.suffix})</span>
            )}
          </FormLabel>
          <FormControl>
            <Input
              type="number"
              step={opts?.step ?? "0.1"}
              min={opts?.min}
              max={opts?.max}
              {...(field as { value: unknown; onChange: (v: unknown) => void })}
              value={(field.value as number | null | undefined) ?? ""}
              onChange={(e) =>
                (field as { onChange: (v: unknown) => void }).onChange(
                  parseNumber(e.target.value) ?? null,
                )
              }
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>DEXA — composição corporal</DialogTitle>
          <DialogDescription>
            Faça upload do PDF do laudo DEXA e preencha os campos manualmente
            com os dados da clínica parceira. A leitura automática do PDF
            será implementada em etapa futura.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Base */}
            <section className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <FormField
                control={form.control}
                name="assessment_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data do scan</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {renderNumber("age_years", "Idade", { min: 0, max: 120, step: "1" })}
              {renderNumber("weight_kg", "Peso", { min: 0, max: 500, suffix: "kg" })}
              {renderNumber("height_cm", "Altura", { min: 0, max: 300, suffix: "cm" })}
            </section>

            {/* Upload PDF */}
            <section className="space-y-2 rounded-md border p-4">
              <Label>PDF do laudo DEXA</Label>
              {pdfFile ? (
                <div className="flex items-center justify-between rounded-md border bg-muted/30 p-2 text-sm">
                  <span className="truncate">{pdfFile.name}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={removePdf}
                    disabled={isUploading || isSaving}
                    aria-label="Remover PDF selecionado"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <label
                  htmlFor="dexa-pdf"
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground hover:border-foreground/30"
                >
                  {isUploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {isUploading ? "Enviando…" : "Selecione o PDF (até 20MB)"}
                  <input
                    id="dexa-pdf"
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={handlePdfChange}
                    disabled={isUploading}
                  />
                </label>
              )}
              <p className="text-xs text-muted-foreground">
                Upload é opcional e só acontece ao salvar; cancelar esta tela
                não cria arquivo órfão.
              </p>
            </section>

            {/* Massa + percentuais core */}
            <section className="space-y-3 rounded-md border p-4">
              <h3 className="text-sm font-semibold">Composição corporal</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {renderNumber("total_mass_kg", "Massa total", { max: 500, suffix: "kg" })}
                {renderNumber("fat_mass_kg", "Gordura", { max: 300, suffix: "kg" })}
                {renderNumber("fat_pct", "% gordura", { max: 100, suffix: "%" })}
                {renderNumber("lean_mass_kg", "Massa magra", { max: 300, suffix: "kg" })}
                {renderNumber("bone_mass_kg", "Massa óssea", { max: 20, suffix: "kg" })}
                {renderNumber("bone_density_z_score", "Z-score ósseo", { min: -10, max: 10 })}
                {renderNumber("visceral_fat_g", "Gordura visceral", { max: 20000, suffix: "g" })}
                {renderNumber("android_gynoid_ratio", "Android/Gynoid", { max: 5 })}
              </div>
            </section>

            {/* Sarcopenia + índices derivados */}
            <section className="space-y-3 rounded-md border p-4">
              <h3 className="text-sm font-semibold">Índices derivados</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {renderNumber("appendicular_lean_mass_kg", "ALM apendicular", { max: 100, suffix: "kg" })}
                {renderNumber("imma_baumgartner", "IMMA (Baumgartner)", { max: 30 })}
                {renderNumber("fmi", "FMI", { max: 80 })}
                {renderNumber("fat_percentile", "Percentil gordura", {
                  min: 0,
                  max: 100,
                  step: "1",
                })}
                {renderNumber("bmr_harris_benedict_kcal", "TMB Harris-Benedict", {
                  max: 5000,
                  step: "1",
                  suffix: "kcal",
                })}
                {renderNumber("bmr_mifflin_stjeor_kcal", "TMB Mifflin-St.Jeor", {
                  max: 5000,
                  step: "1",
                  suffix: "kcal",
                })}
              </div>
            </section>

            {/* Distribuição regional (opcional, colapsável) */}
            <Collapsible className="rounded-md border">
              <CollapsibleTrigger className="flex w-full items-center justify-between p-3 text-sm font-semibold hover:bg-muted/50">
                Distribuição regional (opcional)
                <span className="text-xs text-muted-foreground">expandir →</span>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 border-t p-3">
                {REGIONS.map((region) => (
                  <div key={region.key} className="grid grid-cols-3 gap-2">
                    <div className="col-span-3 text-xs font-semibold text-muted-foreground">
                      {region.label}
                    </div>
                    <FormField
                      control={form.control}
                      name={`regional_distribution.${region.key}.fat_pct` as never}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-[10px]">% gordura</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.1"
                              min={0}
                              max={100}
                              {...(field as { value: unknown; onChange: (v: unknown) => void })}
                              value={(field.value as number | null | undefined) ?? ""}
                              onChange={(e) =>
                                (field as { onChange: (v: unknown) => void }).onChange(
                                  parseNumber(e.target.value),
                                )
                              }
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`regional_distribution.${region.key}.lean_mass_g` as never}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-[10px]">Massa magra (g)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="1"
                              min={0}
                              max={100_000}
                              {...(field as { value: unknown; onChange: (v: unknown) => void })}
                              value={(field.value as number | null | undefined) ?? ""}
                              onChange={(e) =>
                                (field as { onChange: (v: unknown) => void }).onChange(
                                  parseNumber(e.target.value),
                                )
                              }
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`regional_distribution.${region.key}.fat_mass_g` as never}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-[10px]">Gordura (g)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="1"
                              min={0}
                              max={100_000}
                              {...(field as { value: unknown; onChange: (v: unknown) => void })}
                              value={(field.value as number | null | undefined) ?? ""}
                              onChange={(e) =>
                                (field as { onChange: (v: unknown) => void }).onChange(
                                  parseNumber(e.target.value),
                                )
                              }
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>

            <FormField
              control={form.control}
              name="conclusion_text"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Conclusão clínica do laudo</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      value={field.value ?? ""}
                      placeholder="Texto livre da conclusão do médico/clínica…"
                      rows={3}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações do coach</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      value={field.value ?? ""}
                      placeholder="Comparações com scan anterior, contexto…"
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
                disabled={isSaving || isUploading}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSaving || isUploading}>
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
