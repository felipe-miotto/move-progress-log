# Auditoria UX/UI de Superfície — Fabrik Performance
**Data:** 2026-05-01
**Escopo:** diagnóstico cosmético/superficial fora do Dashboard. Sem mexer em schema, sem propor features, sem remover funcionalidade.
**Princípio inegociável:** **PRESERVAÇÃO DE 100% DA FUNCIONALIDADE.** Toda recomendação aqui é restyle, regroup, relabel, resize, reorder ou hide-behind-disclosure. **Nada é removido.**

---

## 1. Resumo Executivo

A aplicação está sólida em termos de fluxo, mas sofre de **excesso de igualdade visual**: botões de tarefas rotineiras competem em peso com ações destrutivas, três a quatro botões "outline" ficam lado a lado sem nenhum primário claro, e o componente de botão "outline" usa borda dupla (`border-2`) em todo o app — exatamente o padrão que faz qualquer filtro parecer "ativo". Há também uma camada de **inglês remanescente** vinda dos dados-semente (tags de protocolo: "Energy", "Recovery", "Pain", "Sleep Quality"...) que os clientes premium veem em uma tela em português. As tabelas de prescrição renderizam coluna inteira de "—" quando o campo OBS está vazio em todas as linhas, criando ruído visual no Modo TV. A metáfora visual de "pasta" em Prescrições não comunica o conceito real (programa de treino → dias da semana). Nada disso é grave, nada quebra; tudo é cosmético, mas o efeito agregado em um produto de R$ 3.900–4.500/mês é perceptível. **Nenhuma das 50+ recomendações deste relatório remove um único botão, link, coluna, filtro ou ação.** Todas trabalham apenas no peso visual, na cópia ou na disposição.

**Top 5 padrões mais sérios encontrados:**
1. `variant="outline"` global usa `border-2` (botão.tsx:24) — fonte sistêmica do "tudo parece ativo".
2. Cabeçalho do `PrescriptionCard` tem 4 botões outline equivalentes sem primário (Modo TV / Editar / Atribuir / Registrar Sessão).
3. Tags de benefício de protocolo em inglês (~30 chaves: Energy, Recovery, Pain, Sleep Quality, Mood, Cortisol, Stress…).
4. Coluna OBS sempre renderizada com "—" mesmo quando 100% vazia, em modo de exibição grande (TV).
5. Metáfora visual de "pasta" não traduz o modelo mental real (programa → dias da semana).

---

## 2. Inconsistências de Botões

### 2.1 Origem sistêmica — `variant="outline"` com `border-2`

