import { useMemo, useState, useRef } from "react";
import { useStudents } from "@/hooks/useStudents";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageLoadingSkeleton } from "@/components/PageLoadingSkeleton";
import { OuraApiDiagnosticsCard } from "@/components/OuraApiDiagnosticsCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExerciseDistributionDiagnostic } from "@/components/ExerciseDistributionDiagnostic";
import { AlertTriangle, ArrowLeft, Shield, Upload, Loader2, FileSpreadsheet, UserRoundSearch } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PageLayout } from "@/components/PageLayout";
import { PageHeader } from "@/components/PageHeader";
import { useIsAdmin } from "@/hooks/useUserRole";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { NAV_LABELS, ROUTES } from "@/constants/navigation";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useSEOHead, SEO_PRESETS } from "@/hooks/useSEOHead";
import { useOpenGraph, FABRIK_OG_DEFAULTS } from "@/hooks/useOpenGraph";
import { getWebPageSchema, getBreadcrumbSchema } from "@/utils/structuredData";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import exercisesJSON from "@/data/exercicios_fabrik_categorizado.json";
import { logger } from "@/utils/logger";
import { buildErrorDescription } from "@/utils/errorParsing";
import { findDuplicateStudentCandidates, type DuplicateStudentConfidence } from "@/utils/studentDuplicateDetection";

const extractExcelCellValue = (value: unknown): unknown => {
  if (value instanceof Date) return value;
  if (typeof value !== "object" || value === null) return value;

  const record = value as Record<string, unknown>;
  if ("result" in record && record.result !== undefined && record.result !== null) {
    return record.result;
  }
  if ("text" in record && typeof record.text === "string") {
    return record.text;
  }
  if ("richText" in record && Array.isArray(record.richText)) {
    return (record.richText as Array<{ text?: string }>)
      .map((item) => item.text || "")
      .join("")
      .trim();
  }
  return value;
};

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const normalized = value.replace(",", ".").trim();
    const parsed = Number(normalized);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return undefined;
};

const duplicateConfidenceLabel: Record<DuplicateStudentConfidence, string> = {
  alta: "Alta confiança",
  media: "Revisar",
  baixa: "Baixa confiança",
  conflito: "Conflito",
};

const duplicateConfidenceVariant: Record<DuplicateStudentConfidence, "default" | "secondary" | "destructive" | "outline"> = {
  alta: "default",
  media: "secondary",
  baixa: "outline",
  conflito: "destructive",
};

