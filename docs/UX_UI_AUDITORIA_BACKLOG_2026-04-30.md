# Auditoria UX/UI — Fabrik Performance

Data: 30/04/2026  
Escopo: auditoria de UX/UI no código atual, com foco em uso real por treinadores em dispositivo touch (tablet/celular), operação em desktop e percepção premium.

## 1. Resumo Executivo

O sistema já tem uma fundação visual razoável, com tokens de cor/espaçamento, rotas lazy-loaded, componentes reutilizáveis e alguns padrões de acessibilidade já presentes. O maior risco de UX não é estética: é o fluxo operacional de treino em dispositivo touch, que ainda usa padrões de tabela/desktop e controles pequenos em momentos em que o treinador está em sessão, com atenção limitada. Como ainda não está fechado se o uso principal será celular, tablet ou desktop, a recomendação correta é touch-first/tablet-first para sessão, mobile suportado e desktop denso para operação.

## 2. Achados por Severidade

## Crítico

### D — Registro de sessão em grupo ainda não tem modo touch/tablet no fluxo mais crítico
- **Where:** `src/components/ExerciseFirstSessionEntry.tsx:423`
- **Current behavior:** O treinador registra cargas/reps/observações em uma tabela horizontal com colunas fixas, campos pequenos e rolagem lateral.
- **Problem:** Para o usuário mais crítico, treinador durante atendimento em tablet ou celular, o fluxo exige precisão visual, rolagem horizontal e toques em alvos menores que 44px. Isso aumenta erro operacional e lentidão no meio da sessão.
- **Evidence:**
```tsx
<div className="overflow-x-auto">
  <Table>
    <TableHead className="w-[120px]">Aluno</TableHead>
    <TableHead className="w-[140px]">Exercício</TableHead>
    <TableHead className="w-[140px]">Carga parcial</TableHead>
```
```tsx
<Button
  variant="ghost"
  size="sm"
  className="h-4 w-4 p-0"
  onClick={() => handleRepeatLastLoad(student.id)}
>
```
- **User impact:** treinador / toda sessão em grupo / severity 5
- **Recommendation:** Criar uma variante touch/tablet em cards ou linhas grandes: 1 bloco por aluno dentro do exercício atual, com carga, reps e observação em campos de 44-48px, botão “repetir última” como ação textual, rodapé sticky com “Anterior / Próximo / Salvar”. Manter a tabela densa apenas para desktop/monitor (`lg+`). O código pode preservar a lógica atual e trocar só a camada de apresentação com breakpoints responsivos.
- **Effort:** L

### C — Termos e Política de Privacidade são links falsos no onboarding com consentimento Oura
- **Where:** `src/pages/StudentOnboardingPage.tsx:463`
- **Current behavior:** O aluno aceita cadastro e potencial compartilhamento de dados Oura, mas os links de Termos e Política apenas mostram toast “em desenvolvimento”.
- **Problem:** Há exposição jurídica e de confiança. O fluxo coleta dados pessoais, dados de saúde/biométricos derivados e autorização de compartilhamento, mas não apresenta política real. Isso é relevante para LGPD e para a Lei Brasileira de Inclusão no contexto digital, além de ferir posicionamento premium.
- **Evidence:**
```tsx
<a 
  href="#" 
  className="text-primary hover:underline"
  onClick={(e) => {
    e.preventDefault();
    toast.info("Em breve", {
      description: "Página de Termos de Uso em desenvolvimento"
    });
  }}
>
  Termos de Uso
</a>
```
```tsx
<li>• Prontidão física (recuperação, HRV, FC em repouso)</li>
<li>• Métricas de stress e recuperação</li>
```
- **User impact:** aluno e operação / todo onboarding / severity 5
- **Recommendation:** Antes de escalar, substituir `href="#"` por rotas públicas reais (`/termos`, `/privacidade`, `/oura-consentimento`) ou PDFs versionados. Registrar `accepted_terms_version`, `accepted_privacy_version`, `accepted_oura_scope_version` no banco junto do aceite. Não bloquear o piloto se for interno, mas não deixar isso em produção externa.
- **Effort:** M

