import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";

import { CONSENT_FLAGS } from "@/constants/precision12Questionnaire";

import { ConsentField } from "../fields/QuestionnaireFields";

/** Tela 8 — Consentimento (Bloco 11). Todos 4 obrigatoriamente true. */
export function Screen8Consent() {
  return (
    <section className="space-y-5">
      <header>
        <h2
          tabIndex={-1}
          className="text-sm font-semibold text-muted-foreground focus-visible:outline-none"
        >
          Confirmação e consentimento
        </h2>
      </header>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-sm">
          Para concluir, marque todas as declarações abaixo. Você só pode
          enviar o questionário com as quatro confirmações marcadas.
        </AlertDescription>
      </Alert>

      <div className="space-y-2">
        {CONSENT_FLAGS.map((flag) => (
          <ConsentField key={flag.code} name={flag.code} label={flag.label} />
        ))}
      </div>
    </section>
  );
}
