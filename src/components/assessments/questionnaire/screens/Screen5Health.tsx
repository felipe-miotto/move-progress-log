import { useFormContext } from "react-hook-form";

import {
  ALCOHOL_OPTIONS,
  BIGGEST_DIFFICULTY_OPTIONS,
  CAFFEINE_DOSES_OPTIONS,
  PAIN_MOVEMENT_OPTIONS,
  PAIN_STATUS_OPTIONS,
  PAIN_STATUS_REQUIRES_DETAILS,
  RECOVERY_STRATEGY_OPTIONS,
  TOBACCO_OPTIONS,
} from "@/constants/precision12Questionnaire";
import type { Precision12QuestionnaireInput } from "@/utils/precision12QuestionnaireValidation";

import {
  BooleanField,
  CheckboxArrayField,
  RadioField,
  TextAreaField,
} from "../fields/QuestionnaireFields";

/** Tela 5 — Saúde, dor e medicação (Blocos 6 + 9 + novas D5/D9) */
export function Screen5Health() {
  const form = useFormContext<Precision12QuestionnaireInput>();
  const painStatus = form.watch("pain_status");
  const hasMedicalCondition = form.watch("has_medical_condition");
  const usesMedications = form.watch("uses_medications");

  const painRequiresDetails =
    !!painStatus &&
    (PAIN_STATUS_REQUIRES_DETAILS as readonly string[]).includes(painStatus);

  return (
    <section className="space-y-5">
      <header>
        <h2
          tabIndex={-1}
          className="text-sm font-semibold text-muted-foreground focus-visible:outline-none"
        >
          Saúde, dor e medicação
        </h2>
      </header>

      <RadioField
        name="pain_status"
        label="Você sente atualmente alguma dor, desconforto ou limitação ao se movimentar?"
        options={PAIN_STATUS_OPTIONS}
        required
      />

      {painRequiresDetails && (
        <>
          <CheckboxArrayField
            name="pain_movements"
            label="Quais movimentos causam dor ou desconforto?"
            options={PAIN_MOVEMENT_OPTIONS}
            required
          />
          <TextAreaField
            name="pain_location"
            label="Descreva o local da dor e há quanto tempo sente isso"
            rows={3}
            maxLength={500}
            required
          />
        </>
      )}

      <CheckboxArrayField
        name="biggest_difficulty"
        label="Qual é sua maior dificuldade hoje em relação ao exercício?"
        options={BIGGEST_DIFFICULTY_OPTIONS}
      />

      <BooleanField
        name="has_medical_condition"
        label="Você possui alguma doença, condição de saúde relevante ou recomendação médica que possa influenciar sua prática de exercícios?"
        required
      />
      {hasMedicalCondition === true && (
        <TextAreaField
          name="medical_condition_details"
          label="Descreva brevemente a condição e/ou restrição indicada pelo médico"
          rows={3}
          maxLength={2000}
          required
        />
      )}

      <BooleanField
        name="uses_medications"
        label="Você faz uso contínuo de algum medicamento?"
        required
      />
      {usesMedications === true && (
        <TextAreaField
          name="medications_continuous"
          label="Liste os medicamentos contínuos"
          rows={3}
          maxLength={2000}
          required
        />
      )}

      <TextAreaField
        name="injury_surgery_history"
        label="Você já teve lesão, cirurgia ou restrição relevante (mesmo antiga) que ainda possa influenciar seu treino?"
        rows={3}
        maxLength={2000}
      />

      <CheckboxArrayField
        name="recovery_strategies"
        label="Você pratica alguma estratégia de recuperação?"
        options={RECOVERY_STRATEGY_OPTIONS}
        description="Se marcar 'Nenhuma', não marque outras opções."
      />

      <RadioField name="alcohol" label="Consumo de álcool" options={ALCOHOL_OPTIONS} />
      <RadioField name="tobacco" label="Tabaco / vape" options={TOBACCO_OPTIONS} />
      <RadioField
        name="caffeine_doses"
        label="Doses de cafeína por dia"
        options={CAFFEINE_DOSES_OPTIONS}
      />
    </section>
  );
}
