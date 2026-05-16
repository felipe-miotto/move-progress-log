# Precision 12 — E5 melhorias fora do escopo do E5.6a (plano p/ Codex)

**Data:** 2026-05-16
**Autor:** Claude (auditoria do PR #150 + implementação do E5.6a / PR #151)
**Status:** plano fechado — pronto para discussão com Codex
**Pré-requisito:** PR #151 (E5.6a) já em prod

---

## 1. Contexto

A auditoria pós-merge do PR #150 (E5.5 — preview de evidências) identificou
**9 melhorias funcionais**. As 7 que cabiam dentro do escopo declarado do E5
(puro/UI/docs, zero query nova, zero mutation, zero migration/RPC/edge, zero
PDF) foram implementadas no PR #151 (E5.6a). As **2 restantes** esticam o
escopo e ficam aqui como plano deliberado para discussão com o Codex:

| ID | Título | Por que estica o escopo |
|----|--------|------------------------|
| **M-3** | Cobertura de `clinical_attention` no Evidence Layer | Adiciona claims NOVAS ao catálogo cobrindo medicação/condição/lesão/dor. Foundation E5.1 prevê ampliação, mas exige decisões de wording clínico e seleção de fontes. |
| **M-9** | Teste de render do `Precision12EvidencePreview` | Hoje toda a suite é source-based (`readFileSync`). Adicionar render test exige habilitar `jsdom` + `@testing-library/react` no vitest config, mudando a infra de teste. |

---

## 2. M-3 — Cobertura de `clinical_attention` no Evidence Layer

### 2.1 Estado atual

O Console emite o alerta `clinical_attention` na fila de ação quando o
`questionnaire_responses` tem qualquer um dos seguintes:

- `uses_medications === true`
- `has_medical_condition === true`
- `injury_surgery_history` ≠ null e não-vazio
- `pain_status` ≠ null e ≠ `"none"`

Microcopy atual do alerta (em `precision12CoachConsole.ts:319-321`):
> "Aluno reportou medicação / condição / lesão — checar antes de prescrever."

**Gap**: o Evidence Layer não tem nenhuma claim cobrindo esses sinais. O
coach vê o alerta na fila mas não vê interpretação clínico-operacional no
preview. O E5.6a documentou os 4 campos em `QUESTIONNAIRE_FIELDS_NOT_MAPPED_YET`
com referência explícita a "M-3 pendente".

### 2.2 Opções de design

#### Opção A — Novo domínio `clinical_history`

Adicionar 7º domínio ao `EvidenceDomain` (hoje são 6 declarados + 1
`sleep_stress_energy_adherence` = 7). Pros:
- Encapsula semanticamente um agrupamento clínico distinto.
- Permite disclaimers próprios ("triagem operacional; não substitui anamnese
  clínica") sem poluir o domínio PAR-Q.
- Faz contrapeso simétrico ao domínio adesão.

Contras:
- Exige novo entry em `EVIDENCE_DOMAIN_LABEL`, `EVIDENCE_DOMAIN_DISCLAIMER_KEYWORDS`,
  testes de cobertura.

#### Opção B — Estender `questionnaire_parq` para "questionnaire_clinical"

Renomear/ampliar o domínio existente. Pros: menos cerimônia de tipo.
Contras: misturar PAR-Q com histórico clínico arrisca confundir a microcopy
(PAR-Q é instrumento validado; histórico é autorrelato livre). **Não recomendado.**

#### Opção C — 4 claims independentes, cada uma no seu próprio sub-domínio

Granularidade máxima, mas explode o catálogo e dilui o conceito de "atenção
clínica integrada". **Não recomendado** sem demanda explícita.

**Recomendação**: **Opção A — novo domínio `clinical_history`**.

### 2.3 Claims a adicionar (Opção A)

Mínimo viável: **4 claims**, uma por sinal. Cada uma `actionable` (próximo passo
= revisar com profissional habilitado antes de prescrever). Texto associativo,
sem rotular doença.

| # | metric | classification | trigger | risk_level |
|---|--------|----------------|---------|------------|
| 1 | `uses_medications` | "Medicação em uso reportada" | `uses_medications === true` | `actionable` |
| 2 | `has_medical_condition` | "Condição clínica reportada" | `has_medical_condition === true` | `actionable` |
| 3 | `injury_surgery_history` | "Histórico de lesão/cirurgia reportado" | `injury_surgery_history` não-vazio | `actionable` |
| 4 | `pain_status` | "Dor autorrelatada (não 'nenhuma')" | `pain_status ∉ {null, "none"}` | `watchful` |

**Disclaimer comum**: "Histórico clínico autorrelatado é triagem operacional; **NÃO substitui anamnese profissional** nem laudo médico. Confirmar com o aluno e, quando aplicável, encaminhar antes de progressão de carga."

**`coachAction` padrão**: "Revisar com o aluno antes da próxima sessão; encaminhar a profissional habilitado quando houver dúvida sobre interação medicação-treino ou tolerância a esforço."

**Fontes sugeridas** (revisar com Codex/literatura):
- ACSM Position Stand on Exercise Preparticipation Screening (já no catálogo: `PARQ_ACSM_THOMPSON_2013`) — cobre conceito de triagem.
- Riebe D et al. 2015 — ACSM exercise preparticipation health screening recommendations: a scientific statement.
- Possivelmente: SBC/SBME diretrizes de avaliação pré-participação (literatura BR).

### 2.4 Mudanças necessárias

#### a) `src/utils/precision12Evidence.ts`
- Adicionar `"clinical_history"` ao tipo `EvidenceDomain` + array `EVIDENCE_DOMAINS`.
- Adicionar entry em `EVIDENCE_DOMAIN_LABEL`: `clinical_history: "Histórico clínico autorrelatado"`.
- Adicionar entry em `EVIDENCE_DOMAIN_DISCLAIMER_KEYWORDS`: `clinical_history: ["triagem", "não substitui"]` (mesmo padrão de PAR-Q).
- Adicionar as 4 claims no `EVIDENCE_CATALOG`.
- Adicionar fontes novas ao `EVIDENCE_SOURCE_CATALOG` (`RIEBE_ACSM_2015` etc.).

#### b) `src/utils/precision12EvidenceDerivation.ts`
- Estender `Precision12EvidenceInput` com `clinicalHistory?: { usesMedications?, hasMedicalCondition?, injurySurgery?, painStatus? }`.
- Novo `deriveClinicalHistoryEvidenceClaims(input)`.
- Adicionar à ordem canônica em `deriveEvidenceClaims` (sugestão: entre DEXA e PAR-Q ou após PAR-Q).

#### c) `src/utils/precision12EvidenceMapping.ts`
- Estender `mapQuestionnaireResponseToEvidenceInput` para preencher `clinicalHistory` a partir dos 4 campos da response.
- **Remover** os 3 campos correspondentes de `QUESTIONNAIRE_FIELDS_NOT_MAPPED_YET` (`uses_medications`, `has_medical_condition`, `injury_surgery_history`). `pain_status` continua lá com nova nota: "Cobertura clinical_history adicionada em E5.7; ainda contribui ao agregado de adesão (M-1)".

#### d) Testes
- Em `precision12Evidence.test.ts`: expandir testes de cobertura por domínio para incluir `clinical_history`. As 4 claims devem passar pelo `validateEvidenceClaim` (princípios + termos proibidos + disclaimer keywords).
- Em `precision12EvidenceDerivation.test.ts`: 4 testes de trigger isolado + 1 teste de combinação.
- Em `precision12EvidenceMapping.test.ts`: 1 teste por campo + 1 teste de integração (`response com medicação=true` gera claim correta).
- Em `Precision12EvidencePreview.deriveGroups.test.ts`: 1 teste end-to-end (aluno com medicação aparece com a claim na ordem certa).
- Em `EvidenceClaimCard.coverage.test.ts`: source-based — `clinical_history` aparece em EVIDENCE_DOMAINS, etc.

### 2.5 Decisões abertas pra Codex

1. **Wording exato**: o coach final é o Alex; texto precisa de revisão clínica/microcopy.
2. **`pain_status` granular?** Hoje: 1 claim `watchful` quando ≠ `none`. Alternativa: 2 claims separadas pelos códigos reais do enum (`PAIN_STATUS_OPTIONS` em `src/constants/precision12Questionnaire.ts`): `during_training` → `watchful` (dor só ao treinar — modificável com ajuste de carga) e `daily` → `actionable` (dor no dia a dia — requer revisão clínica antes de progressão). Decisão de produto.
3. **`injury_surgery_history` vazio vs whitespace**: já tratamos com `.trim()`. Confirmar mesma semântica.
4. **Ordem no orquestrador**: depois de DEXA? Antes de PAR-Q? Sugestão: **antes de PAR-Q** (porque PAR-Q é o "filtro mais forte" — vem por último, com `actionable` no topo após o sort por severidade).
5. **Disclaimers BR vs internacionais**: usar fonte BR (CFM/CFEF/SBME) só se Codex confirmar relevância clínica direta.

### 2.6 Estimativa

- **Esforço**: ~6-8h (catálogo + derivação + mapping + 15-20 testes + revisão de wording).
- **PR único**: sim. Não dá pra fragmentar sem deixar estado inconsistente.

### 2.7 Riscos

- **Falsos positivos** se trigger for sensível demais (ex.: aluno tomando vitamina D conta como `uses_medications`?). Mitigação: a microcopy é associativa e o coach valida com o aluno antes de agir.
- **Ruído visual**: aluno com 4 sinais positivos pode ver 4 claims `actionable` no preview. Mitigação: sort por severidade (M-5 já implementado) coloca tudo no topo; coach decide se age.

---

## 3. M-9 — Render test do `Precision12EvidencePreview`

### 3.1 Estado atual da infra de testes

- `vitest` configurado **sem `jsdom`** — `package.json` não lista `jsdom` nem `@testing-library/*`.
- Cobertura de componente é feita via **source-based tests** (`readFileSync` + regex/`.toContain`), padrão consolidado em `EvidenceClaimCard.coverage.test.ts`, `Precision12Console.coverage.test.ts`, etc.
- Vantagem do source-based: rápido (sem JSDOM boot), determinístico, sem necessidade de mock de hooks.
- Limitação: não pega bugs de comportamento (props mal-propagadas, estado interno, eventos).

### 3.2 Lacuna funcional

Os 15 testes do `Precision12EvidencePreview.deriveGroups.test.ts` cobrem
a função pura `deriveEvidenceGroups` (que vive em `precision12EvidenceMapping.ts`).
**Nenhum teste exercita o componente renderizado**. Riscos não cobertos hoje:

- Props mal-propagadas (ex.: `showPrinciples` chega ao card).
- `useMemo` correto (mudança de prop reordena grupos como esperado).
- `<details>` realmente renderiza as duas sublistas (hoje só checamos via source).
- Microcopy "Cobertura atual:" aparece como escrito.
- Empty state renderiza `<EvidenceClaimList claims={[]} />`.

### 3.3 Opções de design

#### Opção A — Habilitar jsdom + Testing Library no vitest

- Adicionar `jsdom`, `@testing-library/react`, `@testing-library/jest-dom` ao `devDependencies`.
- Atualizar `vitest.config.ts` (ou `vite.config.ts`): `test: { environment: 'jsdom', setupFiles: [...] }`.
- Setup file para `@testing-library/jest-dom` matchers.
- Escrever **5-7 testes de render** focados no `Precision12EvidencePreview`.

**Pros**: cobertura real de comportamento, padrão de mercado, abre porta para futuros componentes.
**Contras**: aumenta tempo de teste (jsdom boot ~200ms), adiciona dependências, infra nova para manter.

#### Opção B — Manter source-based + expandir asserções

Adicionar mais `previewSource.toContain(...)` e regex específicos pra cobrir
o que falta. Pros: sem mudança de infra. Contras: não cobre comportamento, só
estrutura — bugs reais (ex.: prop não chega ao child) passam.

#### Opção C — Snapshot test apenas (mínimo viável)

Compromisso: usar jsdom + Testing Library só pra renderizar o componente
com um mock de dados e snapshot o HTML. **Não recomendado** isolado (snapshots
quebram com qualquer mudança trivial; alto custo de manutenção, baixo retorno).

**Recomendação**: **Opção A** se o time topa pagar o custo de infra; senão **Opção B** como remediação temporária.

### 3.4 Plano detalhado para Opção A

#### a) Dependências
```json
"devDependencies": {
  "@testing-library/react": "^16.x",
  "@testing-library/jest-dom": "^6.x",
  "jsdom": "^25.x"
}
```

#### b) Config (`vite.config.ts` ou `vitest.config.ts`)
```ts
test: {
  environment: 'jsdom',
  setupFiles: ['./src/test/setup.ts'],
  globals: true,
}
```

`src/test/setup.ts`:
```ts
import '@testing-library/jest-dom/vitest';
```

#### c) Novo teste: `Precision12EvidencePreview.render.test.tsx`

Cobertura mínima (5-7 testes):

1. **Smoke**: renderiza com props vazias → mostra empty state + `<details>` de limitações.
2. **1 grupo com claim**: renderiza card com classification correta.
3. **Múltiplos grupos**: renderiza N seções, cada uma com `aria-label="Evidências de <nome>"`.
4. **Ordem M-4 + M-5**: 2 alunos + claims de severidades mistas → asserta ordem alfabética dos grupos + ordem por severidade dentro do grupo.
5. **Dedup M-6**: 2 responses idênticas do mesmo aluno → 1 card só.
6. **`<details>` expandível**: clica no summary → ambas as sublistas aparecem (`evidence-preview-limitations-domains` + `evidence-preview-limitations-fields`).
7. **`showPrinciples=true`** (opcional): asserta que bloco de debug aparece nos cards.

#### d) Estimativa
- **Esforço**: ~3-4h (infra + 5-7 testes + ajuste de scripts).
- **PR único**: sim.

### 3.5 Riscos

- **CI**: tempo de teste sobe. Vitest com 35 arquivos hoje roda em ~800ms. JSDOM adiciona ~200-500ms de boot por arquivo que usa. Aceitável.
- **Estabilidade**: Testing Library exige queries semânticas (role/label) — força componente a ter boa acessibilidade. Já temos `aria-label`, `data-testid`, etc., então baixo atrito.
- **Manutenção**: padrão novo no repo. Documentar em `docs/TESTING_GUIDE.md` para evitar drift.

### 3.6 Decisões abertas pra Codex

1. **Aceitar a mudança de infra** (Opção A)? Ou ficar em source-based (Opção B)?
2. **Onde colocar `setup.ts`**? Sugestão: `src/test/setup.ts` (padrão Vitest).
3. **Escopo do PR**: M-9 sozinho ou empacotar com M-3 (que também precisaria de testes de render se A for adotado)?
4. **Naming**: `*.render.test.tsx` vs `*.test.tsx`? Manter sufixo `.coverage.test.ts` para source-based?

---

## 4. Sequência sugerida

```
PR #151 (E5.6a) ──merge──┐
                         ▼
                    PR M-3 (clinical_history)   ←─ cobertura clínica
                         │
                         ▼
                    PR M-9 (jsdom + render)     ←─ infra de teste
                         │
                         ▼
                    PR E5.7 (relatório de fechamento E5)
```

**Por quê M-3 antes de M-9?** Porque M-3 cobre lacuna semântica visível ao
coach (preview perde sinal que a fila mostra). M-9 é qualidade interna —
não muda comportamento. Se priorizar coach > infra, M-3 vai primeiro.

**Alternativa**: M-9 antes de M-3, para que os testes de render do M-3
possam usar a infra nova desde o nascimento. Decisão do Alex/Codex.

---

## 5. Critérios de "done" (checklist)

### Para M-3:
- [ ] Novo domínio `clinical_history` no `EvidenceDomain` + `EVIDENCE_DOMAINS`.
- [ ] 4 claims novas no `EVIDENCE_CATALOG`, todas com `validateEvidenceClaim` OK.
- [ ] Mappers extraem campos do `CoachConsoleQuestionnaire` para `Precision12EvidenceInput.clinicalHistory`.
- [ ] `QUESTIONNAIRE_FIELDS_NOT_MAPPED_YET` reduzido (3 campos saem, `pain_status` ganha nota nova).
- [ ] 15-20 novos testes (puros + integração + cobertura source-based).
- [ ] Lint + tsc + testes + build + essential gates PASS.
- [ ] Smoke visual em prod: aluno teste com medicação mostra a claim no preview, no topo (após sort M-5).
- [ ] Wording revisado com critério clínico (não diagnóstico, associativo, modificável).

### Para M-9:
- [ ] `jsdom` + `@testing-library/react` + `@testing-library/jest-dom` em `devDependencies`.
- [ ] Config vitest atualizada com `environment: 'jsdom'` + setup file.
- [ ] 5-7 testes de render do `Precision12EvidencePreview` passando.
- [ ] `docs/TESTING_GUIDE.md` atualizado com padrão dual: source-based vs render.
- [ ] Tempo total de teste ainda < 3s em CI.

---

## 6. Anexos

### 6.1 Referências cruzadas no código

- `src/utils/precision12CoachConsole.ts:295-322` — `deriveQuestionnaireAlerts` emite `clinical_attention`
- `src/utils/precision12EvidenceMapping.ts:296-340` — `QUESTIONNAIRE_FIELDS_NOT_MAPPED_YET` (a remover entries em M-3)
- `src/utils/precision12Evidence.ts:44-62` — `EvidenceDomain` + `EVIDENCE_DOMAINS`
- `src/components/precision12/evidence/Precision12EvidencePreview.tsx` — alvo do M-9
- `package.json` — alvo de M-9 (deps + scripts)
- `vite.config.ts` — alvo de M-9 (test config)

### 6.2 Por que essas 2 não entraram no E5.6a

Citação literal da auditoria que motivou esse plano:

> "M-3 adiciona cobertura clínica nova (legítimo mas é decisão sua de escopo). M-9 pode exigir infra de teste nova (jsdom). Os 7 demais ficam estritamente dentro do plano E5 (funções puras + UI + docs, zero query nova, zero mutation). A hook E4.1 não precisa ser tocado em nenhum dos 9."

Alex optou por implementar os 7 dentro do escopo (PR #151) e reservar M-3 + M-9 para discussão com Codex — este documento.
