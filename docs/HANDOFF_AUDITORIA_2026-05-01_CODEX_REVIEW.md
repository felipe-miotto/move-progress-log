# Revisao critica Codex — Handoff de Auditoria 2026-05-01

Data: 2026-05-01  
Repositorio ativo validado: `/Users/alexgriebeler/Documents/New project/move-progress-log-lote2-20260410`  
Branch-base: `main`  
Objetivo: alinhar o handoff recebido com o estado real do codigo antes de qualquer alteracao de banco.

## 1. Veredito executivo

O handoff original e util como base de raciocinio, mas nao esta pronto para execucao de SQL. A principal falha tecnica e assumir que `exercises.exercise_library_id` existe, quando o schema gerado atual mostra que a tabela `exercises` ainda guarda apenas `exercise_name` como snapshot textual. Antes de renomear ou fundir exercicios em massa, precisamos criar um plano de compatibilidade para historico de carga por ID com fallback por nome. Ate isso existir, qualquer renomeacao ampla pode quebrar historico operacional.

## 2. Divergencias entre handoff e `main` atual

### 2.1 Estado do codigo

O handoff diz que "zero codigo de producao foi alterado". Isso esta desatualizado para o `main` atual.

No `main` ativo ja existem mudancas mergeadas depois daquele handoff:

| PR | Titulo | Status | Impacto |
|---|---|---|---|
| #58 | `a11y: improve touch navigation in session entry` | merged | melhora de touch/accessibilidade em `ExerciseFirstSessionEntry` |
| #59 | `ux: simplify exercise creation form` | merged | cadastro rapido de exercicio com campos avancados colapsaveis |

### 2.2 Clone correto

O arquivo recebido esta em:

```txt
/Users/alexgriebeler/Projects/move-progress-log/docs/HANDOFF_AUDITORIA_2026-05-01.md
```

O clone limpo e alinhado usado nesta etapa esta em:

```txt
/Users/alexgriebeler/Documents/New project/move-progress-log-lote2-20260410
```

Antes de executar qualquer fase, escolher um clone canonico. Recomendacao: continuar no clone limpo e alinhado com `origin/main`.

### 2.3 Schema real: `exercises` nao tem `exercise_library_id`

No schema gerado atual, `exercises` contem:

```ts
exercises: {
  Row: {
    created_at: string
    exercise_name: string
    id: string
    is_best_set: boolean | null
    load_breakdown: string | null
    load_description: string | null
    load_kg: number | null
    observations: string | null
    reps: number | null
    session_id: string
    sets: number | null
  }
}
```

Nao existe `exercise_library_id` em `exercises`. Portanto, os trechos do handoff que sugerem `UPDATE exercises SET exercise_library_id = ...` ou mudar diretamente `useExerciseLoadHistory` para `eq("exercise_library_id", ...)` ainda nao sao executaveis.

## 3. Respostas aos 10 pontos do handoff

### 1. Mitigacao em `useExerciseLoadHistory`

Concordo com o objetivo, mas nao com a execucao imediata.

Comportamento atual:

```ts
.ilike("exercise_name", `%${exerciseName}%`)
```

Problema: busca por string e vulneravel a renomeacoes.  
Bloqueio: `exercises.exercise_library_id` nao existe no schema atual.  
Solucao correta: criar coluna nullable, fazer backfill seguro e alterar o hook para usar ID quando existir, mantendo fallback por nome.

SQL diagnostico antes de qualquer migration:

```sql
select table_name, column_name, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('exercises', 'prescription_exercises', 'report_tracked_exercises')
  and column_name = 'exercise_library_id';
```

### 2. Qual `id` sobrevive numa fusao

Nao usaria apenas `created_at` mais antigo. Criterio recomendado:

1. Maior numero de referencias reais em tabelas de uso.
2. Em empate, `created_at` mais antigo.
3. Em novo empate, decisao manual.

Como `exercises` ainda nao tem FK, a contagem inicial deve considerar pelo menos:

```sql
select
  el.id,
  el.name,
  el.created_at,
  count(distinct pe.id) as prescription_refs,
  count(distinct rte.id) as report_refs
from exercises_library el
left join prescription_exercises pe on pe.exercise_library_id = el.id
left join report_tracked_exercises rte on rte.exercise_library_id = el.id
where el.id = any(array[
  'id_1'::uuid,
  'id_2'::uuid
])
group by el.id, el.name, el.created_at
order by prescription_refs desc, report_refs desc, el.created_at asc;
```

