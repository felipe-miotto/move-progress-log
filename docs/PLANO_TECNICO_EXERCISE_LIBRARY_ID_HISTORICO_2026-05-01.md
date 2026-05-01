# Plano tecnico — estabilizar historico de carga por `exercise_library_id`

Data: 2026-05-01  
Status: proposta tecnica, nao executada  
Escopo: preparar o sistema para renomeacoes e fusoes futuras em `exercises_library` sem quebrar historico de carga.

## 1. Problema

O historico de carga usado em prescricoes ainda procura exercicios executados por texto:

```ts
.ilike("exercise_name", `%${exerciseName}%`)
```

Isso fica fragil se os nomes canonicos forem alterados. O ideal e usar um identificador estavel (`exercise_library_id`). Porem a tabela `exercises`, que guarda exercicios realizados em sessoes, ainda nao tem essa coluna no schema atual.

## 2. Objetivo

Adicionar compatibilidade por ID sem perder historico:

- criar `exercises.exercise_library_id` nullable;
- popular a coluna de forma segura quando houver match confiavel;
- preservar `exercise_name` como snapshot historico;
- alterar `useExerciseLoadHistory` para buscar por ID quando disponivel;
- manter fallback por nome para linhas antigas sem match.

## 3. Diagnostico obrigatorio antes da migration

```sql
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('exercises', 'workout_sessions', 'prescription_exercises', 'exercises_library')
order by table_name, column_name;
```

Confirmar se a coluna ja existe em producao:

```sql
select exists (
  select 1
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'exercises'
    and column_name = 'exercise_library_id'
) as exercises_has_library_id;
```

Medir volume atual:

```sql
select count(*) as total_exercises from exercises;
```

Mapear nomes executados mais frequentes:

```sql
select exercise_name, count(*) as total
from exercises
group by exercise_name
order by total desc, exercise_name
limit 100;
```

## 4. Migration proposta

```sql
alter table public.exercises
add column if not exists exercise_library_id uuid null;

alter table public.exercises
add constraint exercises_exercise_library_id_fkey
foreign key (exercise_library_id)
references public.exercises_library(id)
on delete set null;

create index if not exists idx_exercises_exercise_library_id
on public.exercises(exercise_library_id);
```

## 5. Backfill conservador

### 5.1 Match exato case-insensitive

```sql
update public.exercises e
set exercise_library_id = el.id
from public.exercises_library el
where e.exercise_library_id is null
  and lower(trim(e.exercise_name)) = lower(trim(el.name));
```

### 5.2 Auditar sobras

```sql
select e.exercise_name, count(*) as total
from public.exercises e
where e.exercise_library_id is null
group by e.exercise_name
order by total desc, e.exercise_name;
```

### 5.3 Nao fazer match fuzzy automatico

Nao usar fuzzy/`ilike` para preencher FK automaticamente. Pode juntar pessoas/exercicios errados. Fuzzy deve gerar CSV de revisao manual.

## 6. Mudanca no frontend

### 6.1 Assinatura do hook

Hoje:

```ts
useExerciseLoadHistory(exerciseName, prescriptionId, enabled)
```

Proposto:

```ts
useExerciseLoadHistory({
  exerciseName,
  exerciseLibraryId,
  prescriptionId,
  enabled,
})
```

### 6.2 Regra de busca

1. Se `exerciseLibraryId` existir: buscar por `eq("exercise_library_id", exerciseLibraryId)`.
2. Complementar com fallback por nome apenas para alunos sem resultado por ID.
3. Se `exerciseLibraryId` nao existir: usar busca atual por nome normalizado.

Assim a mudanca e retrocompativel.

## 7. Validacao tecnica

Antes do merge:

```bash
git diff --check
npx tsc --noEmit
npm run lint
npm run test -- --run
npm run build
```

Validacao funcional:

- abrir uma prescricao com historico conhecido;
- abrir popover de historico de carga;
- confirmar que cargas aparecem antes e depois da migration;
- testar uma linha sem `exercise_library_id` para confirmar fallback.

## 8. Rollback

Rollback de codigo: reverter PR.

Rollback de banco:

```sql
drop index if exists public.idx_exercises_exercise_library_id;
alter table public.exercises drop constraint if exists exercises_exercise_library_id_fkey;
alter table public.exercises drop column if exists exercise_library_id;
```

Observacao: rollback so deve ser usado se a migration ainda nao tiver sido usada por outras features.

## 9. Decisao

Este plano deve ser executado antes de:

- renomeacoes em massa de `exercises_library.name`;
- fusoes/deletes de IDs de `exercises_library`;
- atualizacao de nomes canonicos em lote;
- automatizacao de classificacao por SQL.

