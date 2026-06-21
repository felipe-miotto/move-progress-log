
## Parte 1 — Auditoria final concluída (read-only)

Mapeei todas as FKs que referenciam `auth.users(id)` e `public.trainer_profiles(id)`, mais colunas conhecidas sem FK (`trainer_access_permissions`, `session_templates`, `prescription_folders`, `professional_students`, `student_reports`) e contei o UUID `cf28fc55-…` em cada coluna relevante (`user_id`, `trainer_id`, `professional_id`, `created_by`, `analyst_id`, `admin_id`):

| Local | Linhas |
|---|---|
| `assessments.professional_id` | **1** (a `6b94d6f2…`) |
| `user_roles.user_id` | **1** |
| `trainer_profiles.id` | **1** |
| `auth.identities.user_id` | 1 (some via cascade do auth admin delete) |
| Todos os outros pontos verificados (17 colunas, incluindo `student_invites`, `student_observations`, `precision_reports.analyst_id`, `precision12_questionnaire_links.trainer_id`, `workout_prescriptions`, `students`, `ai_builder_conversations`, `trainer_access_permissions.*`, `session_templates`, `prescription_folders`, `professional_students`, `student_reports`, `auth.sessions`) | **0** |

Sem surpresa. Bate exatamente com o esperado (trainer_profiles=1, user_roles=1, 1 assessment).

## Parte 2 — Execução

Dois artefatos:

### (a) Migration transacional — apenas tabelas `public`

```sql
BEGIN;

UPDATE public.assessments
   SET professional_id = NULL
 WHERE id = '6b94d6f2-6470-4411-b912-872d8174d516'
   AND professional_id = 'cf28fc55-2cb4-4331-b2db-a2ccea956e5f'
 RETURNING id;  -- esperado: 1 linha

DELETE FROM public.user_roles
 WHERE user_id = 'cf28fc55-2cb4-4331-b2db-a2ccea956e5f';

DELETE FROM public.trainer_profiles
 WHERE id = 'cf28fc55-2cb4-4331-b2db-a2ccea956e5f';

COMMIT;
```

Sem `DELETE FROM auth.users` aqui.

### (b) Edge Function one-shot `admin-delete-user`

- Segue o mesmo padrão de `admin-create-user`: valida `Authorization` Bearer, checa `user_roles.role = 'admin'` do chamador, e só então chama `supabase.auth.admin.deleteUser(targetUserId)` com `SUPABASE_SERVICE_ROLE_KEY`.
- Body: `{ "userId": "cf28fc55-2cb4-4331-b2db-a2ccea956e5f" }`.
- Deploy + invocação única passando o JWT do admin (você). Após confirmar o sucesso, **a função é apagada** (`supabase--delete_edge_functions`) — não fica resíduo em produção.

A função cuida do cascade automático em `auth.identities`, `auth.sessions`, etc.

## Parte 3 — Verificação pós

Rodo SELECTs read-only confirmando:

- `SELECT count(*) FROM auth.users WHERE id = '<ivamberg>'` → 0
- `SELECT count(*) FROM auth.identities WHERE user_id = '<ivamberg>'` → 0
- `SELECT count(*) FROM public.user_roles WHERE user_id = '<ivamberg>'` → 0
- `SELECT count(*) FROM public.trainer_profiles WHERE id = '<ivamberg>'` → 0
- `SELECT id, professional_id, trainer_id, student_id FROM public.assessments WHERE id = '6b94d6f2…'` → existe, `professional_id IS NULL`
- Reporto contagem real removida por tabela e confirmo a remoção do auth.

## Escopo / não-fazer

- Não toco em nenhuma outra linha de nenhuma tabela.
- Não uso `DELETE FROM auth.users` direto.
- Não mexo em RLS, policies, ou em outros usuários.
- Sem `CASCADE` amplo; se qualquer FK reclamar, a migration faz rollback e eu reporto a tabela faltante antes de qualquer ação adicional.
