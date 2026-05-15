# Precision 12 - Relatorio E4.4 (reissue UI controlada)

Data: 2026-05-15
Branch / SHA na elaboracao: `main` @ `ec7226d`
Status: **E4.4 entregue, publicado e validado em producao.**

---

## 1. Resumo executivo

A etapa **E4.4** introduziu a primeira mutacao controlada dentro do Coach
Console Precision 12: a reemissao de link do Questionario Precision 12 para
avaliacoes pendentes.

O fluxo foi implementado de forma restrita:

- aparece apenas para itens elegiveis da fila (`questionnaire_pending`,
  `in_progress`, com `assessmentId`);
- exige confirmacao explicita antes de chamar o backend;
- reutiliza a edge function existente `create-precision12-questionnaire-link`;
- nao cria migration, RPC ou edge function nova;
- nao faz escrita direta em tabelas via client;
- nao persiste token/link em storage nem loga no console;
- mostra o link gerado apenas no dialog de reemissao.

Smoke visual em producao validou o fluxo completo: cancelar nao chama a edge,
confirmar gera novo link, o link anterior passa a ser invalido e o novo link
abre o questionario publico.

---

## 2. PR / SHA

| Etapa | PR | Commit em `main` |
|---|---|---|
| Fix pre-E4.1: bloquear reissue de `blocked` na edge | [#136](https://github.com/Alex-Griebeler/move-progress-log/pull/136) | `fec8e78` |
| E4.4: UI controlada de reemissao | [#142](https://github.com/Alex-Griebeler/move-progress-log/pull/142) | `ec7226d` |

Repositorio: https://github.com/Alex-Griebeler/move-progress-log

---

## 3. Funcionalidade entregue

### Elegibilidade

A acao **Reemitir link** aparece somente quando o item da fila atende a todos
os criterios:

- `alertType === 'questionnaire_pending'`;
- `assessmentType === 'questionnaire_precision12'`;
- `status === 'in_progress'`;
- `assessmentId` presente.

Casos explicitamente inelegiveis:

- `blocked` / PAR-Q bloqueado;
- `completed`;
- `aborted`;
- itens sem `assessmentId`;
- outros tipos de alerta da fila.

### Dialog de reemissao

O dialog novo (`Precision12ReissueLinkDialog`) tem quatro estados:

1. **confirming** - mostra a confirmacao: "Gerar um novo link revoga o
   anterior. Deseja continuar?".
2. **generating** - mostra loading e bloqueia fechamento/duplo clique enquanto
   a edge esta processando.
3. **generated** - mostra o novo link em input read-only, expiracao, botao
   Copiar e Abrir em nova aba.
4. **error** - mostra mensagem legivel e permite tentar novamente.

### Backend chamado

A unica mutacao permitida pelo E4.4 e a chamada:

```ts
supabase.functions.invoke('create-precision12-questionnaire-link', {
  body: {
    student_id,
    assessment_id,
    frontend_origin: window.location.origin,
  },
});
```

O cliente nao chama `insert`, `update`, `delete`, `upsert` ou `rpc`.

### Cache/refetch

Apos sucesso, o dialog invalida/refaz as leituras relevantes:

- `['precision12', 'coach-console']`;
- `['assessments', 'by-student', studentId]`;
- `['student', studentId]`.

Objetivo: atualizar a fila/console e manter a aba do aluno consistente depois
da reemissao.

---

## 4. Evidencia do smoke em producao

Smoke executado no app publicado apos Publish/Update do Lovable.

### Bundle publicado

| Etapa anterior | Bundle |
|---|---|
| E4.3b | `CoachConsole-BYOcU1pP.js` |
| E4.4 | `CoachConsole-C8jbOHeE.js` |

Bundle E4.4 confirmado em producao.

### Elegibilidade visual

| Linha | Alerta | Status | Botao "Reemitir link" |
|---|---|---|---|
| Alex Griebeler #1 | Questionario pendente | Em andamento | aparece |
| Alex Griebeler #2 | Questionario pendente | Em andamento | aparece |
| SMOKE E3.6 Precision12 Blocked | PAR-Q bloqueado | Bloqueada | nao aparece |
| Tabela de progresso | sem alertType | n/a | nao aparece |

### Cancelar

- Clicar **Reemitir link** abre o dialog de confirmacao.
- Clicar **Cancelar** fecha o dialog.
- Network: zero POST para `create-precision12-questionnaire-link`.

Resultado: **cancelamento nao muta nada**.

### Confirmar - link A

- Clicar **Gerar novo link** mostra loading.
- Edge function retorna 200.
- Dialog mostra:
  - banner "Novo link ativo. O link anterior foi revogado.";
  - expiracao em 22 de maio de 2026 as 10:47;
  - input read-only com URL completa;
  - botoes Copiar link / Abrir em nova aba / Fechar.
- Token A capturado no smoke:
  `h1TKnh9DiaRei1EB3rMts5GglWIsa-aZKp3gVtc_2OQ`.

### Copiar

- Botao **Copiar link** acionou `navigator.clipboard.writeText`.
- Toast "Link copiado" apareceu.

### Confirmar novamente - link B

- Segunda reemissao gerou token diferente:
  `LSDWx-bcSOy8_544FCJWUI-T9fU06UAWuD_WQ_1laek`.
- Expiracao em 22 de maio de 2026 as 10:50.
- Network: duas chamadas totais a edge, uma por reemissao, ambas 200.

### Revogacao validada

| Link | Resultado |
|---|---|
| Link A | public route mostra "Link invalido - Link invalido ou expirado" |
| Link B | public route abre "Tela 1 de 8 - Identificacao" |

Conclusao: a edge revogou o link anterior e manteve o link novo ativo.

---

## 5. Console / network / storage

### Console

- Sem erros ou exceptions do app Fabrik.
- Sem `console.log(token)`.
- Sem `console.log(invite_url)`.

### Network

Durante o smoke completo:

| Item | Resultado |
|---|---|
| POST `/functions/v1/create-precision12-questionnaire-link` | 2 chamadas, ambas 200 |
| REST `/rest/v1/*` | somente GETs de refetch/cache |
| PATCH / PUT / DELETE em REST | 0 |
| Recursos com status >= 400 | 0 |
| POST `/~api/analytics` | 1 chamada Lovable, fora do dado de aplicacao |

### Storage

| Storage | Resultado |
|---|---|
| `localStorage` | nenhuma chave com token/link/invite URL |
| `sessionStorage` | vazio; nenhuma chave com token/link/invite URL |

---

## 6. Garantias de escopo

| Restricao | Status |
|---|---|
| Zero migration | confirmado |
| Zero RPC | confirmado |
| Zero edge function nova | confirmado |
| Zero alteracao em edge function existente | confirmado |
| Zero escrita direta em tabela via client | confirmado |
| Unica mutacao | edge function existente `create-precision12-questionnaire-link` |
| Sem dependencia nova | confirmado |
| Sem token/link em storage | confirmado |
| Sem token/link em console | confirmado |
| E4.5 | nao iniciado |
| DEXA #4 | nao iniciado |

---

## 7. Ponto operacional aberto: link ativo de teste

O smoke E4.4 gerou dois links para um assessment pendente do Alex. O primeiro
foi revogado pela segunda reemissao. O segundo ficou ativo:

```text
/precision-questionnaire/LSDWx-bcSOy8_544FCJWUI-T9fU06UAWuD_WQ_1laek
```

Isso e esperado pelo teste, mas implica que ha um link publico valido ate a
expiracao configurada pela edge function.

Opcoes:

1. **Manter como esta** ate expirar naturalmente.
2. **Reemitir outro link quando for usar de verdade**, invalidando este.
3. **Criar futura UI de revogacao manual** se a operacao exigir cancelar links
   sem emitir um novo.

Nao foi feita nenhuma revogacao manual nesta etapa.

---

## 8. Riscos / decisoes pendentes

### Revogacao avulsa ainda nao existe

Hoje a revogacao acontece por reemissao. Se o coach precisar cancelar um link
sem gerar outro, sera necessaria uma acao nova e separada.

### E4 ainda tem uma unica mutacao operacional

E4.4 validou a primeira mutacao controlada. Qualquer nova acao mutavel deve
seguir o mesmo padrao: PR pequeno, elegibilidade clara, confirmacao, smoke
isolado e auditoria de network/storage.

### DEXA #4 segue sem decisao

A prioridade DEXA com PDF/conclusao faltando continua fora do E4.4. Antes de
implementar, precisa decidir se "DEXA sem PDF" e uma prioridade propria ou
apenas um caso de avaliacao incompleta.

### Dados SMOKE/TEST continuam ocultos, nao deletados

O E4.3a apenas oculta esses dados por padrao. E4.4 nao alterou esse
comportamento.

---

## 9. Proxima recomendacao

A fase E4 ja tem uma superficie operacional util:

- painel read-only;
- filtros;
- deep-links;
- primeira mutacao controlada de reemissao.

Recomendacao: **pausar antes de nova mutacao** e escolher explicitamente uma
proxima frente:

| Opcao | Quando escolher |
|---|---|
| A - Revogacao manual de link | se o link ativo de teste ou links pendentes virarem risco operacional |
| B - DEXA #4 | se composicao corporal/PDF estiver bloqueando uso real |
| C - E5/E6 | se o proximo valor maior for evidence layer / relatorios |
| D - Refinamento read-only | se a operacao pedir mais filtros/ordenacao antes de novas acoes |

Nao iniciar nenhuma dessas sem decisao explicita.
