# Precision 12 — E3 (Questionário): Relatório de Conclusão

**Status:** ✅ GO pleno — ciclo operacional do Questionário Precision 12 validado end-to-end no app publicado.
**Data:** 2026-05-14

---

## PRs envolvidos (#124 → #133)

| PR | Etapa | Título | Estado |
|----|-------|--------|--------|
| #124 | E3.1 | docs: freeze da spec do Questionário Precision 12 v1 | merged |
| #125 | E3.2 | feat: 6 campos novos em `questionnaire_responses` | **OPEN** ⚠️ |
| #126 | E3.3 | feat: constants + validação Zod do Questionário v1 | merged |
| #127 | E3.4 | feat: infraestrutura de link mágico (edge functions, token hash) | merged |
| #128 | E3.4.2 | fix: reaplica 3 fixes perdidos do audit do PR #127 | merged |
| #129 | E3.5 | feat: submit do Questionário via RPC transacional | merged |
| #130 | E3.5 | fix: reconcile dos runtime patches do submit | merged |
| #131 | E3.6 | feat: página pública do questionário (8 telas) | merged |
| #132 | E3.7 | feat: geração de link no wizard do coach | merged |
| #133 | E3.7.1 | fix: reissue revoga o link anterior | merged |

> ⚠️ **PR #125 (E3.2) segue aberto.** O fluxo completo passou no smoke mesmo assim (submit, persistência e drawer funcionam), então os campos da E3.2 foram cobertos por outra via ou não são bloqueantes. Decidir: fechar, mesclar ou abandonar #125.

---

## Funcionalidades entregues

- **Spec v1 congelada** do Questionário Precision 12 (E3.1).
- **Validação Zod** das respostas + constants do questionário v1 (E3.3).
- **Link mágico**: edge functions `create-`, `validate-` e `submit-precision12-questionnaire-link`; token aleatório forte, apenas SHA-256 persistido (token puro nunca vai ao banco) (E3.4).
- **Submit transacional** via RPC Postgres `submit_precision12_questionnaire_response` (E3.5).
- **Página pública** `/precision-questionnaire/:token` — 8 telas, mobile-first, PAR-Q soft block (E3.6).
- **Wizard do coach**: `QuestionnaireLinkPanel` gera/copia/abre link, estados idle/generating/generated/error, reissue com `window.confirm` (E3.7).
- **Reissue correto**: painel envia `assessment_id` na reemissão → edge reusa o assessment e revoga o link anterior (E3.7.1).

---

## Smokes executados

### Smoke E3.7 — visual/runtime (app publicado)
5 etapas: bundle novo, geração de link, link público, fluxo `completed`, fluxo `blocked`, reissue.
**Resultado:** 4/5 etapas limpas. Etapa 5 (reissue) revelou um bug — ver abaixo.
Rede: `validate` e `submit` retornaram 200 em todas as execuções; sem CORS, sem 5xx.

### Smoke E3.7.1 — reissue (app publicado, pós-fix)
**Resultado:** ✅ todos os passos passaram.
- Geração inicial sobe contagem de assessments +1.
- "Gerar novo link" → `window.confirm` com texto exato; **Cancelar** mantém o link.
- **Confirmar** gera link novo e **NÃO** cria assessment órfão (contagem estável).
- Link antigo passa a retornar **"Link inválido"**; link novo abre na Tela 1.
- `validate` 200, zero falhas de rede.

---

## Bugs encontrados e corrigidos

| Bug | Onde | Correção |
|-----|------|----------|
| CORS allow-list incompleta nas edge functions | E3.6 (PR #131) | Allow-list alinhada nas 3 edge functions (`authorization, x-client-info, apikey, content-type, x-supabase-client-*`) |
| RPC do submit incluía coluna gerada `parq_blocked` no INSERT | E3.5 (PR #130) | `jsonb_populate_record` + INSERT com lista explícita de colunas |
| 3 fixes do audit do PR #127 perdidos no sync | E3.4 (PR #128) | Fixes reaplicados |
| **Reissue não revogava o link anterior** — painel nunca enviava `assessment_id`, então a edge criava um assessment órfão a cada "Gerar novo link" e o link antigo seguia válido | E3.7 → corrigido em E3.7.1 (PR #133) | `QuestionnaireLinkPanel` captura `state.assessmentId` no reissue e o envia no body; edge reusa o assessment e revoga o link ativo |

> Observação de processo: durante o smoke E3.7 o bundle publicado no Lovable estava defasado (pré-PR #132). Resolvido com **Publish → Update** manual no Lovable. Confirmar a republicação no Lovable após cada merge antes de smoke.

---

## Estado final do fluxo

```
coach gera link → aluno responde → completed/blocked → drawer mostra respostas → reissue revoga link anterior
```

Todas as transições validadas no app publicado:
- Coach abre wizard → "Questionário Precision 12" (clicável, sem badge legada) → `QuestionnaireLinkPanel` → "Gerar link".
- Assessment criado com status `in_progress`, aparece na aba Avaliações.
- Aluno responde as 8 telas na página pública.
- PAR-Q tudo "Não" → `completed`; ao menos um "Sim" → `blocked` (decisão server-side).
- Drawer read-only do coach mostra todas as respostas (campos mapeados + payload JSON completo), incluindo `PAR-Q bloqueado: Sim/Não`.
- Reissue: `window.confirm` → confirma → link novo, link anterior revogado, sem assessment órfão.

---

## Dados de teste ainda existentes

Criados nos smokes no aluno **Alex Griebeler** (`2b6c306b-10d7-4a4a-928a-76396bae9f3d`), todos datados **14/05/2026**, tipo Anamnese:

| Origem | Status | ID |
|--------|--------|----|
| Smoke E3.7 — Etapa 3 | `completed` | `5ac13136-6276-46ce-beae-03df94334ff3` |
| Smoke E3.7 — Etapa 4 | `blocked` | `27bafc73-799b-4f42-af60-df216003398d` |
| Smoke E3.7 — bug do reissue | `in_progress` (órfão) | 2 assessments — IDs não capturados |
| Smoke E3.7.1 — reissue | `in_progress` | 1 assessment — ID não capturado |

**Recomendação de cleanup (não executar agora):** remover os 5 assessments de teste do dia 14/05/2026 no aluno Alex — em especial os 3 `in_progress` que nunca serão respondidos (2 órfãos do bug + 1 do smoke E3.7.1). Os legados de 13/05 (2 `Em andamento`, 1 `Completa`, 1 `Abortada`) são de sessões anteriores; revisar à parte. Sugestão: deletar via SQL filtrando `student_id` + `assessment_type = 'questionnaire_precision12'` + `assessment_date = '2026-05-14'`, validando a lista antes de apagar.

---

## GO para E4

✅ **GO.** O Questionário Precision 12 está operacional de ponta a ponta. Pendências não bloqueantes para E4:
1. Resolver PR #125 (E3.2) — fechar/mesclar/abandonar.
2. Executar o cleanup dos dados de teste no aluno Alex.
