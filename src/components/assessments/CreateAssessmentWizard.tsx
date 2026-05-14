/**
 * Wizard de criação de avaliação Precision 12.
 *
 * 2 passos:
 *   1. Coach escolhe o tipo de avaliação (grupos por categoria:
 *      VO₂ / Força / Composição / Funcional / Anamnese)
 *   2. Renderiza o form específico do tipo escolhido
 *
 * `questionnaire_precision12` (Anamnese) NÃO abre form local — abre
 * `QuestionnaireLinkPanel` que gera link mágico via edge function
 * `create-precision12-questionnaire-link`. O aluno responde em
 * `/precision-questionnaire/:token` (página pública, E3.6).
 *
 * O wizard não monta TODOS os forms na árvore — só renderiza o
 * selecionado (lazy via switch). Isso evita resetar inputs ao mudar
 * de tipo (cada Form tem state isolado).
 */

import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

import { ASSESSMENT_TYPE_METADATA } from "@/constants/assessmentProtocols";
import { ASSESSMENT_TYPES, type AssessmentType } from "@/types/assessment";

import { DexaForm } from "./DexaForm";
import { HandgripForm } from "./HandgripForm";
import { SitToStandForm } from "./SitToStandForm";
import { Vo2BikeForm } from "./Vo2BikeForm";
import { Vo2TreadmillForm } from "./Vo2TreadmillForm";
import { QuestionnaireLinkPanel } from "./questionnaire/QuestionnaireLinkPanel";

// ────────────────────────────────────────────────────────────────────────────

interface CreateAssessmentWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  defaults?: {
    age_years?: number | null;
    weight_kg?: number | null;
    height_cm?: number | null;
    sex?: "M" | "F" | null;
  };
  onCreated?: (assessmentId: string) => void;
}

// Agrupa os 9 tipos por categoria pra UI
const TYPES_BY_CATEGORY = ASSESSMENT_TYPES.reduce<
  Record<string, AssessmentType[]>
>((acc, type) => {
  const cat = ASSESSMENT_TYPE_METADATA[type].category;
  acc[cat] ??= [];
  acc[cat].push(type);
  return acc;
}, {});

const CATEGORY_ORDER = ["VO₂", "Força", "Composição", "Funcional", "Anamnese"];

// ────────────────────────────────────────────────────────────────────────────

export const CreateAssessmentWizard = ({
  open,
  onOpenChange,
  studentId,
  defaults,
  onCreated,
}: CreateAssessmentWizardProps) => {
  const [selectedType, setSelectedType] = useState<AssessmentType | null>(null);

  const handleClose = (next: boolean) => {
    if (!next) setSelectedType(null);
    onOpenChange(next);
  };

  const handleCreated = (id: string) => {
    setSelectedType(null);
    onCreated?.(id);
  };

  // Step 2 — form específico
  if (selectedType) {
    const commonProps = {
      open: true,
      onOpenChange: handleClose,
      studentId,
      defaults,
      onCreated: handleCreated,
    };

    switch (selectedType) {
      case "vo2_bike_max":
        return <Vo2BikeForm {...commonProps} modality="vo2_bike_max" />;
      case "vo2_bike_submax":
        return <Vo2BikeForm {...commonProps} modality="vo2_bike_submax" />;
      case "vo2_treadmill_walk_submax":
        return <Vo2TreadmillForm {...commonProps} modality="treadmill_walk_submax" />;
      case "vo2_treadmill_run_submax":
        return <Vo2TreadmillForm {...commonProps} modality="treadmill_run_submax" />;
      case "vo2_treadmill_run_max":
        return <Vo2TreadmillForm {...commonProps} modality="treadmill_run_max" />;
      case "handgrip":
        return <HandgripForm {...commonProps} />;
      case "dexa":
        return <DexaForm {...commonProps} />;
      case "sit_to_stand":
        return <SitToStandForm {...commonProps} />;
      case "questionnaire_precision12":
        // Não usa Form local — abre QuestionnaireLinkPanel que gera link
        // mágico via edge function. Aluno responde em /precision-questionnaire/:token.
        // IMPORTANTE: NÃO usar handleCreated aqui — fecharia o painel antes do
        // coach conseguir copiar/visualizar o link. Apenas notifica o parent
        // (invalida queries) e mantém o painel aberto até o coach fechar.
        return (
          <QuestionnaireLinkPanel
            open
            onOpenChange={handleClose}
            studentId={studentId}
            onCreated={(id) => onCreated?.(id)}
          />
        );
    }
  }

  // Step 1 — seleção do tipo
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova avaliação</DialogTitle>
          <DialogDescription>
            Escolha o tipo de avaliação a registrar. O sistema vai abrir
            o formulário apropriado em seguida.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {CATEGORY_ORDER.map((category) => {
            const types = TYPES_BY_CATEGORY[category] ?? [];
            if (types.length === 0) return null;

            return (
              <section key={category} className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {category}
                </h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {types.map((type) => {
                    const meta = ASSESSMENT_TYPE_METADATA[type];
                    return (
                      <Button
                        key={type}
                        type="button"
                        variant="outline"
                        onClick={() => setSelectedType(type)}
                        className="h-auto flex-col items-start gap-1 px-3 py-2 text-left whitespace-normal"
                        aria-label={`Iniciar ${meta.label}`}
                      >
                        <span className="font-semibold text-sm">{meta.label}</span>
                        <p className="text-xs text-muted-foreground">{meta.short}</p>
                      </Button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
};
