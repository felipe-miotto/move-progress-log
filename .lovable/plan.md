# Sync + Deploy + Publish — E4.5 revoke link

## Pré-flight (✅ já validado)

| Check | Resultado |
|---|---|
| HEAD = `e5fa07b537f324c2ca3477383fb64e684aa7a29a` | ✅ |
| `origin/main` = mesmo SHA | ✅ |
| Working tree clean | ✅ |
| `supabase/functions/revoke-precision12-questionnaire-link/index.ts` existe | ✅ |
| `supabase/config.toml` sem bloco custom pra essa function | ✅ (default `verify_jwt = false`) |
| Default `verify_jwt = false` aceitável | ✅ — OPTIONS sem auth; POST valida JWT em código via `userClient.auth.getUser()` (linhas 86-99) |

## Passos a executar

### 1. Deploy isolado da edge function
`supabase--deploy_edge_functions` com `function_names: ["revoke-precision12-questionnaire-link"]`. Nenhuma outra function tocada.

### 2. Smoke da function (`supabase--curl_edge_functions`)
- **A — OPTIONS sem auth** → esperado 2xx + `Access-Control-Allow-Origin`.
- **B — POST sem Authorization** → esperado 401 `{"error":"Unauthorized"}`.
  Override do header `Authorization: ""` pra impedir injeção do token de preview.

Se A ou B falhar → **STOP**, reportar, não publicar frontend.

### 3. Publish frontend
Edge verde → sinalizar pro usuário clicar **Publish → Update** (frontend só vai live com clique manual do dono). Nenhuma alteração de código.

### 4. Pós-publish (smoke visual)
Confirmar que `https://move-progress-log.lovable.app` serve o bundle novo e o botão "Revogar link" aparece no `QuestionnaireLinkPanel` da aba Avaliações de um aluno com link ativo.
Smoke funcional de revogação fica para etapa separada (não chamar a edge com payload real agora).

## Não fazer
- ❌ Nenhuma migration.
- ❌ Nenhum deploy de outras functions.
- ❌ Nenhuma mudança de código ou `config.toml`.
- ❌ Nenhum cleanup de dados.
- ❌ Nenhuma chamada real de revogação.
