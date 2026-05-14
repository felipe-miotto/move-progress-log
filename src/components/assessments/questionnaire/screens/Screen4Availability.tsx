import {
  EXTERNAL_TRAINING_RESOURCES_OPTIONS,
  PRIMARY_ADHERENCE_BARRIER_OPTIONS,
  SESSION_DURATION_OPTIONS,
  TRAINING_AVAILABLE_DAYS_OPTIONS,
  TRAINING_PERIOD_OPTIONS,
  WEEKLY_FREQUENCY_VALUES,
} from "@/constants/precision12Questionnaire";

import {
  BooleanField,
  CheckboxArrayField,
  RadioField,
  TextAreaField,
} from "../fields/QuestionnaireFields";

const WEEKLY_FREQUENCY_OPTIONS = WEEKLY_FREQUENCY_VALUES.map((n) => ({
  code: String(n),
  label: `${n} vez${n === 1 ? "" : "es"} por semana`,
}));

/** Tela 4 — Disponibilidade e recursos (Bloco 5 + novas D6/D7/D8) */
export function Screen4Availability() {
  return (
    <section className="space-y-5">
      <header>
        <h2
          tabIndex={-1}
          className="text-sm font-semibold text-muted-foreground focus-visible:outline-none"
        >
          Disponibilidade e recursos
        </h2>
      </header>

      <RadioField
        name="session_duration"
        label="Quanto tempo real você tem disponível para treinar por sessão?"
        options={SESSION_DURATION_OPTIONS}
        required
      />
      <RadioField
        name="weekly_frequency"
        label="Quantas vezes por semana você consegue treinar de forma realista?"
        options={WEEKLY_FREQUENCY_OPTIONS}
        valueCoerce="number"
        required
      />
      <CheckboxArrayField
        name="training_available_days"
        label="Quais dias da semana você tem disponíveis para treinar?"
        options={TRAINING_AVAILABLE_DAYS_OPTIONS}
        required
      />
      <RadioField
        name="training_period"
        label="Em qual período do dia você tende a treinar?"
        options={TRAINING_PERIOD_OPTIONS}
        required
      />
      <BooleanField
        name="frequent_traveler"
        label="Você viaja com frequência ou tem rotina instável?"
        required
      />
      <CheckboxArrayField
        name="external_training_resources"
        label="Além da Fabrik, quais recursos de treino você tem disponíveis?"
        options={EXTERNAL_TRAINING_RESOURCES_OPTIONS}
        description="Se marcar 'Nenhum', não marque outras opções."
      />
      <TextAreaField
        name="routine_description"
        label="Descreva sua rotina atual de trabalho, família e horários"
        rows={3}
        maxLength={2000}
      />
      <RadioField
        name="primary_adherence_barrier"
        label="Qual é a maior barreira que pode te tirar do programa?"
        options={PRIMARY_ADHERENCE_BARRIER_OPTIONS}
        required
      />
    </section>
  );
}