### E — Importação de Excel ainda exibe erro técnico cru em vez de diagnóstico operacional
- **Where:** `src/components/ImportSessionsDialog.tsx:903`
- **Current behavior:** Quando há erro, o diálogo mostra contagem e uma lista textual de erros com mensagens vindas do backend/SQL em área pequena.
- **Problem:** A operação precisa saber “o que fazer agora”, não ler exceções técnicas. Em planilhas grandes, a lista com `max-h-32 text-xs` vira ruído; quando o erro é duplicidade, coluna inválida ou RPC ausente, a mensagem deveria agrupar causa e ação.
- **Evidence:**
```tsx
<strong>Importação concluída com erros</strong>
<br />
{status.processed} importada(s), {status.skippedDuplicates} duplicada(s) ignorada(s), {status.mergedDuplicates} exercício(s) atualizado(s), {status.errors.length} erro(s).
<div className="mt-2 max-h-32 overflow-y-auto text-xs">
  {status.errors.map((error, i) => (
    <div key={i} className="mt-1">
      • {error}
    </div>
  ))}
</div>
```
- **User impact:** operação / toda importação de planilha / severity 4
- **Recommendation:** Trocar a lista por resumo categorizado: `Importadas`, `Duplicadas ignoradas`, `Exercícios atualizados`, `Erros por tipo`. Criar `ImportIssuePanel` com agrupamento por `error.code` e CTA: “Baixar relatório CSV de erros”. Mensagens SQL/RPC devem ser mapeadas em `parseImportError()` para linguagem operacional.
- **Effort:** M

### D — Componentes-base usam altura padrão abaixo do alvo táctil
- **Where:** `src/components/ui/button.tsx:45`
- **Current behavior:** Botões `sm` têm 32px, `default` 40px e `icon-sm` 32px; inputs e selects usam 40px.
- **Problem:** WCAG/Apple/Material recomendam alvos próximos de 44px. O app depende de uso touch durante treino, então 32-40px é insuficiente em tablet/celular, principalmente em movimento e com atenção dividida.
- **Evidence:**
```tsx
size: {
  sm: "h-8 px-3 text-xs rounded-sm",
  default: "h-10 px-4 py-2 rounded-md",
  icon: "h-10 w-10 rounded-md",
  "icon-sm": "h-8 w-8 rounded-sm",
}
```
```tsx
"flex h-10 w-full rounded-md border border-input ..."
```
- **User impact:** treinador em dispositivo touch / uso frequente / severity 5
- **Recommendation:** Introduzir `touch` e `touchIcon` no design system (`min-h-11`, `min-w-11`) e usar automaticamente nos fluxos de sessão, Oura, onboarding e dialogs quando o contexto for touch/tablet. Não alterar todos os botões de desktop; aplicar via wrapper `touchTarget` ou classes responsivas por contexto.
- **Effort:** M

## Alto

### G — Navegação admin é plana e mistura operação, técnica e módulos experimentais
- **Where:** `src/constants/navigation.ts:61`
- **Current behavior:** A sidebar lista 11 rotas em um único grupo, incluindo páginas operacionais, admin técnico, AI Builder, Insights e Coach Console.
- **Problem:** O dono/admin recebe muitas decisões de navegação no mesmo nível. Isso reduz findability e passa sensação de sistema em construção, especialmente com módulos pendentes/experimentais.
- **Evidence:**
```tsx
export const ROUTE_CONFIG: RouteDefinition[] = [
  { path: ROUTES.dashboard, label: "Dashboard", icon: Home },
  { path: ROUTES.students, label: "Alunos", icon: Users },
  { path: ROUTES.sessions, label: "Sessões", icon: ClipboardList },
  { path: ROUTES.exercises, label: "Exercícios", icon: Library },
  { path: ROUTES.prescriptions, label: "Prescrições", icon: FileText },
  { path: ROUTES.protocols, label: "Protocolos", icon: Heart },
  { path: ROUTES.adminUsers, label: "Usuários", icon: UserCog, requiresAdmin: true },
  { path: ROUTES.adminDiagnostics, label: "Admin - Diagnóstico Oura", icon: Shield, requiresAdmin: true },
  { path: ROUTES.aiBuilder, label: "AI Builder", icon: Bot, requiresAdmin: true },
```
- **User impact:** operação e dono / diário / severity 4
- **Recommendation:** Agrupar navegação em 3 blocos: `Operação` (Dashboard, Alunos, Sessões), `Programação` (Exercícios, Prescrições, Protocolos), `Admin` (Usuários, Diagnóstico Oura, módulos experimentais). Ocultar `AI Builder`, `Insights`, `Coach Console` atrás de feature flag até ficarem prontos.
- **Effort:** S

