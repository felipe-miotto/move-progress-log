import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";

import { PARQ_QUESTIONS } from "@/constants/precision12Questionnaire";

import { BooleanField } from "../fields/QuestionnaireFields";

/**
 * Tela 2 — Triagem de segurança (PAR-Q).
 * 7 perguntas booleanas. Qualquer "Sim" sinaliza necessidade de revisão
 * médica — mas o aluno PODE completar o questionário até o fim
 * (soft block, decisão D3 PR #116).
 */
export function Screen2ParQ() {
  return (
    <section className="space-y-5">
      <header>
        <h2
          tabIndex={-1}
          className="text-sm font-semibold text-muted-foreground focus-visible:outline-none"
        >
          Triagem de segurança (PAR-Q)
        </h2>
      </header>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-sm">
          Responda com atenção. Se alguma resposta for <strong>Sim</strong>,
          recomendamos avaliação médica prévia. Você pode completar o
          questionário normalmente — o coach Fabrik vai revisar antes de
          liberar o programa.
        </AlertDescription>
      </Alert>

      <div className="space-y-4">
        {PARQ_QUESTIONS.map((q) => (
          <BooleanField key={q.code} name={q.code} label={q.label} required />
        ))}
      </div>
    </section>
  );
}
