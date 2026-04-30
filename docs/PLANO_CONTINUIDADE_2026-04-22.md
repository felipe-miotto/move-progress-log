# Plano de Continuidade — 2026-04-22

## Objetivo do ciclo atual
Levar o app para estado operacional estavel no escopo atual, sem introduzir novas funcionalidades fora do necessario.

## Status consolidado (apos fix Oura em `main`)
- Oura sync/UI refresh: corrigido e mergeado (`PR #30`, commit `826b962`).
- Gates locais:
  - `lint`: PASS
  - `test`: PASS
  - `build`: PASS
  - `query-safety`: PASS
- Integridade de dados:
  - script `verify:data-integrity` depende de `SUPABASE_SERVICE_ROLE_KEY` no shell local.
  - sem a chave, execucao automatica local segue bloqueada por design.

## Ajuste tecnico aplicado neste ciclo
- `scripts/verify-essential-gates.sh` agora diferencia:
  - erro real de seguranca (`npm audit` com vulnerabilidade): FAIL
  - indisponibilidade de rede/registry local: WARN local (em CI continua FAIL)

## Execucao automatica concluida (bloco sessoes/prescricoes)
- Centralizada a invalidacao de cache de sessoes em `src/hooks/sessionQueryInvalidation.ts`.
- Migrados para a rotina unica:
  - `src/hooks/useWorkoutSessions.ts`
  - `src/hooks/useWorkouts.ts`
  - `src/components/EditSessionDialog.tsx`
  - `src/components/ImportSessionsDialog.tsx`
- Ajustada normalizacao de horario na reconciliacao de duplicados do import (`formatSessionTime` em vez de `slice(0,5)`).
- Ajustado fluxo de reabertura em `SessionsPage` para evitar refetch redundante e reduzir latencia percebida no clique.
- Invalidacao de cache agora roda em background (nao bloqueia feedback de sucesso no fluxo de UI).
- Efeito pratico:
  - reduz risco de tela desatualizada apos criar/editar/importar sessoes;
  - evita erro falso de fluxo quando uma invalidacao isolada falha;
  - mantém padrao de horario `HH:mm` na conciliacao de sessoes legadas.

## Validacao deste bloco
- `npm run lint`: PASS
- `npx tsc --noEmit`: PASS
- `npm run test -- --run`: PASS
- `npm run build`: PASS
- `npm run verify:essential`: PASS
- `npm run verify:query-safety`: PASS

## Atualizacao de status (2026-04-22)
- `PR #32` atualizado na branch `codex/session-stability-pass-20260422` com hardening adicional de cache em prescricoes.
- Novo helper de invalidacao centralizada:
  - `src/hooks/prescriptionQueryInvalidation.ts`
- Migrados para a rotina unica de invalidacao/refetch ativo:
  - `src/hooks/usePrescriptions.ts` (`create`, `assign`, `update`, `delete assignment`, `delete`)
- Ganho pratico:
  - reduz estado stale apos operacoes de prescricao;
  - padroniza comportamento de invalidacao (evita divergencia entre mutacoes);
  - reduz risco de refetch parcial sem impacto funcional no fluxo existente.
- Revalidacao local apos ajuste:
  - `npm run lint`: PASS
  - `npx tsc --noEmit`: PASS
  - `npm run test -- --run`: PASS
  - `npm run verify:essential`: PASS
  - `npm run verify:query-safety`: PASS
- Ajuste incremental de UX/estabilidade no import de sessoes:
  - `ImportSessionsDialog` agora exibe aviso explicito quando a invalidacao de cache falha apos importar;
  - evita falso positivo de "importou, mas nao apareceu" sem feedback acionavel.
- Hardening preventivo de links de convite:
  - `generate-student-invite` passou a exigir origem publica confiavel do app (sem fallback silencioso para localhost/editor);
  - `useStudentInvites` agora envia `frontend_origin` explicitamente;
  - reduz risco de convite sair com dominio errado fora do app real.

## Atualizacao de status (2026-04-29)
- Bloco automatico de erro silencioso em sessoes/prescricoes executado:
  - `RecordGroupSessionDialog` agora mostra feedback acionavel nos cenarios antes silenciosos:
    - falha ao carregar sessao existente na reabertura;
    - falha de autoassociacao de alunos por audio;
    - falha de vinculo de pos-processamento (observacoes/transcricoes);
    - falha parcial ao salvar segmentos de audio.