### A — Perfil do aluno tem 6 tabs de mesma hierarquia e repete Oura entre abas
- **Where:** `src/pages/StudentDetailPage.tsx:314`
- **Current behavior:** A tela do aluno usa seis tabs igualmente importantes: Treinamento, Visão geral, Sessões, Exercícios, Prescrições, Oura - Histórico. Oura aparece resumido na Visão Geral e detalhado em Histórico.
- **Problem:** O treinador precisa decidir rapidamente “posso treinar hoje?” e “o que registrar?”. A estrutura atual dilui prioridades e exige alternância mental entre abas.
- **Evidence:**
```tsx
<TabsList className="grid w-full grid-cols-6">
  <TabsTrigger value="training">{NAV_LABELS.tabTraining}</TabsTrigger>
  <TabsTrigger value="overview">{NAV_LABELS.tabOverview}</TabsTrigger>
  <TabsTrigger value="sessions">{NAV_LABELS.tabSessions}</TabsTrigger>
  <TabsTrigger value="exercises">{NAV_LABELS.tabExercises}</TabsTrigger>
  <TabsTrigger value="prescriptions">{NAV_LABELS.tabPrescriptions}</TabsTrigger>
  <TabsTrigger value="oura">{NAV_LABELS.tabOura}</TabsTrigger>
</TabsList>
```
- **User impact:** treinador / todo acesso ao aluno / severity 4
- **Recommendation:** Promover `Treinamento` como aba padrão operacional e transformar `Visão geral` em painel executivo compacto. Em tablet/celular, usar nav segmentada com 3 itens principais (`Hoje`, `Histórico`, `Configuração`) e mover `Exercícios/Prescrições/Oura` para subações dentro desses grupos.
- **Effort:** M

### K — Filtro de padrão de movimento em detalhes da sessão usa heurística por nome
- **Where:** `src/components/SessionDetailDialog.tsx:125`
- **Current behavior:** O filtro identifica padrões por `exercise_name.includes(...)`, não por classificação cadastrada no banco.
- **Problem:** Isso contradiz o banco de exercícios e pode classificar errado exercícios em português, variações com nomes próprios ou nomes abreviados. Afeta confiança nos dados e relatórios.
- **Evidence:**
```tsx
switch (movementPatternFilter) {
  case "empurrar": return name.includes("press") || name.includes("supino") || name.includes("development");
  case "puxar": return name.includes("pull") || name.includes("remada") || name.includes("barra fixa");
  case "agachar": return name.includes("squat") || name.includes("agachamento") || name.includes("leg press");
  case "rotacao": return name.includes("twist") || name.includes("rotação") || name.includes("chop");
```
- **User impact:** treinador e dono / revisão de sessões e relatórios / severity 4
- **Recommendation:** Trazer `movement_pattern` da relação com `exercises_library` ou gravar snapshot do padrão no exercício executado no momento da sessão. Enquanto isso, marcar o filtro como “experimental” ou remover da UI para evitar falsa precisão.
- **Effort:** M

### C — Cabeçalhos ordenáveis da tabela de usuários não são botões acessíveis
- **Where:** `src/pages/AdminUsersPage.tsx:336`
- **Current behavior:** Cabeçalhos `<th>` têm `onClick`, cursor pointer e setas visuais.
- **Problem:** Usuário por teclado/leitor de tela não recebe papel de botão nem `aria-sort`. Isso é uma falha WCAG relevante em tela administrativa.
- **Evidence:**
```tsx
<th 
  className="text-left p-4 font-medium cursor-pointer hover:bg-muted-foreground/10 select-none"
  onClick={() => handleSort('name')}
>
  Nome {sortField === 'name' && (sortDirection === 'asc' ? '↑' : '↓')}
</th>
```
- **User impact:** operação / gestão de usuários / severity 4
- **Recommendation:** Trocar conteúdo do `<th>` por `<button type="button">` com `aria-sort` no `<th>` e ícone de ordenação com texto `sr-only`. Adicionar suporte `Enter/Space` nativo pelo botão.
- **Effort:** S

