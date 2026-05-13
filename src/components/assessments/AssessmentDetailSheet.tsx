/**
 * Detail read-only de uma avaliação Precision 12.
 *
 * E2.D: permite auditar o dado salvo sem abrir edição nem relatório PDF.
 * Usa `useAssessment(id)` para trazer row mãe + tabela filha específica.
 */

import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Activity, ClipboardList, FileText } from "lucide-react";
import type { ReactNode } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ASSESSMENT_TYPE_METADATA } from "@/constants/assessmentProtocols";
import { useAssessment, type AssessmentWithChild } from "@/hooks/useAssessments";
import type { AssessmentType } from "@/types/assessment";

interface AssessmentDetailSheetProps {
  assessmentId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STATUS_LABELS: Record<string, string> = {
  in_progress: "Em andamento",
  completed: "Completa",
  aborted: "Abortada",
  blocked: "Bloqueada (PAR-Q)",
};

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  completed: "default",
  in_progress: "secondary",
  aborted: "outline",
  blocked: "destructive",
};

const STOP_REASON_LABELS: Record<string, string> = {
  pse_10: "PSE 10",
  cadence_failure: "Falha de cadência",
  pse_9_submax: "PSE 9 submáximo",
  fc_above_90pct: "FC acima de 90%",
  safety_bp: "Segurança: pressão arterial",
  safety_ischemia: "Segurança: sinal isquêmico",
  student_request: "Pedido do aluno",
  equipment: "Falha de equipamento",
};

const APPLICATION_LABELS: Record<string, string> = {
  coach_administered: "Aplicada pelo coach",
  external_lab: "Laudo externo",
  self_administered: "Autoaplicada",
};

const formatDate = (date: string | null | undefined) => {
  if (!date) return "—";
  try {
    return format(parseISO(date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  } catch {
    return date;
  }
};

const formatValue = (value: unknown, suffix = "") => {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "number") {
    return `${Number.isInteger(value) ? value : value.toFixed(1)}${suffix}`;
  }
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  return String(value);
};

const withUnit = (value: number | null | undefined, unit: string) =>
  value === null || value === undefined ? null : `${formatValue(value)} ${unit}`;

const Field = ({ label, value }: { label: string; value: unknown }) => (
  <div className="min-w-0 rounded-md border bg-muted/20 p-3">
    <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
    <dd className="mt-1 break-words text-sm font-semibold">{formatValue(value)}</dd>
  </div>
);

const Section = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <section className="space-y-3">
    <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
      {title}
    </h3>
    {children}
  </section>
);

const KeyValueGrid = ({ items }: { items: Array<[string, unknown]> }) => (
  <dl className="grid gap-2 sm:grid-cols-2">
    {items.map(([label, value]) => (
      <Field key={label} label={label} value={value} />
    ))}
  </dl>
);

