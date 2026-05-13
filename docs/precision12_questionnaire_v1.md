# Questionário Precision 12 — Especificação canônica v1

**Status:** congelado para implementação E3 (link mágico + edge function + UI pública).

**Última atualização:** 2026-05-13.

**Versionamento:** este documento define `questionnaire_version = 'precision12_v1'`. Qualquer mudança no conteúdo, ordem, opções ou regras condicionais requer bump de versão (`precision12_v2`, …) + migration aditiva. Não editar este doc sem incrementar versão.

---

## 1. Resumo executivo

- **Fonte original**: PDF `Questionário de Entrada — Fabrik Precision 12 - Google Formulários.pdf` (54 perguntas em 11 blocos).
- **Versão final (este doc)**: **60 itens em 8 telas**, distribuídos em **54 perguntas sempre visíveis + 6 perguntas condicionais**, gerando **63 campos persistidos** + 1 campo generated (`parq_blocked`) + 5 campos auto (`assessment_id`, `questionnaire_version`, `submitted_at`, `created_at`, `updated_at`).
- **Schema destino**: tabela `public.questionnaire_responses` (criada em PR #113, ajustada em PRs #114-#118). A maior parte dos campos já existe; a Seção 9 lista os **6 campos novos** que requerem migration aditiva mínima.
- **Decisões clínicas aplicadas**: M/F binário, PAR-Q soft block (aluno completa, status do parent vira `blocked`), Q18 captura nível de experiência de treino + atividade últimos 30 dias (triagem inspirada em pré-participação ACSM, mas **não é classificação clínica formal**).
- **IA-ready**: toda resposta fechada salva como **código estável** em inglês snake_case, não como label PT. Labels visíveis vivem em `src/constants/precision12Questionnaire.ts` (front-end), facilmente intercambiáveis sem migration de dados.

### Contagem detalhada

| Categoria | Total |
|---|---|
| Itens visíveis ao aluno (sempre exibidos) | 54 |
| Itens visíveis ao aluno (condicionais) | 6 |
| **Total de perguntas no fluxo** | **60** |
| Campos persistidos no banco | 63 |
| Campos generated (`parq_blocked`) | 1 |
| Campos auto (id, version, timestamps) | 5 |
| **Campos novos requeridos por migration** | **6** |

A diferença entre **60 itens visíveis** e **63 campos persistidos** vem da Tela 8 (consentimento): 1 pergunta visível agrupa 4 checkboxes obrigatórios, cada um persistido em coluna separada.

---

## 2. Decisões congeladas (não rediscutir)

| # | Decisão | Origem | Impacto |
|---|---|---|---|
| D1 | Sexo apenas `M` / `F` (não há "Outro" no form) | Alex 2026-05-13 | `gender` CHECK preservado |
| D2 | Q18 = uma pergunta única que devolve `training_experience_level` + `active_last_30_days` | Alex 2026-05-13 (correção: removido nome "ACSM" para não confundir com classificação clínica formal) | derivação client-side a partir de `exercise_history` (6 códigos), inspirada em triagem de experiência/atividade |
| D3 | PAR-Q **soft block** | Alex 2026-05-13 | aluno completa o form; status do `assessment` vira `blocked` se qualquer parq_q*=true |
| D4 | PAR-Q positivo → `assessment.status = 'blocked'`. PAR-Q negativo + form completo → `status = 'completed'`. | Alex 2026-05-13 | edge function `submit-precision12-questionnaire` aplica regra |
| D5 | Adicionar: lesão/cirurgia/restrição relevante (**sem limite temporal** — mesmo antiga, se ainda influenciar treino) | Alex 2026-05-13 (correção) | campo `injury_surgery_history text` (migration) |
| D6 | Adicionar: **dias viáveis** de treino (quais dias da semana) — distinto de `weekly_frequency` (quantidade) | Alex 2026-05-13 (correção: campo novo, não reuso) | campo novo `training_available_days text[]` (migration) |
| D7 | Adicionar: recursos fora da Fabrik | Alex 2026-05-13 | campo novo `external_training_resources text[]` (migration) |
| D8 | Adicionar: barreira principal de adesão | Alex 2026-05-13 | campo novo `primary_adherence_barrier text` (migration) |
| D9 | Pergunta de medicamentos: **boolean explícito + texto condicional** | Alex 2026-05-13 (correção: persistir flag boolean além do texto) | campos novos `uses_medications boolean` + `medications_continuous text` (migration) |
| D10 | Caminho de entrega = link mágico (padrão Oura) | PR #116 | edge function bypassa RLS via service role |
| D11 | `birthdate` obrigatório no form **somente se** `students.birth_date IS NULL`; senão pré-preenchido e oculto | Alex 2026-05-13 (correção) | edge function valida invariante; UI esconde campo se já existe |
| D12 | Whoop persiste como `'whoop'` (não `'other'`); `wearable_brand` enum: `oura` / `whoop` / `other` (reservado pra wearables futuros) | Alex 2026-05-13 (correção) | aplicado em Tela 7.2 |

---

## 3. Mapeamento 11 blocos PDF → 8 telas condensadas

| Tela | Título exibido ao aluno | Blocos PDF cobertos | Itens (sempre + cond.) | Campos persistidos | Tempo estimado |
|---|---|---|---|---|---|
| 1 | Boas-vindas + Identificação | 1 | 7 + 0 = **7** | 7 | ~1 min |
| 2 | Triagem de segurança (PAR-Q) | 2 | 7 + 0 = **7** | 7 (+ 1 generated) | ~1 min |
| 3 | Objetivos e histórico | 3 + 4 | 6 + 0 = **6** | 6 | ~2 min |
| 4 | Disponibilidade e recursos | 5 + novas (D6, D7, D8) | 8 + 0 = **8** | 8 | ~2 min |
| 5 | Saúde, dor e medicação | 6 + 9 + novas (D5, D9) | 9 + 4 = **13** | 13 | ~3 min |
| 6 | Sono, recuperação e estresse | 7 | 5 + 0 = **5** | 5 | ~1 min |
| 7 | Wearable + perfil comportamental | 8 + 10 | 11 + 2 = **13** | 13 | ~3 min |
| 8 | Consentimento | 11 | 1 + 0 = **1** | 4 (sub-checks) | ~30 s |
| **Total** | — | — | **54 + 6 = 60** | **63** + 1 generated | **~13 min** |

**Mudanças vs PDF original**:
- **0 perguntas removidas** (todas as 54 originais preservadas)
- **6 perguntas convertidas em condicionais explícitas** (5.2, 5.3, 5.6, 5.8, 7.2, 7.3)
- **6 perguntas/campos novos** adicionados conforme D5-D9 e correções: `training_available_days`, `external_training_resources`, `primary_adherence_barrier`, `uses_medications`, `medications_continuous`, `injury_surgery_history`

---

## 4. Especificação detalhada por tela

### Convenções

- **Código interno**: snake_case em inglês, estável entre versões. NUNCA salvar label PT no banco.
- **Tipo de input**: `text` (curto), `textarea` (longo), `date`, `radio` (1 opção), `checkbox` (N opções), `likert` (1-5), `boolean` (sim/não).
- **Obrigatório**: ✓ visível obrigatório · ◯ opcional · ⤷ condicional (mostrado só se dependência satisfeita).
- **Derivação IA**: como o coach ou modelo de IA vai usar a resposta no PDF inicial (E6) e Coach Console (E4).

### Tela 1 — Boas-vindas + Identificação

| # | Texto exato | Tipo | Obr | Opções (label PT → código interno) | Campo banco | Derivação IA |
|---|---|---|---|---|---|---|
| 1.1 | "Nome completo" | text | ✓ | — | `full_name` | citado no PDF inicial; dedup com `students.name` |
| 1.2 | "E-mail" | text | ✓ | — | `email` | confirmação cadastro + envio PDF inicial |
| 1.3 | "Telefone / WhatsApp" | text | ✓ | — | `phone` | canal de comunicação coach-aluno |
| 1.4 | "Data de nascimento" | date | ✓ se ausente em `students.birth_date`; pré-preenchido e oculto caso contrário (D11) | — (dd/mm/aaaa) | `birthdate` | derivar idade pra ranges clínicos (Tanaka, ACSM) |
| 1.5 | "Sexo biológico" | radio | ✓ | Masculino → `M` · Feminino → `F` | `gender` | lookups Mathiowetz/ACSM/handgrip/VO₂ |
| 1.6 | "Profissão" | text | ◯ | — | `profession` | contexto qualitativo (rotina, estresse) |
| 1.7 | "Como é sua rotina principal hoje?" | radio | ✓ | Trabalho majoritariamente sentado → `sedentary_work` · Trabalho com muita locomoção → `active_work` · Rotina mista → `mixed_routine` · Turnos variáveis → `variable_shifts` · Outro → `other` | `routine` | usado pra dimensionar dose inicial de treino |

### Tela 2 — Triagem de segurança (PAR-Q)

**Aviso visível**: "Responda com atenção. Se responder Sim a qualquer pergunta, recomendamos avaliação médica prévia. Você pode completar o questionário normalmente — o coach Fabrik vai revisar antes de liberar o programa."

| # | Texto exato | Tipo | Obr | Opções | Campo banco | Derivação IA |
|---|---|---|---|---|---|---|
| 2.1 | "Algum médico já disse que você possui problema cardíaco e recomendou atividade física apenas com supervisão?" | radio | ✓ | Sim → `true` · Não → `false` | `parq_q8_heart_condition` | flag → `parq_blocked` (generated) |
| 2.2 | "Você sente ou já sentiu dor no peito ao praticar atividade física?" | radio | ✓ | Sim/Não | `parq_q9_chest_pain_exercise` | idem |
| 2.3 | "Você sentiu dor no peito no último mês?" | radio | ✓ | Sim/Não | `parq_q10_chest_pain_recent` | idem |
| 2.4 | "Você já perdeu a consciência ou caiu por tontura?" | radio | ✓ | Sim/Não | `parq_q11_loss_consciousness_or_dizziness_fall` | idem |
| 2.5 | "Você possui problema ósseo ou articular que pode piorar com atividade física?" | radio | ✓ | Sim/Não | `parq_q12_bone_joint` | idem |
| 2.6 | "Algum médico já prescreveu medicamento para pressão arterial ou coração?" | radio | ✓ | Sim/Não | `parq_q13_blood_pressure_meds` | idem |
| 2.7 | "Existe algum outro motivo de saúde que possa impedir sua prática segura de exercícios?" | radio | ✓ | Sim/Não | `parq_q14_other_health_reason` | idem |

**Comportamento**: nenhuma das 7 interrompe o fluxo. Generated column `parq_blocked` = OR de todas. No submit final, se `parq_blocked = true` → assessment `status = 'blocked'` + aviso "⚠️ Avaliação prévia necessária" na tela de confirmação.

### Tela 3 — Objetivos e histórico

| # | Texto exato | Tipo | Obr | Opções | Campo banco | Derivação IA |
|---|---|---|---|---|---|---|
| 3.1 | "Quais são seus principais objetivos com este programa? (selecione até 2)" | checkbox (max 2) | ✓ | Reduzir gordura corporal → `reduce_body_fat` · Ganhar massa muscular → `gain_muscle` · Melhorar performance física → `improve_performance` · Melhorar mobilidade/flexibilidade → `improve_mobility` · Reduzir dores/desconfortos → `reduce_pain` · Melhorar saúde geral/longevidade → `improve_health_longevity` · Melhorar energia e recuperação → `improve_energy_recovery` · Outro → `other` | `goals` (text[]) | objetivos no PDF inicial + coach review |
| 3.2 | "Descreva com mais detalhes o que você quer alcançar" | textarea | ◯ | — | `goal_details` | contexto qualitativo |
| 3.3 | "Você já tentou alcançar esse objetivo antes? Se sim, o que funcionou ou não funcionou." | textarea | ◯ | — | `previous_attempts` | calibração coach (evitar erros passados) |
| **3.4** | **"Como você descreve sua prática de exercícios HOJE?"** (Q18 reformulada — D2) | radio | ✓ | Nunca treinei com regularidade → `never_regular` · Já treinei, mas estou parado(a) há mais de 1 mês → `paused_over_1_month` · Estou voltando — treinando há menos de 1 mês → `returning_under_1_month` · Treino regularmente há 1 a 6 meses → `regular_1_to_6_months` · Treino regularmente há 6 meses a 2 anos → `regular_6_months_to_2_years` · Treino regularmente há mais de 2 anos → `regular_over_2_years` | `exercise_history` | **dupla derivação**: `training_experience_level` (sedentary/transition/beginner/intermediate/advanced) + `active_last_30_days` (boolean) — ver Seção 7.1 |
| 3.5 | "Como você avalia seu condicionamento físico atual?" | likert 1-5 | ✓ | 1 = Muito baixo … 5 = Muito alto | `fitness_self_rating` | benchmark subjetivo vs experiência declarada + Oura HRV |
| 3.6 | "Como você avalia sua satisfação com seu corpo?" | likert 1-5 | ✓ | 1 = Muito insatisfeito … 5 = Muito satisfeito | `body_satisfaction` | calibração wording PDF (motivação intrínseca vs extrínseca) |

### Tela 4 — Disponibilidade e recursos

| # | Texto exato | Tipo | Obr | Opções | Campo banco | Derivação IA |
|---|---|---|---|---|---|---|
| 4.1 | "Quanto tempo real você tem disponível para treinar por sessão?" | radio | ✓ | Menos de 30 min → `under_30` · 30 a 45 min → `30_to_45` · 45 a 60 min → `45_to_60` · Mais de 60 min → `over_60` | `session_duration` | dimensiona volume da prescrição |
| 4.2 | "Quantas vezes por semana você consegue treinar de forma realista?" | radio | ✓ | 1 / 2 / 3 / 4 / 5 / 6 / 7 | `weekly_frequency` (int) | frequência base da prescrição (quantidade) |
| **4.3** | **"Quais dias da semana você tem disponíveis para treinar?"** (nova — D6) | checkbox | ✓ (≥ 1) | Segunda → `monday` · Terça → `tuesday` · Quarta → `wednesday` · Quinta → `thursday` · Sexta → `friday` · Sábado → `saturday` · Domingo → `sunday` | `training_available_days` (text[], **novo**) | planejamento operacional real (distinto de 4.2 que é só quantidade) |
| 4.4 | "Em qual período do dia você tende a treinar?" | radio | ✓ | Manhã → `morning` · Tarde → `afternoon` · Noite → `evening` · Varia muito → `variable` | `training_period` | input pra cronotipo + dose Oura |
| 4.5 | "Você viaja com frequência ou tem rotina instável?" | radio | ✓ | Sim/Não | `frequent_traveler` (boolean) | planejamento de protocolos portáteis |
| **4.6** | **"Além da Fabrik, quais recursos de treino você tem disponíveis?"** (nova — D7) | checkbox | ◯ | Academia perto de casa → `gym_near_home` · Academia perto do trabalho → `gym_near_work` · Equipamento em casa (peso livre) → `home_free_weights` · Equipamento em casa (cardio) → `home_cardio` · Espaços ao ar livre → `outdoor` · Aplicativo de treino guiado → `guided_app` · Personal trainer particular → `external_trainer` · Nenhum → `none` · Outro → `other` | `external_training_resources` (text[], **novo**) | adapta protocolo pra contexto real do aluno |
| 4.7 | "Descreva sua rotina atual de trabalho, família e horários" | textarea | ◯ | — | `routine_description` | contexto qualitativo |
| **4.8** | **"Qual é a maior barreira que pode te tirar do programa?"** (nova — D8) | radio | ✓ | Falta de tempo → `time` · Falta de energia/cansaço → `energy_fatigue` · Falta de motivação → `motivation` · Dor ou desconforto → `pain_discomfort` · Falta de resultados visíveis → `lack_of_results` · Custo financeiro → `financial_cost` · Outro → `other` | `primary_adherence_barrier` (text, **novo**) | flag preventivo de churn no Coach Console (E4) |

### Tela 5 — Saúde, dor e medicação

| # | Texto exato | Tipo | Obr | Opções | Campo banco | Derivação IA |
|---|---|---|---|---|---|---|
| 5.1 | "Você sente atualmente alguma dor, desconforto ou limitação ao se movimentar?" | radio | ✓ | Sim, no dia a dia → `daily` · Sim, ao treinar → `during_training` · Não → `none` | `pain_status` | flag de cuidado movimentos específicos |
| 5.2 | ⤷ "Se sim, quais movimentos causam dor ou desconforto?" | checkbox | ⤷ (se 5.1 ≠ `none`) | Agachar/sentar/levantar → `squat_sit_stand` · Empurrar → `push` · Puxar → `pull` · Girar o tronco → `trunk_rotation` · Correr/pular → `run_jump` · Sustentar carga → `load_bearing` · Outro → `other` | `pain_movements` (text[]) | input pra triagem de exercícios prescritos |
| 5.3 | ⤷ "Descreva o local da dor e há quanto tempo sente isso" | textarea | ⤷ (se 5.1 ≠ `none`) | — | `pain_location` | contexto qualitativo |
| 5.4 | "Qual é sua maior dificuldade hoje em relação ao exercício?" | checkbox | ◯ | Falta de tempo → `time` · Falta de orientação personalizada → `lack_of_guidance` · Falta de motivação → `motivation` · Dor ou desconforto → `pain_discomfort` · Falta de resultados → `lack_of_results` · Outro → `other` | `biggest_difficulty` (text[]) | calibração coach (diferente de 4.7: aqui é diagnóstico passado, lá é risco futuro) |
| 5.5 | "Você possui alguma doença, condição de saúde relevante ou recomendação médica que possa influenciar sua prática de exercícios?" | radio | ✓ | Sim/Não | `has_medical_condition` | sinaliza necessidade de pré-aprovação médica |
| 5.6 | ⤷ "Se sim, descreva brevemente (condição e/ou restrição indicada pelo médico)" | textarea | ⤷ (se 5.5 = Sim) | — | `medical_condition_details` | contexto clínico pro coach |
| **5.7** | **"Você faz uso contínuo de algum medicamento?"** (nova — D9) | radio | ✓ | Sim/Não | `uses_medications` (boolean, **novo**) | flag explícito pra Coach Console / IA (interação medicamento × exercício) |
| **5.8** | ⤷ **"Se sim, liste os medicamentos"** (nova — D9) | textarea | ⤷ (se 5.7 = Sim) | — | `medications_continuous` (text, **novo**) | input pro PDF técnico (versão médico) |
| **5.9** | **"Você já teve lesão, cirurgia ou restrição relevante, mesmo antiga, que ainda possa influenciar seu treino?"** (nova — D5, **sem limite temporal**) | textarea | ◯ | — (texto livre — se vazio / "Não" / "Nenhuma" = sem histórico relevante) | `injury_surgery_history` (text, **novo**) | trigger pra revisão clínica adicional do coach |
| 5.10 | "Você pratica alguma estratégia de recuperação?" | checkbox | ◯ | Sauna → `sauna` · Imersão em gelo → `cold_plunge` · Exercícios de respiração → `breathing` · Meditação/mindfulness → `meditation` · Liberação miofascial → `myofascial_release` · Massagem → `massage` · Nenhuma → `none` · Outra → `other` | `recovery_strategies` (text[]) | identifica base do paciente; PDF inicial pode reforçar estratégias |
| 5.11 | "Consumo de álcool" | radio | ◯ | Nunca → `never` · Ocasionalmente → `occasional` · Frequentemente → `frequent` | `alcohol` | risco metabólico/recuperação |
| 5.12 | "Tabaco / vape" | radio | ◯ | Não uso → `none` · Cigarro → `cigarette` · Vape → `vape` · Ambos → `both` | `tobacco` | risco cardiovascular |
| 5.13 | "Doses de cafeína por dia" | radio | ◯ | 0 / 1 / 2 / 3 / 4+ → `none`, `dose_1`, `dose_2`, `dose_3`, `dose_4_or_more` | `caffeine_doses` (text) | qualidade do sono / pico cardio |

> **Nota**: itens 5.7+5.8 e 5.6 podem parecer sobrepor. **Diferença**: 5.6 é condição/doença + restrição médica formal. 5.7-5.8 é uso de medicamento (que pode existir sem condição declarada, ex. anticoncepcional, ansiolítico contínuo).

### Tela 6 — Sono, recuperação e estresse

| # | Texto exato | Tipo | Obr | Opções | Campo banco | Derivação IA |
|---|---|---|---|---|---|---|
| 6.1 | "Quantas horas você dorme por noite, em média?" | radio | ✓ | Menos de 5h → `under_5` · 5–6h → `5_to_6` · 6–7h → `6_to_7` · 7–8h → `7_to_8` · Mais de 8h → `over_8` | `sleep_hours` | benchmark vs Oura sleep_duration |
| 6.2 | "Como você avalia a qualidade do seu sono hoje?" | likert 1-5 | ✓ | 1 = Muito ruim … 5 = Excelente | `sleep_quality` | benchmark vs Oura sleep_score |
| 6.3 | "Como está seu nível de estresse atualmente?" | likert 1-5 | ✓ | 1 = Muito baixo … 5 = Muito alto | `stress_level` | benchmark vs Oura readiness |
| 6.4 | "Como você descreveria seu nível de energia física no dia a dia?" | likert 1-5 | ✓ | 1 = Muito baixo … 5 = Muito alto | `energy_level` | calibração wording PDF |
| 6.5 | "Você sente que se recupera bem entre treinos ou tarefas do dia a dia?" | radio | ✓ | Sempre → `always` · Na maioria das vezes → `most_of_time` · Às vezes → `sometimes` · Raramente → `rarely` · Não → `never` | `recovery_quality` | dose inicial de treino |

### Tela 7 — Wearable + perfil comportamental

| # | Texto exato | Tipo | Obr | Opções | Campo banco | Derivação IA |
|---|---|---|---|---|---|---|
| 7.1 | "Você utiliza algum dispositivo de monitoramento hoje?" | radio | ✓ | Sim/Não | `uses_wearable` (boolean) | gate pra 7.2/7.3 |
| 7.2 | ⤷ "Qual dispositivo você utiliza?" | radio | ⤷ (se 7.1 = Sim) | Oura Ring → `oura` · Whoop → `whoop` · Outro → `other` | `wearable_brand` | Persistência fiel (D12): Oura → `'oura'`, Whoop → `'whoop'`. UI Oura connect só dispara se `wearable_brand = 'oura'`; Whoop é registrado pra contexto (integração futura), `other` reservado pra wearables fora desses 2. |
| 7.3 | ⤷ "Você está disposto(a) a compartilhar esses dados com a Fabrik?" | radio | ⤷ (se 7.1 = Sim) | Sim/Não | `share_data` (boolean) | gate pra trigger do convite Oura connect |
| 7.4 | "O que mais te motiva a treinar? (selecione até 2)" | checkbox (max 2) | ✓ | Saúde e longevidade → `health_longevity` · Performance e superação → `performance` · Estética → `aesthetics` · Controle do estresse / clareza mental → `mental_clarity` · Disciplina e rotina → `discipline_routine` | `motivations` (text[]) | wording do PDF inicial é calibrado por isso |
| 7.5 | "Quando o desconforto físico aumenta durante o treino, você tende a:" | radio | ✓ | Evitar ao máximo → `avoid` · Aguentar se tiver um bom motivo → `endure_with_reason` · Gostar do desafio e buscar isso → `seek_challenge` | `discomfort_response` | input pra dose de intensidade |
| 7.6 | "Quando o treino fica muito difícil, o que mais te ajuda a continuar?" | radio | ✓ | Metas claras → `clear_goals` · Incentivo emocional → `emotional_support` · Explicação racional → `rational_explanation` · Competição → `competition` · Liberdade para ajustar o ritmo → `freedom_to_adjust` | `difficulty_helper` | wording do PDF inicial |
| 7.7 | "Quando você não consegue cumprir o treino como planejado, você:" | radio | ✓ | Fica frustrado(a) e se cobra → `frustrated_self_blame` · Aceita e tenta entender → `accept_understand` · Desanima e pensa em desistir → `discouraged_quit_thought` · Não se importa muito → `indifferent` | `missed_session_response` | flag de risco emocional |
| 7.8 | "Quando um profissional é mais direto e firme com você, isso tende a:" | radio | ✓ | Aumentar meu foco → `increase_focus` · Não fazer diferença → `no_difference` · Piorar meu rendimento → `worsen_performance` | `firm_professional_response` | calibra abordagem coach |
| 7.9 | "Você prefere um acompanhamento que:" | radio | ✓ | Diga exatamente o que fazer → `prescriptive` · Decida junto com você → `collaborative` · Dê mais liberdade → `autonomous` | `accompaniment_preference` | calibra abordagem coach |
| 7.10 | "Você prefere ser corrigido(a):" | radio | ✓ | Imediatamente durante a execução → `immediate` · Depois de tentar → `after_attempt` · Só se eu perguntar → `on_request` | `correction_preference` | calibra UX coaching ao vivo |
| 7.11 | "Na sua rotina, você se considera uma pessoa:" | radio | ✓ | Muito consistente → `very_consistent` · Consistente quando motivado(a) → `consistent_when_motivated` · Inconstante → `inconsistent` · Muito disciplinado(a) por períodos curtos → `disciplined_in_bursts` | `consistency_self_rating` (text) | flag de aderência |
| 7.12 | "Como está sua vida fora do treino agora?" | radio | ✓ | Estável e organizada → `stable_organized` · Corrida, mas sob controle → `busy_controlled` · Caótica e imprevisível → `chaotic` · Em transição → `in_transition` | `life_stability` | contexto pra dose realista |
| 7.13 | "O que mais poderia te fazer desistir definitivamente do programa?" | textarea | ◯ | — | `deal_breaker` | contexto qualitativo (diferente de 4.7 que é risco categórico) |

### Tela 8 — Consentimento

| # | Texto exato | Tipo | Obr | Opções | Campo banco | Derivação IA |
|---|---|---|---|---|---|---|
| 8.1 | "Para concluir, marque todas as declarações abaixo" | checkbox (todos obrigatórios) | ✓ | (a) "Declaro que as informações fornecidas são verdadeiras" → `consent_truthful` · (b) "Estou ciente de que este programa não substitui acompanhamento médico" → `consent_not_medical` · (c) "Autorizo o uso dos meus dados para personalização do plano e acompanhamento interno da Fabrik" → `consent_data_use` · (d) "Concordo com os termos de participação do programa" → `consent_terms` | 4 colunas boolean | UI só libera "Concluir" se todos 4 = true |

**Comportamento submit**:
1. Validar todos 4 checks = `true` (UI bloqueia botão senão)
2. Edge function `submit-precision12-questionnaire`:
   - INSERT na `questionnaire_responses` com todos os campos
   - SET `submitted_at = now()`
   - UPDATE `assessments` SET `status =` `'blocked'` (se `parq_blocked = true`) ou `'completed'` (caso contrário)
3. Renderizar tela final:
   - **Se PAR-Q positivo** (`parq_blocked = true`):
     > "⚠️ Suas respostas indicam necessidade de revisão prévia antes de liberar ou ajustar o programa. A equipe Fabrik vai avaliar e orientar o próximo passo. Este questionário não substitui avaliação médica."
   - **Se PAR-Q negativo**:
     > "✅ Suas respostas foram registradas. O coach Fabrik vai conferir e dar próximos passos."

---

## 5. Catálogo de códigos estáveis

> Todos os enums abaixo devem ser **exportados em `src/constants/precision12Questionnaire.ts`** como `as const` arrays para garantir TypeScript narrow types + serialização determinística. Front-end mapeia código → label PT em runtime.

```ts
// Tela 1
GENDER = ["M", "F"] as const;
ROUTINE = ["sedentary_work", "active_work", "mixed_routine", "variable_shifts", "other"] as const;

// Tela 3
GOALS = [
  "reduce_body_fat", "gain_muscle", "improve_performance", "improve_mobility",
  "reduce_pain", "improve_health_longevity", "improve_energy_recovery", "other",
] as const;
EXERCISE_HISTORY = [
  "never_regular",
  "paused_over_1_month",
  "returning_under_1_month",
  "regular_1_to_6_months",
  "regular_6_months_to_2_years",
  "regular_over_2_years",
] as const;

// Tela 4
SESSION_DURATION = ["under_30", "30_to_45", "45_to_60", "over_60"] as const;
TRAINING_AVAILABLE_DAYS = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
] as const;
TRAINING_PERIOD = ["morning", "afternoon", "evening", "variable"] as const;
EXTERNAL_TRAINING_RESOURCES = [
  "gym_near_home", "gym_near_work", "home_free_weights", "home_cardio",
  "outdoor", "guided_app", "external_trainer", "none", "other",
] as const;
PRIMARY_ADHERENCE_BARRIER = [
  "time", "energy_fatigue", "motivation", "pain_discomfort",
  "lack_of_results", "financial_cost", "other",
] as const;

// Tela 5
PAIN_STATUS = ["daily", "during_training", "none"] as const;
PAIN_MOVEMENTS = [
  "squat_sit_stand", "push", "pull", "trunk_rotation",
  "run_jump", "load_bearing", "other",
] as const;
BIGGEST_DIFFICULTY = [
  "time", "lack_of_guidance", "motivation", "pain_discomfort",
  "lack_of_results", "other",
] as const;
USES_MEDICATIONS = [true, false] as const;
RECOVERY_STRATEGIES = [
  "sauna", "cold_plunge", "breathing", "meditation",
  "myofascial_release", "massage", "none", "other",
] as const;
ALCOHOL = ["never", "occasional", "frequent"] as const;
TOBACCO = ["none", "cigarette", "vape", "both"] as const;
CAFFEINE_DOSES = ["none", "dose_1", "dose_2", "dose_3", "dose_4_or_more"] as const;

// Tela 6
SLEEP_HOURS = ["under_5", "5_to_6", "6_to_7", "7_to_8", "over_8"] as const;
RECOVERY_QUALITY = ["always", "most_of_time", "sometimes", "rarely", "never"] as const;

// Tela 7
WEARABLE_BRAND = ["oura", "whoop", "other"] as const;
MOTIVATIONS = [
  "health_longevity", "performance", "aesthetics",
  "mental_clarity", "discipline_routine",
] as const;
DISCOMFORT_RESPONSE = ["avoid", "endure_with_reason", "seek_challenge"] as const;
DIFFICULTY_HELPER = [
  "clear_goals", "emotional_support", "rational_explanation",
  "competition", "freedom_to_adjust",
] as const;
MISSED_SESSION_RESPONSE = [
  "frustrated_self_blame", "accept_understand",
  "discouraged_quit_thought", "indifferent",
] as const;
FIRM_PROFESSIONAL_RESPONSE = [
  "increase_focus", "no_difference", "worsen_performance",
] as const;
ACCOMPANIMENT_PREFERENCE = ["prescriptive", "collaborative", "autonomous"] as const;
CORRECTION_PREFERENCE = ["immediate", "after_attempt", "on_request"] as const;
CONSISTENCY_SELF_RATING = [
  "very_consistent", "consistent_when_motivated",
  "inconsistent", "disciplined_in_bursts",
] as const;
LIFE_STABILITY = ["stable_organized", "busy_controlled", "chaotic", "in_transition"] as const;
```

**Regra**: nenhum desses códigos pode mudar sem bump de `questionnaire_version`. Adicionar item novo a um enum existente é OK (forward-compatible) **se** o item for **append**. Renomear ou reordenar requer migration de dados.

---

## 6. Lógica condicional

Resumo das **6 dependências** (todas implementadas client-side via watch do form, mais 1 não-condicional listada pra completude):

| Pergunta gatilho | Valor que dispara | Perguntas dependentes |
|---|---|---|
| 5.1 (`pain_status`) | qualquer ≠ `none` | 5.2 `pain_movements` + 5.3 `pain_location` |
| 5.5 (`has_medical_condition`) | `true` | 5.6 `medical_condition_details` |
| 5.7 (`uses_medications`) | `true` | 5.8 `medications_continuous` |
| 7.1 (`uses_wearable`) | `true` | 7.2 `wearable_brand` + 7.3 `share_data` |
| — (5.9 sem gatilho) | textarea opcional sempre visível, sem condicional | — |

**Total: 6 perguntas condicionais** (5.2, 5.3, 5.6, 5.8, 7.2, 7.3). Confere com a contagem da Seção 3.

**PAR-Q (Tela 2)**: nenhuma condicional. Todas as 7 sempre aparecem. `parq_blocked` é calculado server-side via generated column.

---

## 7. Derivações para IA (client-side, não persistidas)

### 7.1 Training experience level + active_last_30_days a partir de `exercise_history`

```ts
type TrainingExperienceLevel =
  | "sedentary"
  | "transition"          // voltando há <1 mês
  | "active_beginner"     // 1-6 meses regular
  | "active_intermediate" // 6m-2 anos regular
  | "active_advanced";    // >2 anos regular

const HISTORY_TO_TRAINING_EXPERIENCE: Record<typeof EXERCISE_HISTORY[number], TrainingExperienceLevel> = {
  never_regular:              "sedentary",
  paused_over_1_month:        "sedentary",
  returning_under_1_month:    "transition",
  regular_1_to_6_months:      "active_beginner",
  regular_6_months_to_2_years:"active_intermediate",
  regular_over_2_years:       "active_advanced",
};

const ACTIVE_LAST_30_DAYS: Record<typeof EXERCISE_HISTORY[number], boolean> = {
  never_regular:              false,
  paused_over_1_month:        false,
  returning_under_1_month:    true,
  regular_1_to_6_months:      true,
  regular_6_months_to_2_years:true,
  regular_over_2_years:       true,
};
```

**Não persistir** essas derivações no banco — elas são funções puras de `exercise_history`. Coach Console (E4) e PDF inicial (E6) recomputam em runtime.

**Nota clínica**: esta derivação é uma classificação operacional Fabrik de experiência/atividade recente. Ela é inspirada em triagem pré-participação, mas **não deve ser apresentada como classificação clínica ACSM formal**.

### 7.2 PAR-Q derivado

`parq_blocked` já é generated column do banco. Front-end pode antever (`OR` dos 7 booleans) para mostrar aviso visual antes do submit.

### 7.3 Sinal de risco de aderência (Coach Console E4)

Score qualitativo derivado de:
- `primary_adherence_barrier` = `time` ou `energy_fatigue` → flag "estresse de rotina"
- `missed_session_response` = `discouraged_quit_thought` → flag "fragilidade emocional"
- `consistency_self_rating` = `inconsistent` → flag "histórico instável"
- `life_stability` = `chaotic` → flag "instabilidade externa"

≥ 2 flags = "aluno em risco moderado de churn" no Coach Console. Não persistir — recomputar.

### 7.4 Calibração wording do PDF inicial (E6)

`motivations` (Tela 7.4) → tom do texto:
- `health_longevity` → tom técnico-explicativo
- `performance` → tom de superação
- `aesthetics` → foco em transformação visível
- `mental_clarity` → foco em bem-estar
- `discipline_routine` → foco em estrutura

Combinado com `firm_professional_response` (Tela 7.8) ajusta direção do tom (mais direto ou mais inclusivo).

---

## 8. Perguntas removidas, condensadas e novas

### 8.1 Removidas/condensadas (PDF original → spec final)

| PDF original | Destino na spec final | Motivo |
|---|---|---|
| Q1-Q7 (Bloco 1) | Tela 1 (1.1-1.7) | mapeamento 1:1 |
| Q8-Q14 (Bloco 2 PAR-Q) | Tela 2 (2.1-2.7) | mapeamento 1:1 |
| Q15 (objetivos) | Tela 3 (3.1) | mapeamento 1:1 |
| Q16 (detalhes objetivo) | Tela 3 (3.2) | mapeamento 1:1 |
| Q17 (tentativas anteriores) | Tela 3 (3.3) | mapeamento 1:1 |
| Q18 (regularidade) | Tela 3 (3.4) | **reformulado conforme D2** (6 opções) |
| Q19 (auto-rating fitness) | Tela 3 (3.5) | mapeamento 1:1 |
| Q20 (satisfação corpo) | Tela 3 (3.6) | mapeamento 1:1 |
| Q21 (tempo sessão) | Tela 4 (4.1) | mapeamento 1:1 |
| Q22 (freq semanal) | Tela 4 (4.2) | mapeamento 1:1 (`weekly_frequency` = quantidade de dias) |
| Q23 (período treino) | Tela 4 (4.4) | mapeamento 1:1 |
| Q24 (viajante) | Tela 4 (4.5) | mapeamento 1:1 |
| Q25 (rotina trabalho/família) | Tela 4 (4.7) | mapeamento 1:1 |
| Q26 (dor atual) | Tela 5 (5.1) | mapeamento 1:1 |
| Q27 (movimentos dor) | Tela 5 (5.2) | mapeamento 1:1 |
| Q28 (local dor) | Tela 5 (5.3) | mapeamento 1:1 |
| Q29 (maior dificuldade) | Tela 5 (5.4) | mapeamento 1:1 |
| Q30-Q34 (sono/recuperação/estresse) | Tela 6 (6.1-6.5) | mapeamento 1:1 |
| Q35-Q37 (wearable) | Tela 7 (7.1-7.3) | mapeamento 1:1 |
| Q38 (condição médica) | Tela 5 (5.5) | mapeamento 1:1 |
| Q39 (detalhes condição) | Tela 5 (5.6) | mapeamento 1:1 |
| Q40-Q43 (hábitos) | Tela 5 (5.10-5.13) | mapeamento 1:1 |
| Q44-Q53 (perfil comportamental) | Tela 7 (7.4-7.13) | mapeamento 1:1 |
| Q54 (consentimento) | Tela 8 (8.1) | mapeamento 1:1 |

**Conclusão**: nenhuma pergunta do PDF foi removida. Todas as 54 originais aparecem na spec final. A condensação é visual e estrutural: 11 blocos do PDF viram 8 telas, mas os sinais importantes continuam separados em campos estruturados.

### 8.2 Novas perguntas (Alex pediu)

| # | Pergunta | Justificativa | Campo |
|---|---|---|---|
| 4.3 | "Dias disponíveis para treinar" | D6 — planejamento operacional real | `training_available_days` (text[], novo) |
| 4.6 | "Recursos de treino fora da Fabrik" | D7 — adapta protocolo a contexto real | `external_training_resources` (text[], novo) |
| 4.8 | "Maior barreira de adesão" | D8 — flag preventivo de churn no Coach Console | `primary_adherence_barrier` (text, novo) |
| 5.7 | "Uso contínuo de medicamentos?" | D9 — flag explícito para IA/coach | `uses_medications` (boolean, novo) |
| 5.8 | "Liste os medicamentos" | D9 — detalhe textual condicional | `medications_continuous` (text, novo) |
| 5.9 | "Lesão/cirurgia/restrição relevante, mesmo antiga" | D5 — trigger de revisão clínica | `injury_surgery_history` (text, novo) |

Total: **6 perguntas/campos novos** no schema.

---

## 9. Campos novos e recomendação sobre migration

### 9.1 Campos novos necessários

| Campo | Tipo | Nullable | Padrão | Vem de |
|---|---|---|---|---|
| `training_available_days` | `text[]` | sim | `null` | Tela 4.3 |
| `external_training_resources` | `text[]` | sim | `null` | Tela 4.6 |
| `primary_adherence_barrier` | `text` | sim | `null` | Tela 4.8 |
| `uses_medications` | `boolean` | sim | `null` | Tela 5.7 |
| `medications_continuous` | `text` | sim | `null` | Tela 5.8 |
| `injury_surgery_history` | `text` | sim | `null` | Tela 5.9 |

Todos **NULLABLE** porque o schema já tem dados legacy (3 questionários backfilled em E1). Não dá pra forçar NOT NULL sem destruir histórico.

### 9.2 Recomendação: **fazer migration agora (Etapa 2)**

**Sim**, recomendo migration aditiva mínima **antes** da implementação da UI/edge function. Razões:

1. **Coerência types.ts**: se a UI for desenvolvida contra campos que não existem, vai usar cast hack `as any` (anti-pattern, mesmo bug do M1 do audit Codex anterior).

2. **Compliance ground-truth (Section 9.6 memory)**: a fonte canônica do schema é `types.ts` regenerado pelo Lovable. Implementar contra `types.ts` desatualizado força regressão de auditoria.

3. **Custo da migration**: baixo risco e idempotente (apenas `ADD COLUMN IF NOT EXISTS` + comments), mas exige regenerar `src/integrations/supabase/types.ts` e smoke após aplicação.

4. **Bloqueia Etapa 3+ se não fizer**: edge function `submit-precision12-questionnaire` precisa dos 6 campos pra INSERT sem cast hack.

**Proposta de timing**: Etapa 2 do E3 será a migration + regeneração types.ts. Etapas 3+ implementam edge functions + UI.

### 9.3 Conteúdo proposto da migration (preview, não executar nesta etapa)

```sql
-- Migration E3 Etapa 2 (não executar agora):
-- supabase/migrations/<timestamp>_precision12_questionnaire_v1_fields.sql

alter table public.questionnaire_responses
  add column if not exists training_available_days text[];

alter table public.questionnaire_responses
  add column if not exists external_training_resources text[];

alter table public.questionnaire_responses
  add column if not exists primary_adherence_barrier text;

alter table public.questionnaire_responses
  add column if not exists uses_medications boolean;

alter table public.questionnaire_responses
  add column if not exists medications_continuous text;

alter table public.questionnaire_responses
  add column if not exists injury_surgery_history text;

comment on column public.questionnaire_responses.training_available_days is 'Dias da semana disponíveis para treinar. Codes em precision12Questionnaire.TRAINING_AVAILABLE_DAYS.';
comment on column public.questionnaire_responses.external_training_resources is 'Recursos de treino fora da Fabrik (academia, equipamento em casa, etc). Codes em precision12Questionnaire.EXTERNAL_TRAINING_RESOURCES.';
comment on column public.questionnaire_responses.primary_adherence_barrier is 'Maior risco de tirar o aluno do programa. Codes em precision12Questionnaire.PRIMARY_ADHERENCE_BARRIER.';
comment on column public.questionnaire_responses.uses_medications is 'Flag explícito de uso contínuo de medicamentos. Campo textual medications_continuous é obrigatório na UI quando true.';
comment on column public.questionnaire_responses.medications_continuous is 'Medicamentos de uso continuo (texto livre, opcional). Existe independente de has_medical_condition.';
comment on column public.questionnaire_responses.injury_surgery_history is 'Lesão / cirurgia / restrição clínica relevante, mesmo antiga, que ainda possa influenciar treino (texto livre, opcional).';
```

---

## 10. Riscos

### 10.1 Schema

| Risco | Severidade | Mitigação |
|---|---|---|
| `questionnaire_responses.assessment_id PK` é 1:1 com `assessments` | Médio | Edge function deve garantir que cada `assessment_type='questionnaire_precision12'` tem no máximo 1 row. RPC bloqueia ON CONFLICT? **Verificar na Etapa 2**. |
| Generated column `parq_blocked` é OR de 7 booleans. Se algum vier `null`, o coalesce default false pode mascarar | Baixo | UI valida 7 PAR-Q como obrigatórios. Edge function rejeita submit com null. |
| 3 questionários legacy (backfilled em E1) com schema antigo. Vão coexistir com novos. | Baixo | Doc v1 explícito que esses 3 são `precision12_v0` (sem `questionnaire_version` ou `null`). UI filtra por versão antes de exibir. |

### 10.2 Edge function (Etapa 3+)

| Risco | Severidade | Mitigação |
|---|---|---|
| Token magic-link reusable / sem expiração | Alta | TTL 7 dias + single-use + JWT signed pela função |
| Aluno consegue submit múltiplos | Médio | INSERT com ON CONFLICT (assessment_id) DO UPDATE bloqueado pela RPC; alternativamente, edge function checa se já tem `submitted_at` antes de aceitar |
| Aluno responde sem ter assessment criado | Baixo | Edge function `create-precision12-questionnaire-link` cria o assessment + token; sem assessment, sem link |

### 10.3 UX

| Risco | Severidade | Mitigação |
|---|---|---|
| Aluno abandona no meio (8 telas, 13 min) | Médio | Rascunho auto-salvo a cada bloco (POST parcial à edge function); retomada via token reusado em pendência |
| Mobile lento / sem conexão | Médio | Cache localStorage antes do submit final |
| PAR-Q soft block confunde aluno (acha que passou no teste mas chegou no aviso final) | Baixo | Aviso visível na tela 2 logo no começo + mensagem clara na tela 8 |

---

## 11. Próximas etapas (E3 fases 2+)

**Esta etapa (1) entrega:** especificação congelada. Sem código.

Próximas etapas planejadas (não executar agora — só listadas para clareza):

| Etapa | Entrega | Estimativa |
|---|---|---|
| E3.2 | Migration aditiva + regenerar types.ts via Lovable | ~30 min |
| E3.3 | Constantes `precision12Questionnaire.ts` + zod schemas + helpers de derivação | ~2 h |
| E3.4 | Edge function `create-precision12-questionnaire-link` (token + assessment shell) | ~2 h |
| E3.5 | Edge function `submit-precision12-questionnaire` (valida token, escreve via service role, atualiza status do assessment) | ~3 h |
| E3.6 | Página pública `/precision-questionnaire/[token]` com 8 telas + progresso + rascunho | ~5 h |
| E3.7 | Wizard E2 atualizado: card "Questionário Precision 12" passa de disabled → "Gerar link" | ~1 h |
| E3.8 | Detail Sheet renderiza respostas vinculadas (já parcialmente em PR #123 — adicionar layout legível das 60 respostas/itens do fluxo) | ~2 h |
| E3.9 | Testes + audit Codex + smoke | ~2 h |

**Total estimado E3 completo**: ~17 horas (~1.5 dia útil).

---

## 12. Critérios de aceite desta etapa

- [x] Nenhuma pergunta sem campo destino claro
- [x] Nenhum campo inventado sem justificativa explícita
- [x] Cada resposta fechada tem código estável snake_case em inglês
- [x] Decisões D1-D9 aplicadas
- [x] Documento permite implementar E3 sem consultar PDF externo
- [x] Riscos identificados
- [x] Recomendação clara sobre migration

---

## 13. GO/NO-GO Etapa 1

**GO.**

Esta etapa entrega especificação congelada do questionário Precision 12 v1. Próxima etapa (E3.2) implementa a migration aditiva dos 6 campos novos identificados.