### 3. `MB` ambiguo

Aceito manter `MB` ambiguo por enquanto. Nao criaria `BM` agora.

Regra pragmatica:

- Em ativacao: `MB` tende a ser miniband.
- Em arremesso/lancamento: `MB` tende a ser medicine ball.
- No medio prazo, `equipment_required` deve desambiguar melhor que o nome.

### 4. Snapshots historicos

Concordo em nao atualizar snapshots historicos de sessao.

Porem o handoff parece assumir snapshot em `prescription_exercises.exercise_name`; no schema atual `prescription_exercises` usa `exercise_library_id`, nao `exercise_name`.

Decisao recomendada:

- Nao atualizar `exercises.exercise_name` historico.
- Atualizar `exercises_library.name` com cuidado.
- Garantir que telas de prescricao usem FK.
- Resolver historico de carga com ID futuro + fallback por nome.

### 5. Heuristica dos 58 suspeitos

Boa para triagem, nao para execucao automatica.

Regras que eu adicionaria:

- Categoria + subcategoria + `movement_pattern` juntos.
- Prefixo `LMF` ou nome contendo `Liberação miofascial` deve prevalecer para `lmf`.
- Exercicios com `Pallof Press` nao devem ser movidos apenas por conter `Press`.
- Exercicios de ponte/hip thrust sem carga podem ser ativacao ou forca conforme intencao; revisar manualmente.

### 6. Cadastro dos 10 canonicos faltantes

Para apenas 10 itens, cadastrar manualmente pela UI e aceitavel. Para consistencia e escala, prefiro CSV revisado + `INSERT` controlado.

Recomendacao:

1. Gerar CSV com 10 linhas propostas.
2. Alex revisa campos obrigatorios.
3. Inserir por SQL ou UI, mas usando a mesma tabela de revisao.

### 7. Ordem de execucao

Eu reordenaria:

1. Alinhar clones e estado real do `main`.
2. Atualizar handoff/plano com PRs #58 e #59.
3. Auditar schema real.
4. Criar plano para `exercises.exercise_library_id`.
5. Continuar apenas UX/UI de baixo risco enquanto banco nao esta pronto.
6. Revisar CSVs com Alex.
7. Executar piloto de banco em lote pequeno.
8. Fusoes por ultimo.

### 8. Convencao de nomenclatura

Concordo com a regra geral:

- primeira palavra em maiuscula;
- siglas em maiuscula;
- `cl` minusculo como excecao documentada;
- `c/` e `s/` minusculos.

Ponto de atencao: evitar cargas fixas no nome canonico, salvo quando fazem parte real da identidade do exercicio.

### 9. Estrategia de Fase 2

Nao comecaria pelo maior grupo. Comecaria por padrao menor ou medio para validar metodologia.

Ordem sugerida:

1. carregar;
2. core/ativacao;
3. cadeia posterior;
4. empurrar;
5. puxar;
6. dominancia de joelho.

### 10. Algo critico que escapou

Escapou:

- confusao entre clone documental e clone `main`;
- ausencia de `exercises.exercise_library_id`;
- falta de rollback por lote;
- SQL de fusao que falharia no schema atual;
- necessidade de dry-run antes de qualquer `UPDATE`/`DELETE`;
- necessidade de atualizar o handoff com PRs #58 e #59.

## 4. Proximo passo aprovado

Nao executar SQL agora.

Executar primeiro:

1. Documentar o bloqueio tecnico de `useExerciseLoadHistory`.
2. Criar plano tecnico para adicionar/backfill de `exercises.exercise_library_id`.
3. So depois propor migration e PR especifico.

## 5. Regra operacional ate novo aviso

Enquanto `exercises.exercise_library_id` nao existir e nao estiver populado:

- nao renomear `exercises_library.name` em massa;
- nao fundir IDs de `exercises_library`;
- nao atualizar snapshots historicos;
- nao rodar SQL de classificacao em lote;
- continuar apenas melhorias UX/UI e documentacao de baixo risco.

