import {
  RECOVERY_QUALITY_OPTIONS,
  SLEEP_HOURS_OPTIONS,
} from "@/constants/precision12Questionnaire";

import {
  LikertField,
  RadioField,
} from "../fields/QuestionnaireFields";

/** Tela 6 — Sono, recuperação e estresse (Bloco 7) */
export function Screen6Sleep() {
  return (
    <section className="space-y-5">
      <header>
        <h2
          tabIndex={-1}
          className="text-sm font-semibold text-muted-foreground focus-visible:outline-none"
        >
          Sono, recuperação e estresse
        </h2>
      </header>

      <RadioField
        name="sleep_hours"
        label="Quantas horas você dorme por noite, em média?"
        options={SLEEP_HOURS_OPTIONS}
        required
      />
      <LikertField
        name="sleep_quality"
        label="Como você avalia a qualidade do seu sono hoje?"
        lowLabel="Muito ruim"
        highLabel="Excelente"
        required
      />
      <LikertField
        name="stress_level"
        label="Como está seu nível de estresse atualmente?"
        lowLabel="Muito baixo"
        highLabel="Muito alto"
        required
      />
      <LikertField
        name="energy_level"
        label="Como você descreveria seu nível de energia física no dia a dia?"
        lowLabel="Muito baixo"
        highLabel="Muito alto"
        required
      />
      <RadioField
        name="recovery_quality"
        label="Você sente que se recupera bem entre treinos ou tarefas do dia a dia?"
        options={RECOVERY_QUALITY_OPTIONS}
        required
      />
    </section>
  );
}
