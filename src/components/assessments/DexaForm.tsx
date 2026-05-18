/**
 * Form de registro de scan DEXA.
 *
 * Fluxo MVP:
 *   1. Coach recebe o PDF do scan DEXA da clínica
 *   2. Faz upload do PDF no bucket privado `dexa-pdfs`
 *   3. (Opcional) Clica "Ler PDF e preencher campos" — chama a edge
 *      `extract-dexa-pdf`, que envia o PDF pra OpenAI Responses API
 *      multimodal e devolve JSON estruturado. O frontend preenche o
 *      formulário como RASCUNHO; **nenhum dado é persistido aqui**.
 *      Campos já preenchidos manualmente NÃO são sobrescritos.
 *   4. Coach revisa todos os campos
 *   5. (Opcional) preenche regional_distribution por região anatômica
 *   6. Submit → RPC `create_precision12_assessment` com kind="dexa"
 *      Só aqui os dados são persistidos. `extraction_method` vira
 *      "hybrid" se a IA preencheu algum campo, senão "manual".
 *
 * Cores de visceral_fat_g (pra futuro): green <100g, amber 100-150g, red >150g.
 * Aqui só coleta valor; classificação visual será adicionada em etapa
 * futura.
 */

import { useCallback, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertTriangle,
  Loader2,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { z } from "zod";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { notify } from "@/lib/notify";
import { supabase } from "@/integrations/supabase/client";

import { useCreateAssessment } from "@/hooks/useAssessments";
import {
  assessmentBaseSchema,
  dexaRegionalDistributionSchema,
  dexaSchema,
} from "@/utils/assessmentValidation";
import {
  DEXA_EXTRACTION_FIELDS,
  applyDexaExtractionToEmptyFields,
  applyDexaScanDateToAssessmentDate,
  normalizeDexaExtractionResponse,
  sanitizeDexaExtractionForStorage,
  type DexaExtraction,
  type DexaExtractionFieldName,
} from "@/utils/dexaPdfExtraction";

// ────────────────────────────────────────────────────────────────────────────

/**
 * Sentinel pra mapear "vazio / não informado" no `Select` (radix exige
 * value não-vazio em SelectItem). Convertemos pra `null` no onChange.
 */
const CLEAR_SELECT_VALUE = "__none";

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

/**
 * Mensagem genérica fixa pra falhas de upload do PDF / salvamento.
 *
 * Hardening (PR #159 follow-up): NÃO concatenamos `err.message`,
 * `error.message` ou `signError.message` aqui — essas mensagens
 * podem incluir path do bucket, querystring de token, hostname do
 * Supabase ou stack trace, e qualquer captura automática (toast,
 * Sentry, logging do browser) re-exibiria isso pro coach/cliente.
 *
 * Diagnóstico interno fica disponível server-side via Supabase
 * Dashboard (logs do Storage).
 */
const DEXA_UPLOAD_GENERIC_ERROR_DESCRIPTION =
  "Tente novamente. Se o problema persistir, verifique o PDF ou refaça o upload.";

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
  /**
   * Path do PDF JÁ no bucket. Populado quando o coach clica "Ler PDF"
   * (upload sob demanda). O submit reusa esse path em vez de subir
   * outro arquivo. Quando o coach remove o PDF, o path é limpo (sem
   * apagar o objeto — risco/follow-up de cleanup).
   */
  const [uploadedPdfPath, setUploadedPdfPath] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  /**
   * Resultado da última extração aplicada. Mantém também os campos que
   * foram efetivamente preenchidos (`applied`), pra renderizar UI de
   * revisão e pra que o submit decida `extraction_method='hybrid'`.
   */
  const [extractionState, setExtractionState] = useState<{
    extraction: DexaExtraction;
    applied: DexaExtractionFieldName[];
    skipped: DexaExtractionFieldName[];
  } | null>(null);
  /**
   * Guard pra evitar dois cliques rápidos no botão "Ler PDF" disparando
   * dois uploads + duas chamadas à edge.
   */
  const extractionInFlight = useRef(false);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      student_id: studentId,
      // `assessment_date` propositalmente VAZIO no DEXA (não default
      // pra `localTodayIso()` como nos outros forms). DEXA = data em
      // que o EXAME foi REALIZADO, não data de inclusão no sistema.
      // Coach precisa preencher manualmente, OU a IA preenche via
      // `scan_date` extraído do laudo (ver `handleExtract` e
      // `applyDexaScanDateToAssessmentDate`). Validação zod do
      // assessmentBaseSchema (`min(1, "Data obrigatória")`) garante
      // que o submit não passa em branco.
      assessment_date: "",
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

    // Trocou o arquivo → invalida path/extração anteriores. NÃO
    // remove o objeto antigo do bucket (cleanup destrutivo fica como
    // follow-up; risco de arquivo órfão se o coach abandonar a tela
    // depois de extrair).
    setPdfFile(file);
    setUploadedPdfPath(null);
    setExtractionState(null);
  };

  const removePdf = () => {
    setPdfFile(null);
    // Preserva os campos preenchidos (manual ou extraídos): a regra de
    // produto é não destruir trabalho do coach sem confirmação. Só
    // limpa metadata da extração.
    setUploadedPdfPath(null);
    setExtractionState(null);
  };

  /**
   * Faz upload do PDF se ainda não foi feito. Retorna o storage path.
   * Idempotente: se já há `uploadedPdfPath`, devolve sem subir de novo.
   */
  const uploadPdfIfNeeded = useCallback(async (): Promise<string | null> => {
    if (uploadedPdfPath) return uploadedPdfPath;
    if (!pdfFile) return null;
    setIsUploading(true);
    try {
      const ext = pdfFile.name.split(".").pop() ?? "pdf";
      const path = `${studentId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("dexa-pdfs")
        .upload(path, pdfFile, { contentType: "application/pdf" });
      if (error) throw error;
      setUploadedPdfPath(path);
      return path;
    } finally {
      setIsUploading(false);
    }
  }, [pdfFile, studentId, uploadedPdfPath]);

  /**
   * Roda a edge `extract-dexa-pdf` e aplica o resultado nos campos
   * VAZIOS do formulário. Nunca persiste nada: o submit existente é
   * quem grava no banco, depois da revisão humana.
   */
  const handleExtract = useCallback(async () => {
    if (extractionInFlight.current) return;
    if (!pdfFile && !uploadedPdfPath) return;
    extractionInFlight.current = true;
    setIsExtracting(true);
    try {
      const path = await uploadPdfIfNeeded();
      if (!path) {
        notify.error("Não foi possível preparar o PDF para leitura");
        return;
      }
      const { data, error } = await supabase.functions.invoke(
        "extract-dexa-pdf",
        {
          body: { student_id: studentId, storage_path: path },
        },
      );
      if (error || !data || typeof data !== "object" || (data as { ok?: unknown }).ok !== true) {
        // Genérico e SEM detalhes internos. A edge já loga server-side.
        notify.error("Não foi possível ler o PDF automaticamente", {
          description:
            "Você ainda pode preencher os campos manualmente e salvar.",
        });
        return;
      }
      const extraction = normalizeDexaExtractionResponse(
        (data as { extraction: unknown }).extraction,
      );
      const currentValues = Object.fromEntries(
        DEXA_EXTRACTION_FIELDS.map((field) => [field, form.getValues(field as never)]),
      ) as Record<DexaExtractionFieldName, unknown>;
      const result = applyDexaExtractionToEmptyFields(currentValues, extraction);
      // Aplica cada campo via react-hook-form (mantém validation/dirty).
      for (const fieldName of result.appliedFields) {
        form.setValue(
          fieldName as never,
          result.values[fieldName] as never,
          { shouldDirty: true, shouldValidate: true },
        );
      }
      // scan_date → assessment_date: regra de non-overwrite. Se o
      // coach já digitou uma data MANUALMENTE diferente, respeita.
      // Se o campo está vazio (default agora é ""), aplica a data
      // extraída do laudo.
      const scanDateApply = applyDexaScanDateToAssessmentDate(
        extraction.fields.scan_date?.value ?? null,
        form.getValues("assessment_date"),
      );
      const appliedFields = [...result.appliedFields];
      if (scanDateApply.applied && scanDateApply.nextValue) {
        form.setValue("assessment_date", scanDateApply.nextValue, {
          shouldDirty: true,
          shouldValidate: true,
        });
        appliedFields.push("scan_date");
      }
      setExtractionState({
        extraction,
        applied: appliedFields,
        skipped: result.skippedFields,
      });
      notify.success("Campos preenchidos automaticamente", {
        description: "Revise todos os dados antes de salvar.",
      });
    } catch {
      notify.error("Não foi possível ler o PDF automaticamente", {
        description:
          "Você ainda pode preencher os campos manualmente e salvar.",
      });
    } finally {
      setIsExtracting(false);
      extractionInFlight.current = false;
    }
  }, [form, pdfFile, studentId, uploadPdfIfNeeded, uploadedPdfPath]);

  const onSubmit = async (data: FormData) => {
    setIsSaving(true);
    let mutationStarted = false;
    try {
      // Reusa o path do upload anterior (feito pra extração) OU sobe
      // agora se o coach ignorou a extração e salvou direto.
      const finalPdfPath = await uploadPdfIfNeeded();

      const usedExtraction =
        extractionState != null && extractionState.applied.length > 0;
      const sanitizedExtraction = usedExtraction
        ? sanitizeDexaExtractionForStorage(extractionState.extraction)
        : null;

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
            scan_pdf_storage_path: finalPdfPath,
            scan_pdf_url: null,
            regional_distribution: data.regional_distribution ?? null,
            conclusion_text: data.conclusion_text || null,
            raw_extracted_json: sanitizedExtraction,
            extraction_confidence: usedExtraction
              ? sanitizedExtraction?.overall_confidence ?? null
              : null,
            extraction_method: usedExtraction ? "hybrid" : "manual",
          },
        },
      });
      form.reset();
      setPdfFile(null);
      setUploadedPdfPath(null);
      setExtractionState(null);
      onOpenChange(false);
      onCreated?.(result.id);
    } catch {
      // Hardening: `err` deliberadamente não-bindado pra impedir refactor
      // acidental que reintroduza `err.message` no toast.
      if (!mutationStarted) {
        notify.error("Erro no upload do PDF", {
          description: DEXA_UPLOAD_GENERIC_ERROR_DESCRIPTION,
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
            Faça upload do PDF do laudo DEXA. Você pode preencher os campos
            manualmente OU clicar &quot;Ler PDF e preencher campos&quot; pra
            que a IA gere um rascunho — revisão humana e clique em &quot;Salvar
            avaliação&quot; continuam obrigatórios.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Base */}
            <section className="grid grid-cols-1 gap-3 sm:grid-cols-5">
              <FormField
                control={form.control}
                name="assessment_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data do exame</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        data-testid="dexa-exam-date"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {renderNumber("age_years", "Idade", { min: 0, max: 120, step: "1" })}
              {renderNumber("weight_kg", "Peso", { min: 0, max: 500, suffix: "kg" })}
              {renderNumber("height_cm", "Altura", { min: 0, max: 300, suffix: "cm" })}
              <FormField
                control={form.control}
                name="sex"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sexo</FormLabel>
                    <Select
                      value={field.value ?? CLEAR_SELECT_VALUE}
                      onValueChange={(v) =>
                        field.onChange(
                          v === CLEAR_SELECT_VALUE
                            ? null
                            : (v as "M" | "F"),
                        )
                      }
                    >
                      <FormControl>
                        <SelectTrigger data-testid="dexa-sex-trigger">
                          <SelectValue placeholder="Não informado" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={CLEAR_SELECT_VALUE}>
                          Não informado
                        </SelectItem>
                        <SelectItem value="M">Masculino</SelectItem>
                        <SelectItem value="F">Feminino</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
                Quando você clica em &quot;Ler PDF&quot;, o upload acontece
                imediatamente para a leitura automática rodar. Se preferir
                preencher manualmente, o upload acontece só ao salvar.
              </p>

              {/*
                PR-IA: botão de extração assistida. Só aparece com PDF
                selecionado. NÃO chama `createAssessment.mutateAsync` —
                apenas chama a edge `extract-dexa-pdf` e preenche o form
                como rascunho.
              */}
              {pdfFile && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleExtract}
                  disabled={isExtracting || isUploading || isSaving}
                  aria-label="Ler PDF e preencher campos automaticamente"
                  data-testid="dexa-extract-button"
                >
                  {isExtracting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Sparkles className="mr-2 h-4 w-4" aria-hidden />
                  )}
                  {isExtracting ? "Lendo PDF…" : "Ler PDF e preencher campos"}
                </Button>
              )}

              {/*
                PR-IA: revisão pós-extração. Aparece quando a IA aplicou ao
                menos 1 campo. NÃO substitui o submit manual.
              */}
              {extractionState && extractionState.applied.length > 0 && (
                <Alert
                  className="mt-3"
                  data-testid="dexa-extraction-review"
                >
                  <Sparkles className="h-4 w-4" />
                  <AlertTitle>Leitura automática aplicada</AlertTitle>
                  <AlertDescription className="space-y-1 text-xs">
                    <p>
                      Campos preenchidos automaticamente:{" "}
                      <strong>{extractionState.applied.length}</strong>. Revise
                      todos os dados antes de salvar.
                    </p>
                    <p>
                      Confiança geral:{" "}
                      <strong>
                        {Math.round(
                          extractionState.extraction.overall_confidence * 100,
                        )}
                        %
                      </strong>
                    </p>
                    {extractionState.skipped.length > 0 && (
                      <p>
                        Não sobrescritos (já preenchidos manualmente):{" "}
                        {extractionState.skipped.join(", ")}.
                      </p>
                    )}
                    {extractionState.extraction.missing_fields.length > 0 && (
                      <p>
                        Campos não encontrados no laudo:{" "}
                        {extractionState.extraction.missing_fields.join(", ")}.
                      </p>
                    )}
                    {extractionState.extraction.warnings.length > 0 && (
                      <ul className="ml-4 list-disc">
                        {extractionState.extraction.warnings.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    )}
                    <p className="flex items-center gap-1 pt-1 text-muted-foreground">
                      <AlertTriangle className="h-3 w-3" aria-hidden />A
                      leitura automática não substitui revisão humana do
                      laudo.
                    </p>
                  </AlertDescription>
                </Alert>
              )}
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