- Nenhuma regra funcional nova foi introduzida; apenas endurecimento de observabilidade/UX.
- Revalidacao completa do lote:
  - `npm run lint`: PASS
  - `npx tsc --noEmit`: PASS
  - `npm run test -- --run`: PASS
  - `npm run build`: PASS
  - `npm run verify:essential`: PASS
  - `npm run verify:query-safety`: PASS

## Atualizacao de status (2026-04-29 - convite Oura/canonical)
- Correcao aplicada no resolvedor de origem dos convites e callback Oura:
  - `generate-oura-connect-link`, `generate-student-invite` e `oura-callback` agora priorizam dominio canonico (`PUBLIC_APP_URL`/`APP_PUBLIC_URL`) quando configurado.
  - `SITE_URL` continua suportado como fallback.
  - dominios `id-preview--*.lovable.app` passaram a ser fallback de ultima opcao (quando nao houver origem publica melhor).
- Resultado pratico:
  - reduz risco de envio de convite em dominio tecnico de preview;
  - reduz risco de retorno do callback para dominio nao desejado;
  - mantem compatibilidade com fluxo atual sem expandir escopo funcional.
- Revalidacao local:
  - `npm run lint`: PASS
  - `npx tsc --noEmit`: PASS
  - `npm run test -- --run`: PASS
  - `npm run build`: PASS
  - `npm run verify:essential`: PASS

## Atualizacao de status (2026-04-29 - smoke Oura sem timeout longo)
- Patch tecnico pronto na branch `codex/oura-dry-run-fast-path`:
  - `oura-sync-all` passa a aceitar payload `dry_run` e retorna fast-path sem executar sync pesado.
  - `oura-sync-scheduled` repassa `dry_run` para `oura-sync-all`.
- Objetivo do patch:
  - permitir smoke tecnico rapido sem travar em execucoes longas de sincronizacao Oura.
- Revalidacao local do patch:
  - `npm run lint`: PASS
  - `npx tsc --noEmit`: PASS
  - `npm run test -- --run`: PASS
  - `npm run build`: PASS
  - `npm run verify:query-safety`: PASS
- PR aberto: `#43` (`fix(oura): add dry_run fast-path for sync-all/scheduled`).
- Atualizacao de fechamento:
  - PR `#43` mergeado em `main` (`20777cd`).
  - Escopo entregue no merge:
    - `dry_run` fast-path em `oura-sync-all` e propagacao em `oura-sync-scheduled`;
    - hardening adicional de dominio em convites/callback (`id-preview` -> `preview`) para reduzir convites em host tecnico.

## Atualizacao de status (2026-04-30 - gate preventivo de auth)
- Novo gate automatizado adicionado para evitar regressao em endpoints Edge com `verify_jwt=false`:
  - script: `scripts/verify-edge-auth-guards.sh`
  - npm script: `npm run verify:edge-auth`
- Gate incorporado no fluxo `verify:essential`.
- Resultado desta rodada:
  - `verify:edge-auth`: PASS
  - `verify:essential`: PASS (com `npm audit` em WARN local por indisponibilidade de rede no registry, sem achado funcional novo).

## Atualizacao de status (2026-04-30 - hardening bootstrap admin)
- `create-audit-admin` endurecido para comportamento previsivel de borda:
  - metodo diferente de `POST` agora retorna `405` (antes podia cair em erro generico);
  - payload invalido/malformado agora retorna `400` explicito.
- Sem mudanca de regra funcional de autorizacao (continua exigindo bootstrap flag + service role + `ADMIN_CREATION_KEY`).
- Revalidacao local:
  - `npm run lint`: PASS
  - `npx tsc --noEmit`: PASS
  - `npm run test -- --run`: PASS
  - `npm run build`: PASS

## Pendencias que ainda dependem de validacao manual
0. Configurar secret de runtime `PUBLIC_APP_URL` com o dominio publico final do app (ex.: `https://move-progress-log.lovable.app`) para forcar convite Oura no dominio canonico.
1. Importacao de sessao via Excel (novo + duplicado) em UI autenticada.
2. Geracao de relatorio em `/alunos/:id/relatorios`.
3. Exportacao PDF do relatorio.
4. Revisao visual final das abas de aluno com Oura.

## Proximo bloco automatico (sem depender do usuario)
1. Preparar PR de fechamento do lote com escopo estritamente de estabilidade.
2. Consolidar checklist manual final em `docs/SMOKE_MANUAL_FINAL_2026-04-22.md` para execucao assistida.

## Regra de escopo para este ciclo
- Sem expansao funcional nova.
- Prioridade total em estabilidade, consistencia de dados e ausencia de regressao.
