# Plano de limpeza segura — Biblioteca de exercícios

## Objetivo
Fechar a fragilidade do banco de exercícios sem consolidar exercícios diferentes por engano.

## Estado atual
- `exercises_library`: 917 exercícios.
- `movement_pattern` ausente em 310 exercícios.
- `subcategory` ausente em 106 exercícios.
- Histórico de sessões em `exercises`: 1.534 linhas.
- Histórico com `exercise_library_id`: 553 linhas (36,1%).
- Histórico legado sem FK canônica: 981 linhas (63,9%).
- Duplicatas exatas normalizadas na biblioteca: 0.

## Regra de segurança
Nunca consolidar automaticamente por semelhança semântica. Exemplos como `Supino reto`, `Supino reto barra`, `Supino reto halteres` podem representar exercícios diferentes e precisam de decisão humana.

## Etapa A — Backfill seguro automático
Aplicar somente quando `exercises.exercise_name` tem match exato normalizado e único em `exercises_library.name`.

Critério:
- normalização remove acentos, caixa, pontuação e espaços repetidos.
- se houver 0 candidatos: não atualizar.
- se houver 2+ candidatos: não atualizar.
- se houver exatamente 1 candidato: seguro para preencher `exercise_library_id`.

## Etapa B — Fila de revisão manual
Gerar uma tabela/CSV com nomes legados sem match seguro, ordenada por frequência, com candidatos prováveis.

Campos mínimos:
- `exercise_name` legado
- total de linhas em sessões
- candidatos da biblioteca
- categoria / padrão / subcategoria de cada candidato
- decisão: aprovar mapping / criar novo exercício / manter separado

## Etapa C — Classificação da biblioteca
Corrigir primeiro exercícios de `forca_hipertrofia`, porque `movement_pattern` alimenta lógica de treino, relatórios e filtros.

Ordem recomendada:
1. `forca_hipertrofia` sem `movement_pattern`.
2. Top exercícios usados em sessões/prescrições.
3. Demais categorias com campos obrigatórios quase vazios.

## Etapa D — Prevenção futura
PR #94 impede que novas importações Excel aumentem o legado sem FK quando o nome importado tem match exato único na biblioteca.
