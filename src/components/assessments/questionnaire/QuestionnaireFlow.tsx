/**
 * Orquestra o form do Questionário Precision 12 em 8 telas.
 *
 * - 1 form raiz com `useForm` + `zodResolver(buildPrecision12QuestionnaireSchema({...}))`
 * - FormProvider envolve os screens; cada screen usa `useFormContext`
 * - Validação por etapa via `form.trigger(fieldsOfCurrentScreen)`
 * - Submit final só na tela 8
 * - Progress bar “Tela X de 8”
 *
 * Acessibilidade:
 *   - Foco vai pro topo do screen ou primeiro erro ao trocar de tela
 *   - aria-live no progresso
 *   - Botões desabilitados durante validação/submit
 */

import { useEffect, useRef, useState } from "react";
import { useForm, FormProvider, type FieldPath } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronLeft, ChevronRight, Loader2, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  buildPrecision12QuestionnaireSchema,
  type Precision12QuestionnaireInput,
} from "@/utils/precision12QuestionnaireValidation";

import { Screen1Identification } from "./screens/Screen1Identification";
import { Screen2ParQ } from "./screens/Screen2ParQ";
import { Screen3Goals } from "./screens/Screen3Goals";
import { Screen4Availability } from "./screens/Screen4Availability";
import { Screen5Health } from "./screens/Screen5Health";
import { Screen6Sleep } from "./screens/Screen6Sleep";
import { Screen7Wearable } from "./screens/Screen7Wearable";
import { Screen8Consent } from "./screens/Screen8Consent";

// ────────────────────────────────────────────────────────────────────────────

type FormValues = Precision12QuestionnaireInput;
type FieldName = FieldPath<FormValues>;

interface QuestionnaireFlowProps {
  requireBirthdate: boolean;
  onSubmit: (payload: Record<string, unknown>) => Promise<void> | void;
}

const TOTAL_SCREENS = 8;

const SCREEN_TITLES = [
  "Identificação",
  "Triagem de segurança",
  "Objetivos e histórico",
  "Disponibilidade e recursos",
  "Saúde, dor e medicação",
  "Sono e estresse",
  "Wearable e perfil",
  "Confirmação",
] as const;

const SCREEN_FIELDS: Record<number, readonly FieldName[]> = {
  0: [
    "full_name",
    "email",
    "phone",
    "birthdate",
    "gender",
    "profession",
    "routine",
  ],
  1: [
    "parq_q8_heart_condition",
    "parq_q9_chest_pain_exercise",
    "parq_q10_chest_pain_recent",
    "parq_q11_loss_consciousness_or_dizziness_fall",
    "parq_q12_bone_joint",
    "parq_q13_blood_pressure_meds",
    "parq_q14_other_health_reason",
  ],
  2: [
    "goals",
    "goal_details",
    "previous_attempts",
    "exercise_history",
    "fitness_self_rating",
    "body_satisfaction",
  ],
  3: [
    "session_duration",
    "weekly_frequency",
    "training_available_days",
    "training_period",
    "frequent_traveler",
    "external_training_resources",
    "routine_description",
    "primary_adherence_barrier",
  ],
  4: [
    "pain_status",
    "pain_movements",
    "pain_location",
    "biggest_difficulty",
    "has_medical_condition",
    "medical_condition_details",
    "uses_medications",
    "medications_continuous",
    "injury_surgery_history",
    "recovery_strategies",
    "alcohol",
    "tobacco",
    "caffeine_doses",
  ],
  5: [
    "sleep_hours",
    "sleep_quality",
    "stress_level",
    "energy_level",
    "recovery_quality",
  ],
  6: [
    "uses_wearable",
    "wearable_brand",
    "share_data",
    "motivations",
    "discomfort_response",
    "difficulty_helper",
    "missed_session_response",
    "firm_professional_response",
    "accompaniment_preference",
    "correction_preference",
    "consistency_self_rating",
    "life_stability",
    "deal_breaker",
  ],
  7: [
    "consent_truthful",
    "consent_not_medical",
    "consent_data_use",
    "consent_terms",
  ],
} satisfies Record<number, readonly FieldName[]>;

// ────────────────────────────────────────────────────────────────────────────