### F — Onboarding do aluno é formulário longo sem etapas nem autosalvamento
- **Where:** `src/pages/StudentOnboardingPage.tsx:189`
- **Current behavior:** Cadastro, foto, dados físicos, objetivos, limitações, lesões, preferências, frequência e consentimento Oura aparecem em uma única tela.
- **Problem:** Para cliente premium 40-60, o formulário aumenta abandono e erro de preenchimento. Em celular, `grid grid-cols-2` pode apertar campos numéricos.
- **Evidence:**
```tsx
<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
  <div className="space-y-4">
```
```tsx
<div className="grid grid-cols-2 gap-4">
  <FormField name="weight_kg" ... />
  <FormField name="height_cm" ... />
</div>
```
- **User impact:** aluno / primeiro contato / severity 4
- **Recommendation:** Dividir em 3 etapas: `Dados básicos`, `Saúde e objetivos`, `Oura e consentimentos`. Adicionar progresso, salvar rascunho local, input masks e validação ao sair da etapa. Em celular, usar 1 coluna para peso/altura; em tablet, 2 colunas podem permanecer.
- **Effort:** M

### I — Cadastro de exercício exige classificação completa demais para criação rápida
- **Where:** `src/components/AddExerciseDialog.tsx:257`
- **Current behavior:** O diálogo de novo exercício abre com dezenas de campos: padrão, categoria, Boyle, risco, lateralidade, plano, estabilidade, superfície, scores, defaults, vídeo, equipamentos.
- **Problem:** Para operação, o custo de cadastrar ou corrigir um exercício é alto. Isso incentiva dados incompletos ou inconsistentes. A riqueza da catalogação é útil, mas precisa ser progressiva.
- **Evidence:**
```tsx
<DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
...
<h3 className="text-sm font-medium text-muted-foreground">Classificação Biomecânica</h3>
...
<h3 className="text-sm font-medium text-muted-foreground">Scores de Classificação (0-5)</h3>
...
<h3 className="text-sm font-medium text-muted-foreground">Equipamentos Necessários</h3>
```
- **User impact:** operação / manutenção do banco de exercícios / severity 4
- **Recommendation:** Criar modo `Cadastro rápido` com nome, categoria, padrão, risco e equipamento; mover scores biomecânicos para seção avançada colapsada com checklist de completude. Mostrar “qualidade do cadastro: básico/completo”.
- **Effort:** M

## Médio

### J — Biblioteca de exercícios carrega páginas grandes em loop no cliente
- **Where:** `src/hooks/useExercisesLibrary.ts:103`
- **Current behavior:** O hook busca até 50 páginas de 1000 exercícios no cliente quando não há filtro restritivo.
- **Problem:** Hoje pode funcionar, mas a percepção de velocidade degrada conforme o banco cresce. Para operação, busca e filtro devem responder rapidamente.
- **Evidence:**
```tsx
const EXERCISES_PAGE_SIZE = 1000;
const EXERCISES_MAX_PAGES = 50;
...
for (let pageIndex = 0; pageIndex < EXERCISES_MAX_PAGES; pageIndex += 1) {
  const { data, error } = await buildPageQuery(pageIndex);
  if (error) throw error;
  if (!data || data.length === 0) break;
  allExercises.push(...(data as ExerciseLibrary[]));
}
```
- **User impact:** operação / uso frequente na biblioteca e busca global / severity 3
- **Recommendation:** Implementar paginação real ou virtualização. Para selects/dialogs, buscar por termo (`min 2 chars`) em vez de carregar tudo. Manter cache por 5min, mas limitar resposta inicial a 100-200 itens.
- **Effort:** M

### A — Detalhe de sessão usa tabela horizontal e filtros fixos dentro de modal
- **Where:** `src/components/SessionDetailDialog.tsx:303`
- **Current behavior:** O modal usa `max-w-4xl`, filtros em linha e tabela com `overflow-x-auto`.
- **Problem:** Em desktop funciona, mas em tablet/celular vira rolagem dentro de modal dentro de tela. Para revisão rápida em touch, cards por exercício são mais legíveis.
- **Evidence:**
```tsx
<DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
...
<div className="flex items-center gap-2">
  <SelectTrigger className="w-[180px]">
...
<div className="overflow-x-auto">
  <Table>
```
- **User impact:** treinador / revisão de sessões em dispositivo touch / severity 3
- **Recommendation:** Usar cards em tablet/celular com exercício, carga, reps e observação empilhados; manter tabela em desktop. Colocar filtros em sheet/accordion em telas menores.
- **Effort:** M

