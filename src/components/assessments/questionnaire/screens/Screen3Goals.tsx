import {
  EXERCISE_HISTORY_OPTIONS,
  GOAL_OPTIONS,
} from "@/constants/precision12Questionnaire";

import {
  CheckboxArrayField,
  LikertField,
  RadioField,
  TextAreaField,
} from "../fields/QuestionnaireFields";

/** Tela 3 — Objetivos e histórico (Blocos 3 + 4 do PDF) */
export function Screen3Goals() {
  return (
    <section className="space-y-5">
      <header>
        <h2
          tabIndex={-1}
          className="text-sm font-semibold text-muted-foreground focus-visible:outline-none"
        >
          Objetivos e histórico
        </h2>
      </header>

      <CheckboxArrayField
        name="goals"
        label="Quais são seus principais objetivos com este programa?"
        options={GOAL_OPTIONS}
        maxItems={2}
        required
      />
      <TextAreaField
        name="goal_details"
        label="Descreva com mais detalhes o que você quer alcançar"
        rows={3}
        maxLength={2000}
      />
      <TextAreaField
        name="previous_attempts"
        label="Você já tentou alcançar esse objetivo antes? O que funcionou ou não funcionou?"
        rows={3}
        maxLength={2000}
      />
      <RadioField
        name="exercise_history"
        label="Sobre sua prática de exercícios HOJE"
        options={EXERCISE_HISTORY_OPTIONS}
        required
      />
      <LikertField
        name="fitness_self_rating"
        label="Como você avalia seu condicionamento físico atual?"
        lowLabel="Muito baixo"
        highLabel="Muito alto"
        required
      />
      <LikertField
        name="body_satisfaction"
        label="Como você avalia sua satisfação com seu corpo?"
        lowLabel="Muito insatisfeito"
        highLabel="Muito satisfeito"
        required
      />
    </section>
  );
}