const defaultValues: Partial<FormValues> = {
  // Tela 1 — strings vazias permitem o aluno preencher sem default
  full_name: "",
  email: "",
  phone: "",
  birthdate: null,
  gender: undefined as unknown as FormValues["gender"],
  profession: "",
  routine: undefined as unknown as FormValues["routine"],

  // Tela 2 — PAR-Q: undefined força resposta explícita
  parq_q8_heart_condition: undefined as unknown as boolean,
  parq_q9_chest_pain_exercise: undefined as unknown as boolean,
  parq_q10_chest_pain_recent: undefined as unknown as boolean,
  parq_q11_loss_consciousness_or_dizziness_fall: undefined as unknown as boolean,
  parq_q12_bone_joint: undefined as unknown as boolean,
  parq_q13_blood_pressure_meds: undefined as unknown as boolean,
  parq_q14_other_health_reason: undefined as unknown as boolean,

  // Tela 3
  goals: [],
  goal_details: "",
  previous_attempts: "",
  exercise_history: undefined as unknown as FormValues["exercise_history"],
  fitness_self_rating: undefined as unknown as number,
  body_satisfaction: undefined as unknown as number,

  // Tela 4
  session_duration: undefined as unknown as FormValues["session_duration"],
  weekly_frequency: undefined as unknown as FormValues["weekly_frequency"],
  training_available_days: [],
  training_period: undefined as unknown as FormValues["training_period"],
  frequent_traveler: undefined as unknown as boolean,
  external_training_resources: [],
  routine_description: "",
  primary_adherence_barrier:
    undefined as unknown as FormValues["primary_adherence_barrier"],

  // Tela 5
  pain_status: undefined as unknown as FormValues["pain_status"],
  pain_movements: [],
  pain_location: "",
  biggest_difficulty: [],
  has_medical_condition: undefined as unknown as boolean,
  medical_condition_details: "",
  uses_medications: undefined as unknown as boolean,
  medications_continuous: "",
  injury_surgery_history: "",
  recovery_strategies: [],
  alcohol: undefined,
  tobacco: undefined,
  caffeine_doses: undefined,

  // Tela 6
  sleep_hours: undefined as unknown as FormValues["sleep_hours"],
  sleep_quality: undefined as unknown as number,
  stress_level: undefined as unknown as number,
  energy_level: undefined as unknown as number,
  recovery_quality: undefined as unknown as FormValues["recovery_quality"],

  // Tela 7
  uses_wearable: undefined as unknown as boolean,
  wearable_brand: undefined,
  share_data: undefined,
  motivations: [],
  discomfort_response: undefined as unknown as FormValues["discomfort_response"],
  difficulty_helper: undefined as unknown as FormValues["difficulty_helper"],
  missed_session_response:
    undefined as unknown as FormValues["missed_session_response"],
  firm_professional_response:
    undefined as unknown as FormValues["firm_professional_response"],
  accompaniment_preference:
    undefined as unknown as FormValues["accompaniment_preference"],
  correction_preference:
    undefined as unknown as FormValues["correction_preference"],
  consistency_self_rating:
    undefined as unknown as FormValues["consistency_self_rating"],
  life_stability: undefined as unknown as FormValues["life_stability"],
  deal_breaker: "",

  // Tela 8 — consentimentos (literal true; partem como undefined,
  // forçando aluno a marcar)
  consent_truthful: undefined as unknown as true,
  consent_not_medical: undefined as unknown as true,
  consent_data_use: undefined as unknown as true,
  consent_terms: undefined as unknown as true,
};

// ────────────────────────────────────────────────────────────────────────────

export function QuestionnaireFlow({
  requireBirthdate,
  onSubmit,
}: QuestionnaireFlowProps) {
  const [screenIndex, setScreenIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(buildPrecision12QuestionnaireSchema({ requireBirthdate })),
    defaultValues: defaultValues as FormValues,
    mode: "onSubmit",
  });

  // Foco no topo ao trocar de tela
  useEffect(() => {
    containerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    const heading = containerRef.current?.querySelector<HTMLElement>("h2");
    heading?.focus();
  }, [screenIndex]);

  const isLastScreen = screenIndex === TOTAL_SCREENS - 1;

  const goNext = async () => {
    const fields = SCREEN_FIELDS[screenIndex];
    const ok = await form.trigger(fields as FieldName[], { shouldFocus: true });
    if (!ok) return;
    setScreenIndex((idx) => Math.min(TOTAL_SCREENS - 1, idx + 1));
  };

  const goBack = () => {
    setScreenIndex((idx) => Math.max(0, idx - 1));
  };

  const handleSubmit = form.handleSubmit(async (values) => {
    setIsSubmitting(true);
    try {
      // Envia o input validado. Normalização (vazios -> null, condicionais
      // limpas) é responsabilidade da edge function `submit-precision12-...`.
      await onSubmit(values as unknown as Record<string, unknown>);
    } finally {
      setIsSubmitting(false);
    }
  });

  const progressPct = ((screenIndex + 1) / TOTAL_SCREENS) * 100;

  return (
    <div className="flex min-h-screen items-start justify-center bg-background p-3 sm:p-6">
      <Card className="w-full max-w-2xl" ref={containerRef}>
        <CardHeader>
          <div className="flex items-baseline justify-between">
            <CardTitle className="text-lg" tabIndex={-1}>
              <span className="block text-xs font-normal text-muted-foreground">
                Tela {screenIndex + 1} de {TOTAL_SCREENS}
              </span>
              <span>{SCREEN_TITLES[screenIndex]}</span>
            </CardTitle>
          </div>
          <Progress
            value={progressPct}
            className="h-1.5"
            aria-label={`Progresso ${screenIndex + 1} de ${TOTAL_SCREENS}`}
          />
        </CardHeader>

        <CardContent>
          <FormProvider {...form}>
            <form
              onSubmit={(e) => {
                if (!isLastScreen) {
                  e.preventDefault();
                  void goNext();
                  return;
                }
                void handleSubmit(e);
              }}
              className="space-y-6"
              noValidate
            >
              <ScreenSwitcher index={screenIndex} />

              <div
                className="flex items-center justify-between gap-3 border-t pt-4"
                role="group"
                aria-label="Navegação do questionário"
              >
                <Button
                  type="button"
                  variant="outline"
                  onClick={goBack}
                  disabled={screenIndex === 0 || isSubmitting}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Voltar
                </Button>

                {!isLastScreen ? (
                  <Button type="submit" disabled={isSubmitting}>
                    Próximo
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                ) : (
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="mr-1 h-4 w-4" />
                    )}
                    Enviar questionário
                  </Button>
                )}
              </div>
            </form>
          </FormProvider>
        </CardContent>
      </Card>
    </div>
  );
}

function ScreenSwitcher({ index }: { index: number }) {
  switch (index) {
    case 0:
      return <Screen1Identification />;
    case 1:
      return <Screen2ParQ />;
    case 2:
      return <Screen3Goals />;
    case 3:
      return <Screen4Availability />;
    case 4:
      return <Screen5Health />;
    case 5:
      return <Screen6Sleep />;
    case 6:
      return <Screen7Wearable />;
    case 7:
      return <Screen8Consent />;
    default:
      return null;
  }
}