### E — LoadingState não anuncia carregamento para tecnologias assistivas
- **Where:** `src/components/LoadingState.tsx:53`
- **Current behavior:** O componente exibe spinner e texto, mas não tem `role="status"` nem `aria-live`.
- **Problem:** Parte do app usa `LoadingSpinner` acessível, parte usa `LoadingState` silencioso. Isso cria inconsistência e pode prejudicar usuários com leitor de tela.
- **Evidence:**
```tsx
const content = (
  <div className={cn("flex flex-col items-center justify-center gap-md", className)}>
    <Icon 
      className={cn("animate-spin text-primary", sizeClasses[size])} 
      aria-hidden="true"
    />
```
- **User impact:** usuários com tecnologia assistiva / carregamentos frequentes / severity 3
- **Recommendation:** Adicionar `role="status"`, `aria-live="polite"` e `<span className="sr-only">{text}</span>` em `LoadingState`, alinhando com `LoadingSpinner`.
- **Effort:** S

### A — Sugestão assistida de carga tem alta densidade visual na aba Treinamento
- **Where:** `src/components/PersonalizedTrainingDashboard.tsx:414`
- **Current behavior:** Quando há sugestões, cada exercício mostra cinco colunas: última carga, regra, ajuste, carga sugerida, incremento, mais fonte e guardrails.
- **Problem:** A informação é útil, mas a prioridade operacional é “o que fazer agora”. Em tablet/celular, a densidade pode competir com recomendação de treino e sinais de recuperação.
- **Evidence:**
```tsx
<div className="grid grid-cols-1 md:grid-cols-5 gap-2 text-sm">
  <div>
    <p className="text-muted-foreground">Última carga válida</p>
...
  <div>
    <p className="text-muted-foreground">Carga sugerida</p>
```
- **User impact:** treinador / dias com recomendação de carga / severity 3
- **Recommendation:** Em tablet/celular, exibir apenas `Exercício`, `Carga sugerida`, `Status` e um botão “ver regra”. Mover fonte, incremento e guardrails para disclosure. No desktop, manter tabela detalhada.
- **Effort:** S

### G — Página de sessões tem filtros potentes, mas escondidos atrás de estado local e sem presets
- **Where:** `src/pages/SessionsPage.tsx:253`
- **Current behavior:** Filtros ficam colapsados/expandidos manualmente; datas, alunos, prescrições e horários não têm presets operacionais.
- **Problem:** Operação precisa rapidez: “hoje”, “esta semana”, “em edição”, “aluno específico”. Sem presets, cada consulta exige vários cliques.
- **Evidence:**
```tsx
const [filtersOpen, setFiltersOpen] = useState(false);
...
<Button
  variant="ghost"
  size="sm"
  onClick={() => setFiltersOpen(!filtersOpen)}
>
  {filtersOpen ? "Ocultar" : "Mostrar"}
</Button>
```
- **User impact:** operação / consulta diária / severity 3
- **Recommendation:** Adicionar chips fixos acima da tabela: `Hoje`, `Esta semana`, `Em edição`, `Grupo`, `Individual`. Persistir último filtro em URL querystring para compartilhamento e retorno.
- **Effort:** M

### K — Há duplicação de componentes de loading
- **Where:** `src/components/LoadingState.tsx:46` e `src/components/LoadingSpinner.tsx:16`
- **Current behavior:** Existem dois componentes de loading com APIs e acessibilidade diferentes.
- **Problem:** A duplicação cria inconsistência visual e técnica. Um tem `role=status`; outro não.
- **Evidence:**
```tsx
export const LoadingState = ({ text = "Carregando...", size = "default" ... }) => { ... }
```
```tsx
export const LoadingSpinner = ({ size = "md", text = "Carregando..." ... }) => {
  return (
    <div role="status" aria-live="polite">
```
- **User impact:** todos / carregamentos em várias telas / severity 3
- **Recommendation:** Tornar `LoadingState` o componente canônico e fazer `LoadingSpinner` delegar para ele, ou o inverso. Criar variações `page`, `inline`, `cardSkeleton`.
- **Effort:** S