const AdminDiagnosticsPage = () => {
  usePageTitle(NAV_LABELS.adminDiagnostics);
  useSEOHead(SEO_PRESETS.private);
  useOpenGraph({
    ...FABRIK_OG_DEFAULTS,
    title: `${NAV_LABELS.adminDiagnostics} · Fabrik Performance`,
    description: 'Diagnósticos e monitoramento do sistema Fabrik Performance.',
    type: 'website',
    url: true,
  });
  
  const navigate = useNavigate();
  const { data: students, isLoading } = useStudents();
  const duplicateStudentCandidates = useMemo(
    () => findDuplicateStudentCandidates(students ?? [], 12),
    [students]
  );
  const { isAdmin, isLoading: isLoadingRole } = useIsAdmin();
  const [importing, setImporting] = useState(false);
  const [importingXlsx, setImportingXlsx] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const [importResult, setImportResult] = useState<Record<string, unknown> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportExercises = async () => {
    setImporting(true);
    setImportResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("import-exercises", {
        body: exercisesJSON,
      });
      if (error) throw error;
      setImportResult(data);
      toast.success(`Importação concluída: ${data.inserted} inseridos, ${data.updated} atualizados`);
    } catch (err) {
      toast.error("Erro na importação", {
        description: buildErrorDescription(err, "Tente novamente."),
      });
    } finally {
      setImporting(false);
    }
  };

  const [xlsxDebug, setXlsxDebug] = useState<Record<string, unknown> | null>(null);

  const BATCH_SIZE = 5;

  const handleImportXlsx = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setImportingXlsx(true);
    setImportResult(null);
    setXlsxDebug(null);
    setImportProgress(null);
    try {
      const { default: ExcelJS } = await import("exceljs");
      const data = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(data);
      const sheetNames = workbook.worksheets.map(ws => ws.name);
      const targetSheetName = sheetNames.find(
        (n: string) => n.toLowerCase().includes("exercicio") || n.toLowerCase().includes("consolidado")
      ) || sheetNames[0];
      const sheet = workbook.getWorksheet(targetSheetName)!;
      
      // Convert ExcelJS worksheet to array of objects
      const headers: string[] = [];
      const rows: Record<string, unknown>[] = [];
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) {
          row.eachCell((cell, colNumber) => {
            headers[colNumber] = String(cell.value ?? "");
          });
        } else {
          const rowObj: Record<string, unknown> = {};
          row.eachCell((cell, colNumber) => {
            const key = headers[colNumber];
            if (key) rowObj[key] = extractExcelCellValue(cell.value);
          });
          rows.push(rowObj);
        }
      });
      
      const firstRow = rows[0] || {};
      const rawKeys = Object.keys(firstRow);
      const debugInfo: Record<string, unknown> = {
        sheetName: targetSheetName,
        totalSheets: sheetNames.length,
        allSheetNames: sheetNames,
        rowCount: rows.length,
        rawKeys,
        firstRowSample: Object.entries(firstRow).slice(0, 8).map(([k, v]) => `${k}=${v}`),
      };
      setXlsxDebug(debugInfo);

      const normalizeKey = (key: string) => 
        key.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
      
      const exercises = rows.map(row => {
        const normalized: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(row)) {
          normalized[normalizeKey(key)] = value;
          normalized[key] = value;
        }
        return {
          exercicio_pt: normalized["exercicio_pt"] || normalized["nome"] || normalized["name"],
          aliases_origem: normalized["aliases_origem"] || "",
          Padrao_movimento: normalized["Padrao_movimento"] || normalized["padrao_movimento"],
          subcategoria: normalized["subcategoria"],
          boyle_score: toNumber(normalized["boyle_score"]),
          AX: toNumber(normalized["AX"]),
          LOM: toNumber(normalized["LOM"]),
          TEC: toNumber(normalized["TEC"]),
          MET: toNumber(normalized["MET"]),
          JOE: toNumber(normalized["JOE"]),
          QUA: toNumber(normalized["QUA"]),
          grupo_muscular: normalized["grupo_muscular"],
          "Ênfase": normalized["Ênfase"] || normalized["enfase"] || normalized["ênfase"],
          Base: normalized["Base"] || normalized["base"],
          lateralidade: normalized["lateralidade"],
          "Posição": normalized["Posição"] || normalized["posicao"],
          plano: normalized["plano"],
          Tipo_contracao: normalized["Tipo_contracao"] || normalized["tipo_contracao"],
          risco: normalized["risco"],
          nivel_boyle: normalized["nivel_boyle"],
          equipamento: normalized["equipamento"],
          Implemento: normalized["Implemento"] || normalized["implemento"],
        };
      });

      debugInfo.exercisesWithName = exercises.filter(e => e.exercicio_pt).length;
      debugInfo.exercisesTotal = exercises.length;
      debugInfo.firstMapped = exercises[0];
      setXlsxDebug({ ...debugInfo });

      // Split into batches
      const batches: typeof exercises[] = [];
      for (let i = 0; i < exercises.length; i += BATCH_SIZE) {
        batches.push(exercises.slice(i, i + BATCH_SIZE));
      }

      let totalInserted = 0;
      let totalUpdated = 0;
      let totalSkipped = 0;
      let totalOrphansReclassified = 0;
      let lastResult: Record<string, unknown> = {};

      for (let i = 0; i < batches.length; i++) {
        setImportProgress({ current: i * BATCH_SIZE, total: exercises.length });
        
        const payload = { 
          format: "spreadsheet", 
          exercises: batches[i],
          reclassify_orphans: false,
        };

        logger.log(`[import] Batch ${i + 1}/${batches.length}, size: ${batches[i].length}`);

        let result: Record<string, unknown>;
        try {
          const { data, error } = await supabase.functions.invoke("import-exercises", {
            body: payload,
          });
          if (error) {
            logger.error(`[import] Batch ${i + 1} invoke error:`, error);
            throw error;
          }
          result = data;
        } catch (invokeErr) {
          logger.error(`[import] Batch ${i + 1} failed:`, invokeErr);
          throw new Error(`Batch ${i + 1} falhou: ${(invokeErr as Error).message}`);
        }
        
        totalInserted += Number(result.inserted || 0);
        totalUpdated += Number(result.updated || 0);
        totalSkipped += Number(result.skipped || 0);
        totalOrphansReclassified += Number(result.orphans_reclassified || 0);
        lastResult = result;

        // Yield to UI
        await new Promise(r => setTimeout(r, 100));
      }

      setImportProgress({ current: exercises.length, total: exercises.length });
      
      const aggregatedResult = {
        ...lastResult,
        format: "spreadsheet",
        inserted: totalInserted,
        updated: totalUpdated,
        skipped: totalSkipped,
        orphans_reclassified: totalOrphansReclassified,
        total_processed: exercises.length,
        batches_sent: batches.length,
      };
      setImportResult(aggregatedResult);
      toast.success(`Importação XLSX: ${totalInserted} inseridos, ${totalUpdated} atualizados, ${totalOrphansReclassified} órfãos reclassificados`);
    } catch (err) {
      toast.error("Erro na importação XLSX", {
        description: buildErrorDescription(err, "Tente novamente."),
      });
    } finally {
      setImportingXlsx(false);
      setImportProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (isLoadingRole) {
    return <PageLoadingSkeleton layout="list" />;
  }

  if (!isAdmin) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertDescription>
            Você não tem permissão para acessar esta página. Apenas administradores podem ver o diagnóstico da API Oura.
          </AlertDescription>
        </Alert>
        <Button onClick={() => navigate(ROUTES.students)} className="mt-4">
          Voltar para Alunos
        </Button>
      </div>
    );
  }

  return (
    <PageLayout
      structuredData={[
        { data: getWebPageSchema(NAV_LABELS.adminDiagnostics, "Diagnósticos e monitoramento do sistema"), id: "webpage-schema" },
        { data: getBreadcrumbSchema([{ label: "Home", href: "/" }, { label: NAV_LABELS.students, href: "/alunos" }, { label: NAV_LABELS.adminDiagnostics }]), id: "breadcrumb-schema" },
      ]}
    >
      <PageHeader
        title={NAV_LABELS.adminDiagnostics}
        breadcrumbs={[
          { label: NAV_LABELS.students, href: "/alunos" },
          { label: NAV_LABELS.adminDiagnostics, icon: Shield },
        ]}
        actions={
          <Button variant="ghost" size="icon" onClick={() => navigate(ROUTES.students)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
        }
      />

        {/* Import Exercises Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Importar Exercícios
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              {/* JSON Import */}
              <div className="flex-1 space-y-2">
                <p className="text-sm text-muted-foreground">
                  JSON oficial (491 exercícios categorizados)
                </p>
                <Button 
                  onClick={handleImportExercises} 
                  disabled={importing || importingXlsx}
                  variant="outline"
                  className="w-full"
                >
                  {importing ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importando JSON...</>
                  ) : (
                    <><Upload className="h-4 w-4 mr-2" />Importar JSON</>
                  )}
                </Button>
              </div>

              {/* XLSX Import */}
              <div className="flex-1 space-y-2">
                <p className="text-sm text-muted-foreground">
                  Planilha XLSX com scores multidimensionais (AX, LOM, TEC, MET, JOE, QUA)
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleImportXlsx}
                  className="hidden"
                />
                <Button 
                  onClick={() => fileInputRef.current?.click()} 
                  disabled={importing || importingXlsx}
                  variant="default"
                  className="w-full"
                >
                  {importingXlsx && importProgress ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Lote {Math.ceil(importProgress.current / BATCH_SIZE)}/{Math.ceil(importProgress.total / BATCH_SIZE)}…</>
                  ) : importingXlsx ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Lendo planilha...</>
                  ) : (
                    <><FileSpreadsheet className="h-4 w-4 mr-2" />Importar Planilha XLSX</>
                  )}
                </Button>
              </div>
            </div>

            {xlsxDebug && (
              <div className="rounded-md border border-amber-500 p-4 space-y-2 text-sm bg-amber-500/10">
                <p className="font-semibold text-amber-600">📊 Debug da Planilha (frontend)</p>
                <pre className="text-xs max-h-60 overflow-auto bg-muted p-2 rounded">
                  {JSON.stringify(xlsxDebug, null, 2)}
                </pre>
              </div>
            )}

            {importResult && (
              <div className="rounded-md border p-4 space-y-2 text-sm">
                <p><strong>Formato:</strong> {String(importResult.format || "json")}</p>
                <p><strong>Inseridos:</strong> {String(importResult.inserted)}</p>
                <p><strong>Atualizados:</strong> {String(importResult.updated)}</p>
                {importResult.skipped != null && Number(importResult.skipped) > 0 && (
                  <p><strong>Ignorados (MetCon):</strong> {String(importResult.skipped)}</p>
                )}
                {importResult.orphans_reclassified != null && (
                  <p><strong>Órfãos reclassificados:</strong> {String(importResult.orphans_reclassified)}</p>
                )}
                <p><strong>Total processado:</strong> {String(importResult.total_processed)}</p>
                {importResult.errors_total && Number(importResult.errors_total) > 0 && (
                  <div>
                    <p className="text-destructive font-medium">Erros: {String(importResult.errors_total)}</p>
                    <pre className="text-xs mt-1 max-h-40 overflow-auto bg-muted p-2 rounded">
                      {JSON.stringify(importResult.errors, null, 2)}
                    </pre>
                  </div>
                )}
                {importResult.orphans_total && Number(importResult.orphans_total) > 0 && (
                  <details>
                    <summary className="cursor-pointer text-muted-foreground">
                      Exercícios órfãos ({String(importResult.orphans_total)}) — não estão na fonte importada
                    </summary>
                    <pre className="text-xs mt-1 max-h-40 overflow-auto bg-muted p-2 rounded">
                      {JSON.stringify(importResult.orphans, null, 2)}
                    </pre>
                  </details>
                )}
                {importResult.debug_samples && (
                  <details open>
                    <summary className="cursor-pointer text-amber-600 font-medium">
                      🔍 Debug: primeiros exercícios recebidos
                    </summary>
                    <pre className="text-xs mt-1 max-h-60 overflow-auto bg-muted p-2 rounded">
                      {JSON.stringify(importResult.debug_samples, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Exercise Distribution Diagnostic */}
        <ExerciseDistributionDiagnostic />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserRoundSearch className="h-5 w-5" />
              Possíveis alunos duplicados
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Este diagnóstico não consolida alunos automaticamente. Ele só aponta candidatos para revisão manual,
                porque nomes parecidos podem representar pessoas diferentes.
              </AlertDescription>
            </Alert>

            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((item) => (
                  <Skeleton key={item} className="h-20 w-full" />
                ))}
              </div>
            ) : duplicateStudentCandidates.length === 0 ? (
              <div className="rounded-md border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                Nenhum candidato encontrado pelos critérios seguros atuais.
              </div>
            ) : (
              <div className="space-y-3">
                {duplicateStudentCandidates.map((candidate) => (
                  <div
                    key={`${candidate.studentA.id}-${candidate.studentB.id}`}
                    className="rounded-lg border bg-muted/20 p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">
                            {candidate.studentA.name} ↔ {candidate.studentB.name}
                          </p>
                          <Badge variant={duplicateConfidenceVariant[candidate.confidence]}>
                            {duplicateConfidenceLabel[candidate.confidence]}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            Score {(candidate.score * 100).toFixed(0)}%
                          </span>
                        </div>

                        <div className="text-sm text-muted-foreground">
                          <p>ID A: {candidate.studentA.id}</p>
                          <p>ID B: {candidate.studentB.id}</p>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(ROUTES.studentDetail(candidate.studentA.id))}
                        >
                          Abrir A
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(ROUTES.studentDetail(candidate.studentB.id))}
                        >
                          Abrir B
                        </Button>
                      </div>
                    </div>

                    {candidate.blockingReasons.length > 0 && (
                      <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                        {candidate.blockingReasons.join(" ")} Não consolidar sem validação humana.
                      </div>
                    )}

                    {candidate.reasons.length > 0 && (
                      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                        {candidate.reasons.map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="space-y-6">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-48" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-40 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : students && students.length > 0 ? (
          <div className="space-y-8">
            {students.map((student) => (
              <div key={student.id} className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-semibold">{student.name}</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(ROUTES.studentDetail(student.id))}
                  >
                    Ver Detalhes
                  </Button>
                </div>
                <OuraApiDiagnosticsCard studentId={student.id} />
              </div>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-xl font-semibold text-muted-foreground">
                Nenhum aluno cadastrado
              </p>
            </CardContent>
          </Card>
        )}
    </PageLayout>
  );
};

export default AdminDiagnosticsPage;
