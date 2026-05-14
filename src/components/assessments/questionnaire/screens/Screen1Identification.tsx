import {
  GENDER_OPTIONS,
  ROUTINE_OPTIONS,
} from "@/constants/precision12Questionnaire";

import {
  RadioField,
  TextField,
} from "../fields/QuestionnaireFields";

/** Tela 1 — Identificação básica (Bloco 1 do PDF) */
export function Screen1Identification() {
  return (
    <section className="space-y-5">
      <header>
        <h2
          tabIndex={-1}
          className="text-sm font-semibold text-muted-foreground focus-visible:outline-none"
        >
          Identificação básica
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Esses dados servem pra confirmar seu cadastro e personalizar seu plano.
        </p>
      </header>

      <TextField
        name="full_name"
        label="Nome completo"
        autoComplete="name"
        maxLength={200}
        required
      />
      <TextField
        name="email"
        label="E-mail"
        type="email"
        inputMode="email"
        autoComplete="email"
        maxLength={200}
        required
      />
      <TextField
        name="phone"
        label="Telefone / WhatsApp"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        maxLength={50}
        required
      />
      <TextField
        name="birthdate"
        label="Data de nascimento"
        type="date"
        autoComplete="bday"
        description="Necessário pra calcular faixas de referência do programa."
      />
      <RadioField
        name="gender"
        label="Sexo biológico"
        options={GENDER_OPTIONS}
        required
      />
      <TextField
        name="profession"
        label="Profissão"
        maxLength={200}
      />
      <RadioField
        name="routine"
        label="Como é sua rotina principal hoje?"
        options={ROUTINE_OPTIONS}
        required
      />
    </section>
  );
}