### L — Font stack e tom visual são funcionais, mas ainda genéricos para posicionamento premium
- **Where:** `src/index.css:83`
- **Current behavior:** O design system usa Inter/system como fonte base e uma linguagem visual eficiente, porém bastante padrão SaaS.
- **Problem:** Para ticket R$3.900-4.500/mês, a percepção premium precisa de mais identidade em telas-chave: onboarding, relatório, dashboard do dono e perfil do aluno.
- **Evidence:**
```css
--font-sans: 'Inter', system-ui, -apple-system, sans-serif;
--font-size-xs: 0.75rem;
--font-size-sm: 0.875rem;
--font-size-base: 1rem;
```
- **User impact:** dono, operação e clientes em telas compartilhadas / recorrente / severity 3
- **Recommendation:** Sem trocar tudo, aplicar uma fonte display/serif premium apenas em headings e relatórios (`font-display`), melhorar espaçamento de cards principais e reduzir aparência de dashboard genérico nas telas que clientes veem.
- **Effort:** M

## Baixo

### H — Movimento existe, mas não há política clara de motion por contexto
- **Where:** `src/components/StudentOverviewDashboard.tsx:54`
- **Current behavior:** Há uso de `framer-motion` com stagger/spring na visão geral e `animate-fade-in` em tabs.
- **Problem:** Não está quebrado. Porém, sem política de motion, telas operacionais podem parecer mais lentas ou chamativas que o necessário.
- **Evidence:**
```tsx
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08
    }
  }
};
```
- **User impact:** todos / percepção ocasional / severity 2
- **Recommendation:** Definir regra: motion expressivo apenas em onboarding/relatórios; motion mínimo em treino e operação. Respeitar `prefers-reduced-motion`.
- **Effort:** S

### B — Tokens existem, mas muitos componentes ainda usam medidas soltas
- **Where:** `src/components/ExerciseFirstSessionEntry.tsx:446`
- **Current behavior:** Há uso de `text-[9px]`, `max-w-[110px]`, `h-4`, `w-[140px]` em fluxos críticos.
- **Problem:** Isso enfraquece consistência do design system e dificulta manutenção. Nem todo uso é errado, mas padrões críticos deveriam ter tokens/variants.
- **Evidence:**
```tsx
<p className="text-[9px] text-muted-foreground/70 italic truncate max-w-[110px]" title={last.observations}>
```
- **User impact:** todos / manutenção e polimento / severity 2
- **Recommendation:** Criar variants para `compactMetric`, `microHint`, `touchRowAction` e substituir medidas arbitrárias nos fluxos de sessão. Não precisa limpar o app inteiro de uma vez.
- **Effort:** M

### J — Busca global é útil, mas não mostra erros nem prioriza resultados por contexto
- **Where:** `src/components/GlobalSearch.tsx:46`
- **Current behavior:** A busca dispara três consultas paralelas e, em erro, apenas limpa os resultados.
- **Problem:** Para operação, “nenhum resultado” e “erro de busca” parecem iguais. Além disso, resultados não são ranqueados por frequência/recência.
- **Evidence:**
```tsx
try {
  const [studentsData, prescriptionsData, exercisesData] = await Promise.all([
    supabase.from("students").select("id, name").ilike("name", `%${searchQuery}%`).limit(5),
...
} catch (error) {
  logger.error("Erro ao buscar:", error);
  setResults([]);
}
```
- **User impact:** operação e dono / uso frequente se adotado / severity 2
- **Recommendation:** Adicionar estado de erro no CommandDialog e ranking simples: alunos ativos primeiro, sessões recentes quando query parecer data/nome, e atalhos de navegação.
- **Effort:** M

### L — Card de ferramentas DEV é corretamente protegido, mas aparece no preview e polui validação visual
- **Where:** `src/components/dashboard/DevToolsCard.tsx:61`
- **Current behavior:** O card aparece em `import.meta.env.DEV`, o que inclui preview/dev local do Lovable.
- **Problem:** Não é problema de produção se o build final define `DEV=false`, mas confunde validação do usuário e reduz percepção premium no ambiente onde vocês mais testam.
- **Evidence:**
```tsx
if (!import.meta.env.DEV) return null;
...
<CardTitle className="text-base">Ferramentas de Desenvolvimento</CardTitle>
<Badge variant="outline" className="text-xs">DEV</Badge>
```
- **User impact:** dono/testes internos / recorrente no preview / severity 2
- **Recommendation:** Trocar para feature flag explícita `VITE_SHOW_DEV_TOOLS=true` e esconder por padrão no Lovable preview, ou mover para `/admin/devtools`.
- **Effort:** S

## 3. Padrões Transversais

1. **Fluxo touch/tablet crítico ainda não tem padrão próprio.** O sistema tem responsividade geral, mas os fluxos de treino usam tabelas, campos pequenos e rolagem horizontal. Corrigir isso com um `TouchSessionEntry` e `TouchSessionDetail` reaproveitáveis é melhor que ajustes pontuais.

