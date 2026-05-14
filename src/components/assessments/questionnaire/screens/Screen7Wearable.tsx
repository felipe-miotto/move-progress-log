import { useFormContext } from "react-hook-form";

import {
  ACCOMPANIMENT_PREFERENCE_OPTIONS,
  CONSISTENCY_SELF_RATING_OPTIONS,
  CORRECTION_PREFERENCE_OPTIONS,
  DIFFICULTY_HELPER_OPTIONS,
  DISCOMFORT_RESPONSE_OPTIONS,
  FIRM_PROFESSIONAL_RESPONSE_OPTIONS,
  LIFE_STABILITY_OPTIONS,
  MISSED_SESSION_RESPONSE_OPTIONS,
  MOTIVATION_OPTIONS,
  WEARABLE_BRAND_OPTIONS,
} from "@/constants/precision12Questionnaire";
import type { Precision12QuestionnaireInput } from "@/utils/precision12QuestionnaireValidation";

import {
  BooleanField,
  CheckboxArrayField,
  RadioField,
  TextAreaField,
} from "../fields/QuestionnaireFields";

/** Tela 7 — Wearable + perfil comportamental (Blocos 8 + 10) */
export function Screen7Wearable() {
  const form = useFormContext<Precision12QuestionnaireInput>();
  const usesWearable = form.watch("uses_wearable");

  return (
    <section className="space-y-5">
      <header>
        <h2
          tabIndex={-1}
          className="text-sm font-semibold text-muted-foreground focus-visible:outline-none"
        >
          Wearable e perfil comportamental
        </h2>
      </header>

      <BooleanField
        name="uses_wearable"
        label="Você utiliza algum dispositivo de monitoramento hoje?"
        required
      />
      {usesWearable === true && (
        <>
          <RadioField
            name="wearable_brand"
            label="Qual dispositivo você utiliza?"
            options={WEARABLE_BRAND_OPTIONS}
            required
          />
          <BooleanField
            name="share_data"
            label="Você está disposto(a) a compartilhar esses dados com a Fabrik?"
          />
        </>
      )}

      <CheckboxArrayField
        name="motivations"
        label="O que mais te motiva a treinar?"
        options={MOTIVATION_OPTIONS}
        maxItems={2}
        required
      />
      <RadioField
        name="discomfort_response"
        label="Quando o desconforto físico aumenta durante o treino, você tende a:"
        options={DISCOMFORT_RESPONSE_OPTIONS}
        required
      />
      <RadioField
        name="difficulty_helper"
        label="Quando o treino fica muito difícil, o que mais te ajuda a continuar?"
        options={DIFFICULTY_HELPER_OPTIONS}
        required
      />
      <RadioField
        name="missed_session_response"
        label="Quando você não consegue cumprir o treino como planejado, você:"
        options={MISSED_SESSION_RESPONSE_OPTIONS}
        required
      />
      <RadioField
        name="firm_professional_response"
        label="Quando um profissional é mais direto e firme com você, isso tende a:"
        options={FIRM_PROFESSIONAL_RESPONSE_OPTIONS}
        required
      />
      <RadioField
        name="accompaniment_preference"
        label="Você prefere um acompanhamento que:"
        options={ACCOMPANIMENT_PREFERENCE_OPTIONS}
        required
      />
      <RadioField
        name="correction_preference"
        label="Você prefere ser corrigido(a):"
        options={CORRECTION_PREFERENCE_OPTIONS}
        required
      />
      <RadioField
        name="consistency_self_rating"
        label="Na sua rotina, você se considera uma pessoa:"
        options={CONSISTENCY_SELF_RATING_OPTIONS}
        required
      />
      <RadioField
        name="life_stability"
        label="Como está sua vida fora do treino agora?"
        options={LIFE_STABILITY_OPTIONS}
        required
      />
      <TextAreaField
        name="deal_breaker"
        label="O que mais poderia te fazer desistir definitivamente do programa?"
        rows={3}
        maxLength={2000}
      />
    </section>
  );
}