**LOCATE:** [src/components/ui/button.tsx:24](src/components/ui/button.tsx#L24)
**DESCRIBE:** Variante `outline` aplica `border-2 border-input`, ou seja, 2px de espessura, enquanto `Input`, `Select` e `Textarea` (componentes irmãos do design system) usam `border` (1px).
**DIAGNOSE:** Borda mais grossa do que o resto do design system faz qualquer botão outline competir por atenção e parecer "ativo/selecionado" em estado de repouso. É a raiz do "Mais filtros parece ativo por padrão".
**EVIDENCE:**
```ts
// button.tsx:24
outline: "border-2 border-input bg-background hover:bg-accent ...",
```
```ts
// select.tsx:20 / input.tsx:11
"border border-input ..."
```
**RECOMMEND:** Reduzir para `border` (1px) na variante `outline`. Mudança de 1 caractere, propaga visualmente em ~120 botões.
**PRESERVATION CHECK:** YES — apenas espessura visual de borda muda; nenhum botão é alterado em comportamento ou removido.
**EFFORT:** S | **RISK:** LOW (apenas CSS) | **ALEX_TRANSLATION:** Hoje todo botão outline tem borda grossa que dá a impressão de estar "ligado". Tirando 1 pixel de espessura dessa borda, eles voltam a parecer botões em repouso.

### 2.2 PrescriptionCard — 4 botões outline sem primário

**LOCATE:** [src/components/PrescriptionCard.tsx:131-168](src/components/PrescriptionCard.tsx#L131)
**DESCRIBE:** Modo TV / Editar / Atribuir / Registrar Sessão, todos `variant="outline" size="sm"`, lado a lado.
**DIAGNOSE:** Sem hierarquia. Treinador não sabe onde "começar". A ação operativa (Registrar Sessão) é a que deveria atrair primeiro o olho.
**RECOMMEND:**
- `Registrar Sessão` → `variant="default" size="sm"` (primário).
- `Editar` e `Atribuir/Gerenciar` → mantêm `variant="outline" size="sm"`.
- `Modo TV` → `variant="ghost" size="sm"` (modo de visualização, não escrita).
- Resultado: ghost · outline · outline · primário · overflow-menu.
**PRESERVATION CHECK:** YES — todos os 4 botões e o menu overflow continuam visíveis e funcionais; só muda peso visual.
**EFFORT:** S | **RISK:** LOW | **ALEX_TRANSLATION:** Hoje os 4 botões parecem iguais. A proposta destaca "Registrar Sessão" (a ação do dia-a-dia), mantém "Editar" e "Atribuir" como secundários e suaviza "Modo TV" (que é só visualização).

### 2.3 PrescriptionsPage — 4 alturas de botão diferentes em uma linha

**LOCATE:** [src/pages/PrescriptionsPage.tsx:309-362](src/pages/PrescriptionsPage.tsx#L309)
**DESCRIBE:** Linha de ações tem `size="icon"` (h-10), `size="sm"` (h-8), `size="sm"` (h-8) e default (h-10) — desnível de 8px.
**RECOMMEND:** Remover `size="sm"` dos botões "Gerar com IA" (linha 335) e "Importar Word" (linha 346) — todos passam a `h-10`.
**PRESERVATION CHECK:** YES — só altera altura.
**EFFORT:** S | **RISK:** LOW | **ALEX_TRANSLATION:** Os 4 botões do topo da tela "Prescrições" estão com alturas diferentes. A correção alinha todos.

### 2.4 ExercisesLibraryPage — Excluir vermelho compete com Editar

**LOCATE:** [src/pages/ExercisesLibraryPage.tsx:526-545](src/pages/ExercisesLibraryPage.tsx#L526)
**DESCRIBE:** Editar (outline) e Excluir (destructive vermelho) ocupam 50/50 com `flex-1`.
**DIAGNOSE:** A ação destrutiva é um vermelho cheio que rouba a cena de uma ação rotineira (editar).
**RECOMMEND:** Editar continua `flex-1` cobrindo a linha; Excluir vira `<Button variant="ghost" size="icon" className="h-9 w-9 text-destructive hover:bg-destructive/10" aria-label="Excluir exercício"><Trash2/></Button>` (ícone-só).
**PRESERVATION CHECK:** YES — botão continua presente, no mesmo lugar, com mesma função; só passa de pílula vermelha para ícone-fantasma vermelho.
**EFFORT:** S | **RISK:** LOW | **ALEX_TRANSLATION:** O botão "Excluir" está vermelho e do mesmo tamanho do "Editar"; a proposta encolhe o vermelho para um iconezinho (mantém a função, só some o destaque visual).

### 2.5 RecordIndividualSessionDialog — 4 botões no rodapé competindo

**LOCATE:** [src/components/RecordIndividualSessionDialog.tsx:455-462](src/components/RecordIndividualSessionDialog.tsx#L455)
**DESCRIBE:** "← Voltar" (outline), "Editar Dados" (secondary), "Adicionar Gravação" (secondary), "Finalizar e Salvar" (default). Três variantes de peso médio brigando por atenção.
**RECOMMEND:** Voltar → `ghost`; Editar Dados e Adicionar Gravação → `outline`; Finalizar e Salvar mantém `default`. Resultado: ghost · outline · outline · primário.
**PRESERVATION CHECK:** YES — os 4 botões permanecem.
**EFFORT:** S | **RISK:** LOW | **ALEX_TRANSLATION:** No rodapé do registro de sessão, 4 botões disputam atenção; a proposta coloca o "Finalizar e Salvar" sozinho em destaque.

### 2.6 RecordGroupSessionDialog — rodapé do preview

**LOCATE:** [src/components/RecordGroupSessionDialog.tsx:816-818](src/components/RecordGroupSessionDialog.tsx#L816)
**RECOMMEND:** Voltar → `ghost`; resto inalterado.
**PRESERVATION CHECK:** YES.
**EFFORT:** S | **RISK:** LOW | **ALEX_TRANSLATION:** Pequeno ajuste para o "Voltar" não competir com o "Finalizar e Salvar".

### 2.7 EditPrescriptionDialog — trash sem cor destrutiva

**LOCATE:** [src/components/EditPrescriptionDialog.tsx:480-496](src/components/EditPrescriptionDialog.tsx#L480)
**DIAGNOSE:** Dois `ghost size="sm"` adjacentes — um deles é apagar — sem distinção de cor. Trash tem que ler como destrutivo.
**RECOMMEND:** Adicionar `text-destructive hover:text-destructive hover:bg-destructive/10` no botão da linha 491.
**PRESERVATION CHECK:** YES — só cor.
**EFFORT:** S | **RISK:** LOW.

### 2.8 SortableExerciseItem — trash sem cor

**LOCATE:** [src/components/SortableExerciseItem.tsx:153-189](src/components/SortableExerciseItem.tsx#L153)
**RECOMMEND:** Adicionar `text-destructive hover:bg-destructive/10` ao Trash2 (linha 173-188); subir para `h-9 w-9`.
**PRESERVATION CHECK:** YES.
**EFFORT:** S | **RISK:** LOW.

### 2.9 PrescriptionCard — overflow trigger desalinhado com vizinhos

**LOCATE:** [src/components/PrescriptionCard.tsx:173-180](src/components/PrescriptionCard.tsx#L173)
**DIAGNOSE:** `size="sm"` (h-8 nativo) com override `h-9 w-9 p-0` — fica 36px ao lado de irmãos h-8. Inconsistência visual sutil, mas notável.
**RECOMMEND:** Trocar para `<Button variant="ghost" size="icon" className="h-9 w-9">` ou alinhar com `h-8 w-8 p-0`.
**PRESERVATION CHECK:** YES.
**EFFORT:** S | **RISK:** LOW.

### 2.10 AdminUsersPage — header CTAs em h-8 (inconsistente com o resto do app)

**LOCATE:** [src/pages/AdminUsersPage.tsx:282-296](src/pages/AdminUsersPage.tsx#L282)
**RECOMMEND:** Remover `size="sm"` dos botões do cabeçalho; CTAs de página padronizam em h-10. Botões dentro de linhas de tabela permanecem `sm`.
**PRESERVATION CHECK:** YES.
**EFFORT:** S | **RISK:** LOW.

### 2.11 ExercisesLibraryPage — strip de filtros mistura h-10 e h-8

**LOCATE:** [src/pages/ExercisesLibraryPage.tsx:139,168](src/pages/ExercisesLibraryPage.tsx#L139)
**RECOMMEND:** Padronizar `size="sm"` ou default em todos os elementos da mesma fileira.
**PRESERVATION CHECK:** YES.
**EFFORT:** S | **RISK:** LOW.

### 2.12 EditGroupSessionDialog — rodapé com 3 variantes

**LOCATE:** [src/components/EditGroupSessionDialog.tsx:372-389](src/components/EditGroupSessionDialog.tsx#L372)
**RECOMMEND:** Cancelar → `ghost`; secundários permanecem outline; primário continua default.
**PRESERVATION CHECK:** YES.
**EFFORT:** S | **RISK:** LOW.

### 2.13 Tabela consolidada — peso/variante por padrão

| Contexto | Hoje | Proposta | Preservação |
|---|---|---|---|
| Cabeçalho de página com 1 CTA | default | mantém | 100% |
| Cabeçalho de página com 2-3 CTAs | múltiplos default/outline | 1 default + outras outline | 100% |
| Cabeçalho de página com 4+ CTAs | tudo outline | 1 default + outline + ghost + overflow-menu | 100% |
| Rodapé de dialog (Cancelar/Salvar) | outline + default | ghost + default | 100% |
| Linha de item editável (Editar / Excluir) | outline + destructive cheio | outline + ghost-icon-destructive | 100% |
| Trash em listas internas | ghost sem cor | ghost com `text-destructive` | 100% |
| Variante `outline` (sistêmica) | `border-2` | `border` | 100% |

---

## 3. Mistura de Idioma

A aplicação é em português; o inglês remanescente vem majoritariamente de **chaves snake_case nos dados-semente de protocolos**, que são renderizadas cruas. Substituição de string apenas — preservação trivial.

### 3.1 Tags de benefício de protocolo (raiz do problema)

**LOCATE:** [src/components/RecoveryProtocolCard.tsx:26-31, 59-63](src/components/RecoveryProtocolCard.tsx#L26)
A função `formatBenefits()` lê chaves JSONB e aplica title-case. Como as chaves vêm em inglês snake_case, o usuário vê tags em inglês.

**Origem das chaves:** [supabase/migrations/20251030010328_82923690-2cfc-4eb8-b498-4af0297b29a6.sql:104-128](supabase/migrations/20251030010328_82923690-2cfc-4eb8-b498-4af0297b29a6.sql#L104)

| Chave (texto exibido) | Tradução proposta |
|---|---|
| `energy` → "Energy" | "Energia" |
| `recovery` → "Recovery" | "Recuperação" |
| `pain` → "Pain" | "Dor" |
| `sleep_quality` → "Sleep Quality" | "Qualidade do Sono" |
| `muscle_soreness` → "Muscle Soreness" | "Dor Muscular" |
| `stress` → "Stress" | "Estresse" |
| `focus` → "Focus" | "Foco" |
| `anxiety` → "Anxiety" | "Ansiedade" |
| `mood` → "Mood" | "Humor" |
| `cortisol` → "Cortisol" | "Cortisol" (mantém) |
| `inflammation` → "Inflammation" | "Inflamação" |
| `circulation` → "Circulation" | "Circulação" |
| `detoxification` → "Detoxification" | "Desintoxicação" |
| `respiratory` → "Respiratory" | "Respiratório" |
| `skin_health` → "Skin Health" | "Saúde da Pele" |
| `relaxation` → "Relaxation" | "Relaxamento" |
| `immune_system` → "Immune System" | "Sistema Imunológico" |
| `alertness` → "Alertness" | "Disposição" |
| `stress_resilience` → "Stress Resilience" | "Resiliência ao Estresse" |
| `blood_pressure` → "Blood Pressure" | "Pressão Arterial" |
| `emotional_regulation` → "Emotional Regulation" | "Regulação Emocional" |
| `body_awareness` → "Body Awareness" | "Consciência Corporal" |
| `tension` → "Tension" | "Tensão" |
| `pain_management` → "Pain Management" | "Manejo da Dor" |
| `aerobic_capacity` → "Aerobic Capacity" | "Capacidade Aeróbica" |
| `fat_burning` → "Fat Burning" | "Queima de Gordura" |
| `mitochondrial_health` → "Mitochondrial Health" | "Saúde Mitocondrial" |
| `mobility` → "Mobility" | "Mobilidade" |
| `balance` → "Balance" | "Equilíbrio" |
| `cardiovascular` → "Cardiovascular" | "Cardiovascular" (mantém) |
| `hrv` → "Hrv" | "VFC" (ou manter "HRV") |

**RECOMMEND:** Adicionar mapa de tradução dentro de `formatBenefits()` (chaves EN → labels PT). Não tocar no banco.
**PRESERVATION CHECK:** YES — apenas troca de string exibida.
**EFFORT:** S | **RISK:** LOW.

### 3.2 Nomes e subcategorias de protocolos (mesma migração)

- "Box Breathing" → "Respiração em Caixa" (ou manter)
- "Mindfulness Meditation" → "Meditação Mindfulness"
- "Body Scan Mindfulness" → "Mindfulness de Escaneamento Corporal"
- "Yoga Flow" → "Yoga Flow" (termo difundido em PT)
- "Wim Hof" → manter (nome próprio)
- "Low Impact" (subcategoria) → "Baixo Impacto"

**RECOMMEND:** Mapeamento no `RecoveryProtocolCard` para `name` e `subcategory`, preservando os valores no banco.
**PRESERVATION CHECK:** YES.

### 3.3 Componentes shadcn com defaults em inglês

| LOCATE | String EN | Proposta PT |
|---|---|---|
| [src/components/ui/pagination.tsx:10](src/components/ui/pagination.tsx#L10) | `aria-label="pagination"` | `"paginação"` |
| [src/components/ui/pagination.tsx:50](src/components/ui/pagination.tsx#L50) | `aria-label="Go to previous page"` | `"Página anterior"` |
| [src/components/ui/pagination.tsx:52](src/components/ui/pagination.tsx#L52) | `<span>Previous</span>` | `"Anterior"` |
| [src/components/ui/pagination.tsx:58](src/components/ui/pagination.tsx#L58) | `aria-label="Go to next page"` | `"Próxima página"` |
| [src/components/ui/pagination.tsx:59](src/components/ui/pagination.tsx#L59) | `<span>Next</span>` | `"Próximo"` |
| [src/components/ui/dialog.tsx:47](src/components/ui/dialog.tsx#L47) | `<span className="sr-only">Close</span>` | `"Fechar"` |
| [src/components/ui/sheet.tsx:62](src/components/ui/sheet.tsx#L62) | `<span className="sr-only">Close</span>` | `"Fechar"` |
| [src/components/ui/breadcrumb.tsx:12](src/components/ui/breadcrumb.tsx#L12) | `aria-label="breadcrumb"` | `"Trilha de navegação"` |
| [src/components/ui/sidebar.tsx:237](src/components/ui/sidebar.tsx#L237) | `<span className="sr-only">Toggle Sidebar</span>` | `"Alternar barra lateral"` |
| [src/components/ui/sidebar.tsx:252](src/components/ui/sidebar.tsx#L252) | `aria-label="Toggle Sidebar"` | `"Alternar barra lateral"` |

**PRESERVATION CHECK:** YES — apenas tradução de string. **EFFORT:** S | **RISK:** LOW.

### 3.4 Cabeçalhos de tabela em mistura

| LOCATE | Atual | Proposta |
|---|---|---|
| [PrescriptionCard.tsx:248](src/components/PrescriptionCard.tsx#L248), [PrescriptionTVMode.tsx:103](src/components/PrescriptionTVMode.tsx#L103) | `Sets x Reps / Int` | `Séries × Reps / Int` |

**PRESERVATION CHECK:** YES.

### 3.5 Constantes com expansões em inglês (descrições internas)

[src/constants/trainingMethods.ts:50,55,60,65,75](src/constants/trainingMethods.ts#L50): expansões "As Many Reps As Possible", "Every Minute On the Minute", etc. **PRESERVAÇÃO E PROPOSTA:** as siglas EMOM/AMRAP/etc. **permanecem** (são padrão de mercado); só a descrição em texto longo passa a português ("A Cada Minuto No Minuto", "Tantas Repetições Quanto Possível").

[src/constants/backToBasics.ts:543-549](src/constants/backToBasics.ts#L543) — análogo. **PRESERVATION CHECK:** YES — siglas mantidas.

### 3.6 Itens de navegação em inglês

[src/constants/navigation.ts:69-71](src/constants/navigation.ts#L69):
- "AI Builder" → "Construtor de IA" (decisão do Alex: branding)
- "Coach Console" → "Console do Treinador" (decisão do Alex: branding)
- "Dashboard" → "Painel" (decisão do Alex; "Dashboard" é amplamente entendido)

**PRESERVATION CHECK:** YES — só rótulo. **DECISÃO PENDENTE DO ALEX.**

### 3.7 Nota: existe `src/i18n/pt-BR.json` mas não é usado como i18n real

A maior parte dos componentes importa o JSON e acessa via path (`i18n.actions.delete`), mas muitas strings ainda estão hardcoded inline. **NÃO** propor migração para `react-i18next` agora — está fora do escopo de superfície e tem risco. Apenas: ao traduzir as strings desta seção, **adicionar** as chaves novas em `pt-BR.json` e usar a importação direta — segue padrão já existente.

---

## 4. Nomenclatura de Exercícios e Termos de Treino

### 4.1 Mapa de abreviações existe mas nunca é exibido

**LOCATE:** [src/data/exercicios_fabrik_categorizado.json:8-37](src/data/exercicios_fabrik_categorizado.json#L8) — campo `abreviacoes` define 28 siglas (`AJ`, `BB`, `DB`, `KB`, `MB`, `SB`, `PE`, `UNL`, `BI`, `ALT`, `ROT`, `ECC`, `CC`, `ISO`, etc.).
**DIAGNOSE:** O dado existe mas nenhum componente o lê. O usuário vê "Flexão de braços c/ elevação AJ", "Remada UNL c/ ROT" sem possibilidade de descobrir o que significa.
**RECOMMEND:** Em [ExercisesLibraryPage.tsx](src/pages/ExercisesLibraryPage.tsx), expor um botão "Ver legenda de siglas" (ghost, secundário) que abre um popover/sheet listando as 28 chaves. Adicionalmente, em [PrescriptionCard.tsx:286](src/components/PrescriptionCard.tsx#L286) e [PrescriptionTVMode.tsx:130](src/components/PrescriptionTVMode.tsx#L130), envolver o nome do exercício em `<Tooltip>` que destaca a expansão das siglas presentes — quando aplicável. Nada novo no DB, nada removido.
**PRESERVATION CHECK:** YES — apenas adiciona tooltip/legend; nenhum exercício, sigla ou nome é alterado.
**EFFORT:** M | **RISK:** LOW.

### 4.2 Padrões de inconsistência ortográfica observados (NÃO renomear sem aprovação)

Vetores observados em `exercicios_fabrik_categorizado.json`:
- `c/` vs `com` (uso misto)
- `1KB/DB` vs `2KB/DB` (prefixo de contagem variável)
- `KB/DB` vs `DB/KB` (ordem variável; ex.: linha 1179 vs 1207)
- `(PE) c/ sobrecarga` vs `c/ sobrecarga` (parênteses variáveis; ex.: linhas 100 vs 121)
- Maiúsculas em prosa: `c/ ROT` no meio de "Remada em pé UNL c/ ROT"

**RECOMMEND:** Definir uma convenção (ex.: sempre `c/`, sempre `KB/DB` em ordem alfabética, sigla sempre sem parênteses dentro do meio do nome, primeira letra maiúscula só em início). Documentar em `docs/NOMENCLATURA_PADRONIZADA.md`. **NÃO renomear automaticamente** — cada renomeação é uma decisão por exercício, com impacto em sessões já registradas.

**Lista de candidatos a renomeação (DECISÃO PENDENTE DO ALEX — não executar sem aprovação explícita por exercício):**
- Reordenação `2KB/DB` → `2DB/KB` em todas as ocorrências.
- Padronização `c/` em todas as ocorrências (algumas usam `com`).
- Remoção/uniformização de `(PE)` parênteses inline.
**PRESERVATION CHECK:** YES — esta seção é apenas observacional. Nada é alterado neste relatório.

### 4.3 Termos de treino — siglas sem tooltip nas telas read-only

| LOCATE | Sigla | Tem tooltip hoje? | Recomendação |
|---|---|---|---|
| [PrescriptionCard.tsx:250,253,256](src/components/PrescriptionCard.tsx#L250) | PSE / RR / OBS | Não | Adicionar `<Tooltip>` no `<TableHead>` |
| [PrescriptionCard.tsx:316-318](src/components/PrescriptionCard.tsx#L316) | EMOM / E2MOM / AMRAP / SUPERSET (Método) | Não | Reusar pattern de [SortableExerciseItem.tsx:273-285](src/components/SortableExerciseItem.tsx#L273) que já tem tooltip nesse Badge |
| [PrescriptionTVMode.tsx:104,106,109,165](src/components/PrescriptionTVMode.tsx#L104) | PSE / RR / OBS / Método | Não | Mesma orientação |
| [MesocyclePreview.tsx:322](src/components/MesocyclePreview.tsx#L322), [session/PrescriptionSidebar.tsx:46](src/components/session/PrescriptionSidebar.tsx#L46) | Método | Não | Tooltip |

**Discrepância nominal:** Campo no banco se chama `rir` (Reps in Reserve) mas a UI rotula como `RR`. **Decisão do Alex:** padronizar UI em `RIR` ou em `RR`? — apenas trocar rótulo do header, nenhuma migração de dado.
**PRESERVATION CHECK:** YES — apenas tooltips e (eventualmente) rótulo de cabeçalho.
**EFFORT:** M | **RISK:** LOW.

---

## 5. Modelo Mental de Prescrições

### 5.1 Estado atual

A tela mostra **pastas** (com ícone `Folder`/`FolderOpen`), com um chevron de expandir, label "Pasta vazia. Arraste prescrições aqui" e o vocabulário "Mover para Pasta", "Remover da Pasta", "Sem Pasta", "Renomear", "Excluir pasta". O conteúdo dentro da pasta são "prescrições" cujos nomes seguem o padrão "Time Efficient P3 - 2ª feira", "Time Efficient P3 - 4ª feira".

**LOCATE:** [src/components/FolderTree.tsx](src/components/FolderTree.tsx) inteiro; [src/components/PrescriptionCard.tsx](src/components/PrescriptionCard.tsx); [src/components/CreateSubfolderDialog.tsx](src/components/CreateSubfolderDialog.tsx); [src/components/RenameFolderDialog.tsx](src/components/RenameFolderDialog.tsx); [src/pages/PrescriptionsPage.tsx:519,544](src/pages/PrescriptionsPage.tsx#L519).

### 5.2 Diagnóstico

A metáfora visual diz "sistema de arquivos". O modelo conceitual é "Periodização (programa) → dias de treino na semana". Para um treinador novo, a pasta sugere "pode pôr o que quiser aqui" e os dias da semana viram "arquivos soltos". O atrito é puramente cosmético/lexical: o modelo de dados está correto.

### 5.3 Proposta cirúrgica (visual + cópia, sem mudar dados nem componentes)

**LOCATE & RECOMMEND:**

1. **Ícone de pasta → ícone de programa**
   - [FolderTree.tsx:170-173](src/components/FolderTree.tsx#L170): trocar `Folder` / `FolderOpen` por `Calendar` / `CalendarRange` (ou `LayoutGrid` / `Layers`). O componente `lucide-react` continua o mesmo, só o ícone usado muda.
   - **Preservação:** YES — o objeto continua sendo a mesma "pasta" no banco; nada muda em `useFolders` ou no schema.

2. **Cópia/labels — sem renomear endpoint, só rótulo na UI**
   - [PrescriptionsPage.tsx:319](src/pages/PrescriptionsPage.tsx#L319) "Buscar prescrições" → mantém.
   - [PrescriptionsPage.tsx:327](src/pages/PrescriptionsPage.tsx#L327) "Nova pasta" → "Novo programa".
   - [PrescriptionsPage.tsx:517](src/pages/PrescriptionsPage.tsx#L517) `Excluir pasta "{name}"?` → `Excluir programa "{name}"?`
   - [PrescriptionsPage.tsx:519](src/pages/PrescriptionsPage.tsx#L519) `As prescrições dentro desta pasta` → `Os dias de treino dentro deste programa`.
   - [PrescriptionCard.tsx:186](src/components/PrescriptionCard.tsx#L186) "Mover para Pasta" → "Mover para Programa".
   - [PrescriptionCard.tsx:213](src/components/PrescriptionCard.tsx#L213) "Remover da Pasta" → "Remover do Programa".
   - [FolderTree.tsx:201](src/components/FolderTree.tsx#L201) `title="Criar subpasta"` → `title="Criar subprograma"`.
   - [FolderTree.tsx:267](src/components/FolderTree.tsx#L267) `Pasta vazia. Arraste prescrições aqui.` → `Programa vazio. Arraste dias de treino para cá.`
   - [CreateSubfolderDialog.tsx], [RenameFolderDialog.tsx] — atualizar títulos e descrições análogas.
   - **Preservação:** YES — apenas troca de string. Endpoints, hooks (`useFolders`), nomes de variáveis, paths e identifiers permanecem.

3. **Visualização do "card" da prescrição como dia da semana**
   - Hoje cada `PrescriptionCard` já mostra o nome ("Time Efficient P3 - 2ª feira"). Manter.
   - Adicionar um pequeno chip de dia (Seg / Ter / Qua) à esquerda do título quando o nome contiver dia da semana — apenas visual, derivado por regex do `prescription.name`. Nada mudado no DB.
   - Ou, mais conservador: nada além das mudanças de cópia acima.
   - **Preservação:** YES.

4. **Manter intactos:**
   - O ícone `MoreVertical` (3-dots) em todos os lugares.
   - O chevron de expandir/recolher.
   - O sub-menu "Mover para Pasta/Programa" (item de menu permanece, só o rótulo muda).
   - O drag-and-drop entre pastas.
   - O ícone destacado em laranja para a primeira ação de "+" da pasta.

**PRESERVATION CHECK GLOBAL:** YES — todos os controles existentes (3-dots, chevron, ícones de pasta, ações Mover/Remover/Renomear/Excluir) permanecem. A intervenção é **lexical e icônica**, não funcional.
**EFFORT:** M | **RISK:** LOW (mudanças de string e ícone são localizadas).
**ALEX_TRANSLATION:** A tela de Prescrições parece um gerenciador de arquivos, mas o conceito real é "programa de treino → dias da semana". A proposta troca a palavra "pasta" por "programa" nos textos, troca o ícone de pasta amarela por um ícone de calendário/grade, e mantém **todos** os botões e funções como estão. Renomear é só visual; o banco continua igual.

---

## 6. Estados de Filtro e Componentes Ambíguos

### 6.1 Causa-raiz: `border-2` na variante outline (já tratada em 2.1)

A correção da seção 2.1 elimina a maior parte do problema de "filtro parece ativo". Mantemos as recomendações específicas abaixo para casos onde o sinal positivo de "ativo" também precisa melhorar.

### 6.2 ExercisesLibraryPage — "Mais filtros" sem badge positiva

**LOCATE:** [src/pages/ExercisesLibraryPage.tsx:232-241](src/pages/ExercisesLibraryPage.tsx#L232)
**DIAGNOSE:** Mostra `(N ativos)` como sufixo de texto inline; sinal binário de "ativo/não ativo" é fraco. Usuário precisa ler para entender estado.
**RECOMMEND:** Substituir o sufixo por um `<Badge variant="default" className="ml-1 h-5 px-1.5 text-xs">{N}</Badge>` que aparece **somente** quando `count > 0` (já é condicional). Pílula colorida cria leitura instantânea.
**PRESERVATION CHECK:** YES — só muda o tipo de elemento que indica estado; filtros e funcionalidade permanecem.
**EFFORT:** S | **RISK:** LOW.

### 6.3 SessionsPage — "Mostrar/Ocultar" filtros, painel correto mas seletores internos pesados

**LOCATE:** [src/pages/SessionsPage.tsx:215-238](src/pages/SessionsPage.tsx#L215)
**DIAGNOSE:** Lógica de `hasActiveFilters` está correta, mas dentro do painel todos os Selects/Popovers usam outline (problema sistêmico 2.1).
**RECOMMEND:** Aplicar correção 2.1 (border 1px). Nenhum filtro alterado.
**PRESERVATION CHECK:** YES.
**EFFORT:** S (já incluso em 2.1) | **RISK:** LOW.

### 6.4 PrescriptionSearchBar — referência correta (manter)

**LOCATE:** [src/components/PrescriptionSearchBar.tsx:64,157-206](src/components/PrescriptionSearchBar.tsx#L64)
**DIAGNOSE:** Implementa `hasActiveFilters` e botão "Limpar" condicional. **É o pattern correto a replicar.**
**RECOMMEND:** Nenhuma alteração; usar como referência.

---

## 7. Estados Vazios e Tabelas

### 7.1 Modo TV — coluna OBS sempre visível, "—" em todas as linhas

**LOCATE:** [src/components/PrescriptionTVMode.tsx:109,172-174](src/components/PrescriptionTVMode.tsx#L109)
**DESCRIBE:** O `<th>OBS</th>` e cada `<td>{exercise.observations || "—"}</td>` são sempre renderizados. Em prescrições onde nenhum exercício tem observação (a maioria), a tela exibe uma coluna inteira de "—" em fonte enorme.
**DIAGNOSE:** Em uma TV/projeção, ruído visual amplificado.
**RECOMMEND:** Renderização condicional do header e da célula:
```ts
const hasAnyObservations = exercises.some(ex => ex.observations?.trim());
// usar hasAnyObservations para condicionalmente renderizar <th> e <td>
```
**PRESERVATION CHECK:** YES — a coluna **e** a string permanecem disponíveis sempre que **alguma** linha tiver observação. Nenhum dado é apagado, nenhuma coluna é removida do schema.
**EFFORT:** S | **RISK:** LOW.
**ALEX_TRANSLATION:** Hoje a coluna "OBS" aparece com travessão em todas as linhas mesmo quando ninguém tem observação. A correção esconde a coluna nessa situação e a mostra de novo automaticamente quando alguém tiver uma observação.

### 7.2 PrescriptionCard — mesma coluna OBS + coluna Método também escassa

**LOCATE:** [src/components/PrescriptionCard.tsx:300,309,320,325](src/components/PrescriptionCard.tsx#L300)
**RECOMMEND:** Mesma renderização condicional para OBS e Método. Padronizar marcador vazio em `—` (em-dash) — hoje usa `-` (hyphen) inconsistente com Modo TV. Carga e RIR geralmente têm dado por linha, manter como hoje (apenas trocar `-` por `—` para consistência).
**PRESERVATION CHECK:** YES.
**EFFORT:** S | **RISK:** LOW.

### 7.3 SessionDetailDialog — Observações com 5 colunas "—"-elegíveis

**LOCATE:** [src/components/SessionDetailDialog.tsx:329,346-381](src/components/SessionDetailDialog.tsx#L329)
**RECOMMEND:** `hasAnyObservations` análogo, esconder header/célula condicionalmente. Sets/Reps/Carga raramente vazios, deixar como está; apenas padronizar `—`.
**PRESERVATION CHECK:** YES.
**EFFORT:** S | **RISK:** LOW.

### 7.4 Inconsistência de marcador vazio: `-` vs `—`

| LOCATE | Atual |
|---|---|
| [PrescriptionCard.tsx:300,309,320,325](src/components/PrescriptionCard.tsx#L300) | `"-"` (hyphen) |
| [PrescriptionTVMode.tsx:146,154,168,173](src/components/PrescriptionTVMode.tsx#L146) | `"—"` (em-dash) |
| [StudentsComparisonPage.tsx:608](src/pages/StudentsComparisonPage.tsx#L608) | `"—"` |
| [ExerciseLoadHistoryPopover.tsx:122](src/components/ExerciseLoadHistoryPopover.tsx#L122) | `"—"` |

**RECOMMEND:** Padronizar em `—` (em-dash) globalmente.
**PRESERVATION CHECK:** YES.
**EFFORT:** S | **RISK:** LOW.

---

## 8. Duplicidade de Informação e Ações

### 8.1 PrescriptionCard — 4 botões + dropdown (já documentado em 2.2)

**Redundância:** todas as 4 ações vivem fora do menu overflow e o card title não é clicável. O menu overflow só carrega Mover/Remover/Excluir.
**RECOMMEND:** Hierarquia já proposta em 2.2 (primário Registrar Sessão, ghost Modo TV). Adicionalmente, **duplicar** "Editar" como item no menu overflow (não remover do header). O dropdown vira home secundário para muscle memory.
**PRESERVATION CHECK:** YES — duplicar caminhos só **adiciona**.
**EFFORT:** S | **RISK:** LOW.

### 8.2 PrescriptionsPage — 3 entrypoints de criação no header

**LOCATE:** [src/pages/PrescriptionsPage.tsx:309-362](src/pages/PrescriptionsPage.tsx#L309)
**Redundância:** "Gerar com IA", "Importar Word" e "Nova Prescrição" são os 3 caminhos de criação. "Nova Prescrição" é o canônico.
**RECOMMEND:** Manter "Nova Prescrição" como `default` (primário). Os outros dois também presentes na linha — apenas com `border` 1px (correção 2.1) eles ficam visualmente menores. **Adicionalmente** **duplicar** "Gerar com IA" e "Importar Word" como itens dentro do `MoreVertical` dropdown da linha 311 (duplicação aditiva — mantém o botão visível e adiciona acesso pelo menu).
**PRESERVATION CHECK:** YES — só adiciona caminhos; nenhum botão removido.
**EFFORT:** S | **RISK:** LOW.

### 8.3 StudentsPage — card só tem 1 caminho de "Detalhes"

**LOCATE:** [src/pages/StudentsPage.tsx:110-252](src/pages/StudentsPage.tsx#L110)
**Diagnóstico observacional:** O card tem `card-interactive` (sugere clicabilidade), mas **somente** o botão "Detalhes" navega. O nome/avatar inteiros não são clicáveis. Para um produto premium, a expectativa do usuário é "clico no card e abre o aluno".
**RECOMMEND:** **Adicionar** caminho silencioso: `onClick` no avatar+nome (linhas 114-130) navegando para o detalhe — botão "Detalhes" continua sendo a affordance visual primária.
**PRESERVATION CHECK:** YES — caminho existente não removido; apenas adicionado segundo caminho.
**EFFORT:** S | **RISK:** LOW.

### 8.4 SessionsPage — row click + dropdown "Ver Detalhes" (correto, manter)

**LOCATE:** [src/pages/SessionsPage.tsx:467-535](src/pages/SessionsPage.tsx#L467)
**Diagnóstico:** Esta redundância está correta — row click é primário, dropdown é caminho de teclado/acessibilidade.
**RECOMMEND:** Nenhuma alteração.

### 8.5 StudentDetailPage — 3 entrypoints de "Registrar Sessão"

**LOCATE:** [src/pages/StudentDetailPage.tsx:284-292](src/pages/StudentDetailPage.tsx#L284), [:492-499](src/pages/StudentDetailPage.tsx#L492), [PersonalizedTrainingDashboard.tsx:328-336](src/components/PersonalizedTrainingDashboard.tsx#L328)
**Diagnóstico:** Header CTA + empty-state CTA + dashboard CTA — 3 botões `default` ao mesmo tempo na mesma página em estados diferentes. Esperado, mas só **um** deveria ser `default` por vez.
**RECOMMEND:** Header CTA permanece `default`; empty-state CTA → `outline`; dashboard CTA → `outline`.
**PRESERVATION CHECK:** YES — só peso visual.
**EFFORT:** S | **RISK:** LOW.

### 8.6 GlobalSearch + Sidebar + breadcrumbs (correto, manter)

Três sistemas de navegação coexistem por design: sidebar (novato), GlobalSearch (power user), breadcrumbs (orientação). **Não tocar.**

---

## 9. Consistência Visual Geral

### 9.1 Card border-radius

| LOCATE | Atual | Proposta |
|---|---|---|
| [StudentDetailPage.tsx:193](src/pages/StudentDetailPage.tsx#L193) | `rounded-xl` | remover (deixar default `rounded-lg`) |
| [RecoveryProtocolCard.tsx:34](src/components/RecoveryProtocolCard.tsx#L34) | `rounded-lg` redundante | remover (já é default do `Card`) |

**PRESERVATION CHECK:** YES.
**EFFORT:** S | **RISK:** LOW.

### 9.2 Sombra de card (`shadow-sm` vs `shadow-premium`)

Regra proposta:
- Cards interativos (clicáveis/hover): `card-interactive hover:shadow-premium`.
- Cards estáticos: padrão do shadcn `Card` (`shadow-sm`).
- Remover overrides redundantes (`shadow-sm` em [StudentDetailPage.tsx:193](src/pages/StudentDetailPage.tsx#L193) — já é default do Card).

**PRESERVATION CHECK:** YES.

### 9.3 Spacing — gap-2/gap-xs mistura

Convenção proposta:
- Buttons que tenham ícone+texto: `gap-2` (padrão shadcn).
- Containers de layout (`<div className="flex">`): tokens `gap-xs`/`gap-sm`/`gap-md`.
- [PrescriptionCard.tsx:135,145,154,163](src/components/PrescriptionCard.tsx#L135) — remover `className="gap-2"` redundante (já vem do variant Button).

**PRESERVATION CHECK:** YES.

### 9.4 Tamanho de ícone em contextos iguais

Convenção:
- Dentro de `size="sm"`: `h-4 w-4`.
- Dentro de `size="default"`: `h-4 w-4`.
- Dentro de `size="lg"`: `h-5 w-5`.

Aplicar em [ManualSessionEntry.tsx:438,447](src/components/ManualSessionEntry.tsx#L438) onde existe `h-3 w-3` em botão `size="sm"`.
**PRESERVATION CHECK:** YES.
**EFFORT:** S | **RISK:** LOW.

### 9.5 Tipografia em headers de tabela

Padrão atual: `font-semibold text-center uppercase tracking-wider` consistente em PrescriptionCard / TVMode / SessionDetailDialog. **Nada a corrigir.**

---

## 10. Ergonomia Touch nos Fluxos de Sessão

Apple HIG e WCAG 2.5.5 recomendam ≥44×44 px. shadcn padrões: `sm`=32 px, `default`=40 px, `lg`=48 px. Para tablet de treinador em sessão (atenção dividida), elevar para `default`/`lg` em ações críticas.

### 10.1 ManualSessionEntry — Substituir e Trash em h-6 (24px)

**LOCATE:** [src/components/ManualSessionEntry.tsx:431-448](src/components/ManualSessionEntry.tsx#L431)
**RECOMMEND:** Trash → `h-9 w-9` ghost icon-only com `text-destructive`. Substituir → `h-9 px-3` com `gap-2 text-sm`. Ícone interno `h-4 w-4`.
**PRESERVATION CHECK:** YES — só dimensão.
**EFFORT:** S | **RISK:** LOW.

### 10.2 ManualSessionEntry — Anterior/Próximo em h-8

**LOCATE:** [src/components/ManualSessionEntry.tsx:371-399](src/components/ManualSessionEntry.tsx#L371)
**Diagnóstico:** Navegação crítica entre alunos durante sessão em grupo, em `size="sm"` (32 px).
**RECOMMEND:** `size="default"` (40 px) ou `size="lg"` (48 px).
**PRESERVATION CHECK:** YES.
**EFFORT:** S | **RISK:** LOW.

### 10.3 ManualSessionEntry — Calculator em `size="sm"`

**LOCATE:** [src/components/ManualSessionEntry.tsx:505-515](src/components/ManualSessionEntry.tsx#L505)
**RECOMMEND:** `size="icon"` (40 px) para alinhar com altura do `<Input>` adjacente.
**PRESERVATION CHECK:** YES.
**EFFORT:** S | **RISK:** LOW.

### 10.4 ManualSessionEntry — toolbar de auto-save em h-7

**LOCATE:** [src/components/ManualSessionEntry.tsx:331-348](src/components/ManualSessionEntry.tsx#L331)
**RECOMMEND:** Remover `h-7`; deixar `size="sm"` default (32 px). Aceitável para controles secundários, ainda abaixo do ideal.
**PRESERVATION CHECK:** YES.
**EFFORT:** S | **RISK:** LOW.

### 10.5 RecordGroupSessionDialog — Adicionar aluno em h-7

**LOCATE:** [src/components/RecordGroupSessionDialog.tsx:651](src/components/RecordGroupSessionDialog.tsx#L651)
**RECOMMEND:** Remover `h-7`; usar `size="sm"` (32 px) ou `default` se for ação frequente.
**PRESERVATION CHECK:** YES.

### 10.6 session/ExerciseEditor — Trash + Substituir em sm

**LOCATE:** [src/components/session/ExerciseEditor.tsx:70-76,90-99](src/components/session/ExerciseEditor.tsx#L70)
**RECOMMEND:** Trash → `<Button variant="ghost" size="icon" className="h-9 w-9 text-destructive hover:bg-destructive/10">`. Substituir → `size="icon"` com `h-10 w-10`.
**PRESERVATION CHECK:** YES.

### 10.7 SortableExerciseItem — Plus/Trash em h-8

**LOCATE:** [src/components/SortableExerciseItem.tsx:153-189](src/components/SortableExerciseItem.tsx#L153)
**RECOMMEND:** `h-9 w-9`. Trash com `text-destructive`.
**PRESERVATION CHECK:** YES.

### 10.8 StudentDetailPage — Trash atribuição em h-8

**LOCATE:** [src/pages/StudentDetailPage.tsx:556-563](src/pages/StudentDetailPage.tsx#L556)
**RECOMMEND:** `h-9 w-9` (idealmente `h-11 w-11` para tablet).
**PRESERVATION CHECK:** YES.

---

## 11. Backlog Priorizado (Top 15)

Ordenação por ROI (impacto visível ÷ esforço). **Cada item inclui [PRESERVA-100%].**

| # | Item | Esforço | Risco | Outcome | Tag |
|---|---|---|---|---|---|
| 1 | Reduzir `border-2` → `border` em `button.tsx:24` (variante outline) [PRESERVA-100%] | S | LOW | Resolve sistemicamente o "tudo parece ativo" no app inteiro | [LOVABLE-READY] |
| 2 | Hierarquizar PrescriptionCard header: Registrar Sessão = primário, Modo TV = ghost [PRESERVA-100%] | S | LOW | Treinador identifica a ação principal de imediato | [LOVABLE-READY] |
| 3 | Esconder coluna OBS no Modo TV quando 100% vazia [PRESERVA-100%] | S | LOW | Telão de sessão fica limpo; coluna volta automaticamente | [LOVABLE-READY] |
| 4 | Traduzir tags de benefício de protocolo (mapa em `RecoveryProtocolCard`) [PRESERVA-100%] | S | LOW | Cliente premium não vê inglês na tela de protocolos | [LOVABLE-READY] |
| 5 | Renomear cópia "pasta" → "programa" em Prescrições; trocar ícone Folder→Calendar [PRESERVA-100%] | M | LOW | Modelo mental do treinador casa com a interface | [LOVABLE-READY] |
| 6 | Excluir destrutivo de `outline destructive cheio` → `ghost icon-only destructive` em ExercisesLibrary [PRESERVA-100%] | S | LOW | Vermelho deixa de roubar atenção do Editar | [LOVABLE-READY] |
| 7 | Esconder coluna OBS de PrescriptionCard quando vazia + padronizar `—` [PRESERVA-100%] | S | LOW | Tabela de prescrição limpa | [LOVABLE-READY] |
| 8 | Adicionar tooltips de método (EMOM/AMRAP/SUPERSET) em PrescriptionCard e TVMode [PRESERVA-100%] | M | LOW | Treinador novo entende siglas sem sair da tela | [LOVABLE-READY] |
| 9 | Aumentar tap targets de Trash/Substituir em ManualSessionEntry para h-9 [PRESERVA-100%] | S | LOW | Menos misclick em tablet durante sessão | [LOVABLE-READY] |
| 10 | Substituir "(N ativos)" inline por `<Badge>{N}</Badge>` em ExercisesLibraryPage [PRESERVA-100%] | S | LOW | Sinal positivo de filtro ativo, leitura instantânea | [LOVABLE-READY] |
| 11 | Hierarquizar PrescriptionsPage header (alturas iguais) [PRESERVA-100%] | S | LOW | Linha de ações fica visualmente alinhada | [LOVABLE-READY] |
| 12 | Hierarquizar RecordIndividualSessionDialog footer (ghost·outline·outline·primário) [PRESERVA-100%] | S | LOW | Salvar fica claro como ação principal | [LOVABLE-READY] |
| 13 | Tradução shadcn ui/ defaults (pagination, dialog, sheet, breadcrumb, sidebar) [PRESERVA-100%] | S | LOW | Acessibilidade em PT; "Previous/Next" → "Anterior/Próximo" | [LOVABLE-READY] |
| 14 | Aumentar Anterior/Próximo de ManualSessionEntry para size default ou lg [PRESERVA-100%] | S | LOW | Navegação entre alunos fica clicável em tablet | [LOVABLE-READY] |
| 15 | Padronizar marcador vazio `—` (em-dash) em todas as tabelas [PRESERVA-100%] | S | LOW | Consistência visual entre Modo TV, Card, Detail | [LOVABLE-READY] |

**Total estimado:** 1–2 sprints leves (todos itens S/M, sem alteração de schema, sem alteração de bundle).

---

## 12. Suspected Dead Code (DO NOT REMOVE)

> Documentação somente. **Nada deve ser removido sem revisão manual do Alex.** O default desta seção é: continua intocado.

### 12.1 `src/i18n/pt-BR.json`

- **Arquivo:** [src/i18n/pt-BR.json](src/i18n/pt-BR.json) (~345 linhas).
- **Evidência de uso:** importado em ~20 hooks/pages (ex.: [src/pages/StudentsPage.tsx:6](src/pages/StudentsPage.tsx#L6), [src/hooks/usePrescriptions.ts:4](src/hooks/usePrescriptions.ts#L4)) — **não é dead code**. Listado aqui apenas para registrar que o sistema **não usa** `react-i18next`/`useTranslation` real; é só um JSON consumido por path. Não é necessário migrar agora.

### 12.2 `i18n.ts` (ausência)

- Não foi encontrado um arquivo `i18n.ts` central. Padrão é importar o JSON direto. **Não é dead code, mas é convenção a manter — não introduzir react-i18next agora** (fora do escopo, alto risco de regressão).

### 12.3 Strings SEO em inglês intencionais

- [src/utils/structuredData.ts:27-228](src/utils/structuredData.ts#L27): `Functional Training`, `High Intensity Interval Training`, etc. **Intencional para SEO Schema.org** — não é dead code, não traduzir sem decisão estratégica de público-alvo internacional.

### 12.4 OuraApiDiagnosticsCard — endpoints em inglês

- [src/components/OuraApiDiagnosticsCard.tsx:36-113](src/components/OuraApiDiagnosticsCard.tsx#L36): "Daily Readiness", "Daily Sleep", "VO2 Max" etc. Espelham nomes da API Oura, usados em painel admin. **Recomendação:** manter como está (admin esperando reconhecer endpoints).

### 12.5 Nomes plyometric em inglês em backToBasics.ts

- [src/constants/backToBasics.ts:440-464](src/constants/backToBasics.ts#L440): "Pogo jump", "Box jump", "Depth jump", etc. **Possivelmente intencional** (jargão de academia em PT-BR muitas vezes usa o termo em inglês). Confirmar com Alex antes de traduzir.

---

## 13. Function Unclear — Preserved As-Is

> Componentes/comportamentos cuja função ou intenção visual não pôde ser determinada por leitura de código. Listados para registro. **Nenhuma recomendação de mudança.**

1. **`reopenGroupSession` state** em [PrescriptionsPage.tsx:87-91](src/pages/PrescriptionsPage.tsx#L87) — declarado mas não vi ponto explícito de set fora do dialog. Pode ser usado por fluxo de retomada de sessão; **preservar**.
2. **`folder.depth_level` < 3 cap** em [FolderTree.tsx:139](src/components/FolderTree.tsx#L139) — limite numérico de profundidade. Razão de negócio não documentada. **Preservar**.
3. **`group_with_previous`** em [PrescriptionCard.tsx:32-46](src/components/PrescriptionCard.tsx#L32) — agrupa exercícios em superset visual. Lógica clara; uso/conceito do "grupo" no fluxo de prescrição não totalmente claro. **Preservar**.
4. **`ExerciseLoadHistoryPopover` em modo TV com `darkMode` flag** ([PrescriptionTVMode.tsx:140](src/components/PrescriptionTVMode.tsx#L140)) — popover mostra histórico em fundo escuro. Comportamento parece intencional para projeção. **Preservar**.

---

## 14. Fora de Escopo (registrado para depois)

1. **Dashboard, KPIs, métricas** — explicitamente excluído deste relatório.
2. **Schema do banco** — não tocado; mudanças de cópia em "pasta → programa" são **só** UI; chaves continuam `folders`, endpoints continuam os mesmos.
3. **Migração para `react-i18next` real** — fora do escopo de superfície; alto risco. Apenas adicionar chaves novas no JSON existente.
4. **Renomeação de exercícios no banco** — decisão por exercício, depende de impacto em sessões registradas. Pendente de aprovação por exercício do Alex.
5. **Branding "AI Builder", "Coach Console", "Dashboard"** — decisão de marca pendente do Alex.
6. **`vite.config` / manualChunks / bundle** — explicitamente alto risco; fora deste relatório.
7. **Moratória de 60 dias até 2026-05** — itens podem ser priorizados após a saída da moratória.
8. **Relatório 2 (Dashboard / KPIs)** — quando o Alex pedir, segue separado.

---

## Apêndice — Confirmação de Preservação

Este relatório lista **~50+ recomendações cosméticas**. Cada uma foi avaliada contra o `<NON_NEGOTIABLE_PRINCIPLE>`. Nenhuma:

- Remove botão, link, ação, campo, filtro, coluna, tab ou capacidade do usuário.
- Apaga registros, exercícios, prescrições, protocolos ou pastas.
- Altera schema de banco, endpoints, hooks ou tipos.
- Modifica configuração de bundle ou build.
- Substitui paths/rotas existentes.

**Tipos de mudança usados, em ordem de frequência:**
- **Restyle** (cor, peso, tamanho, espessura de borda) — ~60% das recomendações.
- **Relabel** (troca de string visível) — ~25%.
- **Resize** (h-X / size= padrão maior para tap-target) — ~10%.
- **Reorder/Regroup** (variantes secondary↔outline↔ghost; duplicar caminho em dropdown) — ~5%.

Em qualquer dúvida sobre uma recomendação específica, ela é descartada por padrão. **Em caso de conflito entre estética e função, função vence.**