2. **Acessibilidade está parcialmente tratada, mas inconsistente.** Há `SkipToContent`, `aria-label` em vários botões e `LoadingSpinner` acessível. Porém ainda existem cabeçalhos clicáveis sem semântica, `LoadingState` sem `role=status` e alvos de toque pequenos. Isso deve virar checklist de PR.

3. **O design system existe, mas ainda é contornado por classes arbitrárias.** Tokens de spacing, font, radius e shadow estão definidos em `tailwind.config.ts` e `src/index.css`, mas componentes críticos usam `text-[9px]`, `w-[140px]`, `h-4`, `max-h-[90vh]`. O problema não é falta de tokens; é falta de aplicação consistente.

4. **Fluxos operacionais precisam de “próxima ação”, não apenas estado.** Importação, Oura, relatórios e sessão exibem dados, mas nem sempre respondem “o que faço agora?”. Para operação, cada erro deve ter causa provável e ação recomendada.

5. **Premium não é só visual.** O que mais derruba percepção premium hoje é fricção: link falso de termos, mensagens técnicas, campos pequenos, módulos experimentais visíveis e telas densas demais.

6. **Categoria sem achado bloqueante isolado:** H/micro-interações não tem falha crítica atual. A recomendação é padronização, não correção urgente.

## 4. Backlog Priorizado

1. **Touch/tablet-first no registro de sessão em grupo** — Critical / L — Reduz erro e lentidão no principal momento operacional do treinador sem descartar desktop denso.
2. **Termos, privacidade e consentimento Oura versionados** — Critical / M — Remove exposição jurídica e melhora confiança no primeiro contato.
3. **Alvos touch ≥44px nos fluxos de treino** — Critical / M — Melhora usabilidade imediata em tablet/celular sem inflar a interface desktop.
4. **Importação Excel com resumo categorizado e relatório de erros** — Critical / M — Transforma falhas técnicas em operação segura.
5. **Remover heurística por nome em filtros de padrão de movimento** — High / M — Evita falsa precisão em análise de sessões.
6. **Reorganizar sidebar por grupos e feature flags** — High / S — Reduz ruído e tira módulos experimentais do caminho.
7. **Corrigir sortable table headers com `button` + `aria-sort`** — High / S — Fecha falha acessível simples em tela admin.
8. **Onboarding em 3 etapas com rascunho local** — High / M — Reduz abandono e melhora experiência do cliente premium.
9. **Cadastro rápido de exercício + avançado colapsado** — High / M — Aumenta qualidade do banco sem travar operação.
10. **Cards touch para detalhe de sessão** — Medium / M — Melhora leitura rápida em tablet/celular sem perder tabela desktop.
11. **Unificar `LoadingState` e `LoadingSpinner`** — Medium / S — Padroniza feedback e acessibilidade.
12. **Paginação/virtualização real na biblioteca de exercícios** — Medium / M — Prepara escala sem lentidão perceptiva.
13. **Simplificar Sugestão Assistida de Carga em touch/tablet** — Medium / S — Mantém decisão principal visível para o coach.
14. **Presets de filtro na página de sessões** — Medium / M — Acelera rotina da operação.
15. **Feature flag explícita para DevTools no preview** — Low / S — Reduz ruído visual e confusão em validação.

## 5. Fora de Escopo (Registrado para Depois)

1. **Redesign visual completo.** Não recomendo agora. O sistema tem base visual suficiente; o gargalo atual é fluxo operacional e consistência.

2. **Troca global de tipografia.** Pode melhorar premium, mas deve vir depois de estabilizar treino, importação, Oura e relatórios. Aplicar primeiro só em relatórios/onboarding.

3. **Gamificação e portal do aluno.** São módulos úteis, mas fora do objetivo atual de deixar o app interno 100% funcional.

4. **Automação de marketing/WhatsApp.** Deve esperar os fluxos core ficarem previsíveis; caso contrário, a automação amplifica dados ruins.

5. **Reescrever biblioteca de exercícios.** Não é necessário. A recomendação é criar cadastro rápido, melhorar filtros e usar paginação/virtualização, preservando a estrutura rica já existente.

6. **Motion/animations avançadas.** Não há falha crítica. Padronizar o mínimo é suficiente para agora.