const JsonBlock = ({ title, value }: { title: string; value: unknown }) => {
  if (!value) return null;

  return (
    <details className="rounded-md border bg-muted/20 p-3 text-xs">
      <summary className="cursor-pointer font-medium">{title}</summary>
      <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words text-muted-foreground">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
};

const renderVo2 = (data: AssessmentWithChild) => {
  const vo2 = data.vo2;
  if (!vo2) return <EmptyChildMessage />;

  return (
    <div className="space-y-4">
      <KeyValueGrid
        items={[
          ["VO₂ final", withUnit(vo2.vo2_final, "ml/kg/min")],
          ["Classificação", vo2.vo2_classification],
          ["FC pico", withUnit(vo2.fc_peak, "bpm")],
          ["FCmáx prevista", withUnit(vo2.fc_max_predicted, "bpm")],
          ["Recuperação 1 min", withUnit(vo2.recovery_drop_1min, "bpm")],
          ["Classificação recuperação", vo2.recovery_classification],
          ["Tempo total", withUnit(vo2.total_time_min, "min")],
          ["Velocidade final", withUnit(vo2.final_speed_kmh, "km/h")],
          ["Inclinação final", withUnit(vo2.final_incline_pct, "%")],
          ["Protocolo", vo2.protocol_name],
          ["Última carga válida", vo2.last_valid_load],
          ["Últimos watts válidos", withUnit(vo2.last_valid_watts, "W")],
          ["Motivo de parada", vo2.abort_reason ? STOP_REASON_LABELS[vo2.abort_reason] ?? vo2.abort_reason : null],
        ]}
      />

      {data.bike_stages && data.bike_stages.length > 0 && (
        <Section title="Estágios da bike">
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="p-2 text-left">#</th>
                  <th className="p-2 text-left">Tempo</th>
                  <th className="p-2 text-left">Fase</th>
                  <th className="p-2 text-left">Carga</th>
                  <th className="p-2 text-left">RPM</th>
                  <th className="p-2 text-left">Watts</th>
                  <th className="p-2 text-left">FC</th>
                  <th className="p-2 text-left">PSE</th>
                </tr>
              </thead>
              <tbody>
                {data.bike_stages.map((stage) => (
                  <tr key={stage.id} className="border-t">
                    <td className="p-2">{stage.stage_order}</td>
                    <td className="p-2">{formatValue(stage.time_label)}</td>
                    <td className="p-2">{formatValue(stage.phase)}</td>
                    <td className="p-2">{formatValue(stage.load_value)}</td>
                    <td className="p-2">{formatValue(stage.rpm_target)}</td>
                    <td className="p-2">{formatValue(stage.watts_observed)}</td>
                    <td className="p-2">{formatValue(stage.hr_final)}</td>
                    <td className="p-2">{formatValue(stage.pse)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  );
};

const renderHandgrip = (data: AssessmentWithChild) => {
  const handgrip = data.handgrip;
  if (!handgrip) return <EmptyChildMessage />;

  return (
    <KeyValueGrid
      items={[
        ["Mão dominante", handgrip.dominant_hand === "right" ? "Direita" : handgrip.dominant_hand === "left" ? "Esquerda" : null],
        ["Direita", withUnit(handgrip.right_kg, "kg")],
        ["Esquerda", withUnit(handgrip.left_kg, "kg")],
        ["Melhor geral", withUnit(handgrip.best_kg, "kg")],
        ["Classificação", handgrip.classification],
        ["Tentativas direita", handgrip.right_kg_attempts],
        ["Tentativas esquerda", handgrip.left_kg_attempts],
      ]}
    />
  );
};

const renderDexa = (data: AssessmentWithChild) => {
  const dexa = data.dexa;
  if (!dexa) return <EmptyChildMessage />;

  return (
    <div className="space-y-4">
      <KeyValueGrid
        items={[
          ["Massa total", withUnit(dexa.total_mass_kg, "kg")],
          ["Massa gorda", withUnit(dexa.fat_mass_kg, "kg")],
          ["Gordura", withUnit(dexa.fat_pct, "%")],
          ["Massa magra", withUnit(dexa.lean_mass_kg, "kg")],
          ["Massa óssea", withUnit(dexa.bone_mass_kg, "kg")],
          ["Z-score ósseo", dexa.bone_density_z_score],
          ["Gordura visceral", withUnit(dexa.visceral_fat_g, "g")],
          ["Android/Ginoide", dexa.android_gynoid_ratio],
          ["Massa magra apendicular", withUnit(dexa.appendicular_lean_mass_kg, "kg")],
          ["IMMA Baumgartner", dexa.imma_baumgartner],
          ["FMI", dexa.fmi],
          ["Percentil gordura", dexa.fat_percentile],
          ["TMB Harris-Benedict", withUnit(dexa.bmr_harris_benedict_kcal, "kcal")],
          ["TMB Mifflin-St Jeor", withUnit(dexa.bmr_mifflin_stjeor_kcal, "kcal")],
          ["PDF no storage", dexa.scan_pdf_storage_path],
          ["Método de extração", dexa.extraction_method],
        ]}
      />
      {dexa.conclusion_text && (
        <Card className="p-3 text-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Conclusão
          </p>
          <p className="mt-2 whitespace-pre-wrap">{dexa.conclusion_text}</p>
        </Card>
      )}
      <JsonBlock title="Distribuição regional" value={dexa.regional_distribution} />
    </div>
  );
};

const renderSitToStand = (data: AssessmentWithChild) => {
  const srt = data.sit_to_stand;
  if (!srt) return <EmptyChildMessage />;

  return (
    <div className="space-y-4">
      <KeyValueGrid
        items={[
          ["Sentar", srt.sit_score],
          ["Levantar", srt.rise_score],
          ["Total", srt.total_score],
          ["Classificação", srt.classification],
          ["Instabilidades ao sentar", srt.sit_instabilities],
          ["Instabilidades ao levantar", srt.rise_instabilities],
          ["Notas", srt.notes],
        ]}
      />
      <JsonBlock title="Apoios ao sentar" value={srt.sit_supports} />
      <JsonBlock title="Apoios ao levantar" value={srt.rise_supports} />
    </div>
  );
};

const renderQuestionnaire = (data: AssessmentWithChild) => {
  const q = data.questionnaire;
  if (!q) return <EmptyChildMessage label="Questionário ainda sem respostas vinculadas." />;

  return (
    <div className="space-y-4">
      <KeyValueGrid
        items={[
          ["Enviado em", q.submitted_at ? formatDate(q.submitted_at) : null],
          ["Versão", q.questionnaire_version],
          ["Nome", q.full_name],
          ["E-mail", q.email],
          ["Telefone", q.phone],
          ["Profissão", q.profession],
          ["PAR-Q bloqueado", q.parq_blocked],
          ["Objetivos", q.goals],
          ["Frequência semanal", q.weekly_frequency],
          ["Duração de sessão", q.session_duration],
          ["Dor", q.pain_status],
          ["Local da dor", q.pain_location],
          ["Sono", q.sleep_hours],
          ["Qualidade do sono", q.sleep_quality],
          ["Estresse", q.stress_level],
          ["Energia", q.energy_level],
          ["Wearable", q.uses_wearable],
          ["Marca wearable", q.wearable_brand],
          ["Condição médica", q.has_medical_condition],
        ]}
      />
      <JsonBlock title="Respostas completas do questionário" value={q} />
    </div>
  );
};

const renderCardiovascular = (data: AssessmentWithChild) => {
  const cv = data.cardiovascular;
  if (!cv) return null;

  return (
    <Section title="Base cardiovascular">
      <KeyValueGrid
        items={[
          ["Pressão sistólica", withUnit(cv.systolic_mmhg, "mmHg")],
          ["Pressão diastólica", withUnit(cv.diastolic_mmhg, "mmHg")],
          ["FC repouso", withUnit(cv.resting_hr_bpm, "bpm")],
          ["Em medicação", cv.on_medication],
          ["Medicação", cv.medication_details],
          ["Médico de referência", cv.reference_doctor_name],
          ["Contato médico", cv.reference_doctor_contact],
          ["Classificação", cv.classification],
        ]}
      />
    </Section>
  );
};

const renderSubjective = (data: AssessmentWithChild) => {
  const subjective = data.subjective;
  if (!subjective) return null;

  return (
    <Section title="Scores subjetivos">
      <KeyValueGrid
        items={[
          ["Registrado em", formatDate(subjective.recorded_at)],
          ["Sono", subjective.sleep_score],
          ["Energia", subjective.energy_score],
          ["Estresse", subjective.stress_score],
          ["Recuperação", subjective.recovery_score],
          ["Bem-estar", subjective.wellbeing_score],
          ["Humor", subjective.mood_score],
          ["Notas", subjective.notes],
        ]}
      />
    </Section>
  );
};

const EmptyChildMessage = ({ label = "Dados específicos ainda não encontrados." }: { label?: string }) => (
  <Alert>
    <ClipboardList className="h-4 w-4" />
    <AlertDescription>{label}</AlertDescription>
  </Alert>
);

const renderSpecificResult = (data: AssessmentWithChild) => {
  const type = data.assessment.assessment_type;
  if (type.startsWith("vo2_")) return renderVo2(data);
  if (type === "handgrip") return renderHandgrip(data);
  if (type === "dexa") return renderDexa(data);
  if (type === "sit_to_stand") return renderSitToStand(data);
  if (type === "questionnaire_precision12") return renderQuestionnaire(data);
  return <EmptyChildMessage />;
};

export const AssessmentDetailSheet = ({
  assessmentId,
  open,
  onOpenChange,
}: AssessmentDetailSheetProps) => {
  const { data, isLoading, isError, error } = useAssessment(open ? assessmentId : null);
  const assessment = data?.assessment;
  const meta = assessment
    ? ASSESSMENT_TYPE_METADATA[assessment.assessment_type as AssessmentType]
    : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-hidden p-0 sm:max-w-2xl">
        <SheetHeader className="border-b p-6 pr-12">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-primary/10 p-2 text-primary">
              <FileText className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <SheetTitle>{meta?.label ?? "Detalhe da avaliação"}</SheetTitle>
              <SheetDescription>
                Resultado read-only da avaliação Precision 12.
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-105px)]">
          <div className="space-y-6 p-6">
            {isLoading && (
              <div className="space-y-3">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            )}

            {isError && (
              <Alert variant="destructive">
                <Activity className="h-4 w-4" />
                <AlertDescription>
                  {error instanceof Error
                    ? error.message
                    : "Erro ao carregar detalhe da avaliação."}
                </AlertDescription>
              </Alert>
            )}

            {!isLoading && !isError && !data && <EmptyChildMessage label="Avaliação não encontrada." />}

            {data && assessment && (
              <>
                <section className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{meta?.category ?? "Avaliação"}</Badge>
                    <Badge variant={STATUS_VARIANTS[assessment.status] ?? "outline"}>
                      {STATUS_LABELS[assessment.status] ?? assessment.status}
                    </Badge>
                    {meta?.application && (
                      <Badge variant="secondary">
                        {APPLICATION_LABELS[meta.application] ?? meta.application}
                      </Badge>
                    )}
                  </div>

                  <KeyValueGrid
                    items={[
                      ["Data", formatDate(assessment.assessment_date)],
                      ["Idade", withUnit(assessment.age_years, "anos")],
                      ["Peso", withUnit(assessment.weight_kg, "kg")],
                      ["Altura", withUnit(assessment.height_cm, "cm")],
                      ["Sexo", assessment.sex],
                      ["Criada em", formatDate(assessment.created_at)],
                    ]}
                  />

                  {assessment.notes && (
                    <Card className="p-3 text-sm">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Observações
                      </p>
                      <p className="mt-2 whitespace-pre-wrap">{assessment.notes}</p>
                    </Card>
                  )}
                </section>

                <Section title="Resultado específico">{renderSpecificResult(data)}</Section>
                {renderCardiovascular(data)}
                {renderSubjective(data)}
                <JsonBlock title="Debug técnico (payload carregado)" value={data} />
              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};
