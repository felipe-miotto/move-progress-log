export const TRAINING_METHODS = {
  TRADICIONAL: {
    name: "Tradicional",
    indication: "Hipertrofia e força geral",
    description: "Método clássico com séries e repetições definidas, pausas completas entre séries. Ideal para desenvolvimento muscular consistente e controle de volume."
  },
  CIRCUITO: {
    name: "Circuito",
    indication: "Condicionamento e eficiência temporal",
    description: "Execução sequencial de exercícios com mínimo ou nenhum intervalo entre eles. Eleva frequência cardíaca, otimiza tempo e melhora resistência muscular."
  },
  SUPERSET: {
    name: "Superset",
    indication: "Intensidade e eficiência",
    description: "Dois exercícios executados consecutivamente sem pausa. Pode ser agonista-antagonista (ex: bíceps-tríceps) ou para grupos musculares distintos, aumentando densidade do treino."
  },
  TRISET: {
    name: "Triset",
    indication: "Volume elevado e fadiga muscular",
    description: "Três exercícios consecutivos sem pausa. Similar ao superset mas com maior volume, ideal para hipertrofia e condicionamento muscular localizado."
  },
  DROPSET: {
    name: "Drop-set",
    indication: "Hipertrofia e falha muscular controlada",
    description: "Executar série até próximo da falha, reduzir carga imediatamente e continuar sem pausa. Maximiza recrutamento de fibras e stress metabólico."
  },
  PIRAMIDE_CRESCENTE: {
    name: "Pirâmide Crescente",
    indication: "Preparação neuromuscular e força",
    description: "Aumento progressivo de carga com redução de repetições. Permite aquecimento específico e preparação para cargas máximas de forma segura."
  },
  PIRAMIDE_DECRESCENTE: {
    name: "Pirâmide Decrescente",
    indication: "Volume com cargas elevadas",
    description: "Inicia com carga máxima e repetições baixas, reduz carga e aumenta reps. Prioriza intensidade inicial com volume subsequente."
  },
  REST_PAUSE: {
    name: "Rest-Pause",
    indication: "Força e hipertrofia avançada",
    description: "Série até próximo da falha, pausa breve (10-20s), repetições adicionais. Estende tempo sob tensão e recruta unidades motoras adicionais."
  },
  CLUSTER: {
    name: "Cluster",
    indication: "Potência e força com volume",
    description: "Micro-pausas (15-30s) entre pequenos grupos de reps (ex: 2-3). Mantém qualidade de movimento e velocidade mesmo com volume elevado."
  },
  AMRAP: {
    name: "AMRAP",
    indication: "Resistência muscular e mental",
    description: "As Many Reps As Possible (AMRAP) — máximo de repetições em tempo determinado ou com carga específica. Desenvolve capacidade de trabalho e tolerância à fadiga."
  },
  EMOM: {
    name: "EMOM",
    indication: "Condicionamento e consistência",
    description: "Every Minute On the Minute (EMOM) — executar o trabalho definido a cada minuto cheio. O tempo restante do minuto é descanso. Treina gestão de fadiga e ritmo de trabalho."
  },
  E2MOM: {
    name: "E2MOM",
    indication: "Volume com recuperação controlada",
    description: "Every 2 Minutes On the Minute (E2MOM) — executar o trabalho definido a cada 2 minutos. Permite maior volume ou intensidade com recuperação adequada entre rodadas."
  },
  E3MOM: {
    name: "E3MOM",
    indication: "Força e potência com recuperação completa",
    description: "Every 3 Minutes On the Minute (E3MOM) — executar o trabalho definido a cada 3 minutos. Ideal para trabalhos de força e potência que exigem recuperação mais longa."
  },
  FOR_TIME: {
    name: "For Time",
    indication: "Condicionamento metabólico",
    description: "Completar volume total de trabalho no menor tempo possível. Desenvolvem capacidade anaeróbica e tolerância ao lactato."
  },
  CONTRASTE: {
    name: "Contraste",
    indication: "Potência e explosão",
    description: "Alterna exercício de força com exercício explosivo (ex: agachamento pesado + salto). Potencializa ativação neuromuscular (PAP — Potencialização Pós-Ativação)."
  },
  PRE_EXAUSTAO: {
    name: "Pré-Exaustão",
    indication: "Hipertrofia de grupos específicos",
    description: "Exercício isolado seguido de multiarticular para mesmo grupo. Pré-fadiga músculos estabilizadores para maior ênfase no alvo principal."
  },
  POS_EXAUSTAO: {
    name: "Pós-Exaustão",
    indication: "Finalização e stress metabólico",
    description: "Multiarticular seguido de isolado. Permite trabalhar com cargas elevadas no composto e finalizar com isolamento até fadiga completa."
  }
} as const;

export type TrainingMethodKey = keyof typeof TRAINING_METHODS;
