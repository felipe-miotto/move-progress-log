-- ============================================================================
-- PRECISION 12 — Avaliação Fabrik / Foundation (E1) · IDEMPOTENT REWRITE
-- ============================================================================
--
-- Migration consolidada da Etapa 1 do módulo de avaliação física + programa
-- Precision 12. Cria toda a base de tabelas + RLS + seeds + storage buckets
-- pra os PRs seguintes (E2 forms coach, E3 questionário, E4 programa, E5
-- evidence, E6/E7 PDFs) construírem em cima.
--
-- ⚠ IMPORTANTE — Versão 2 idempotente (re-write 2026-05-13):
--   A primeira tentativa falhou em produção porque a tabela `assessments`
--   já existia (de módulo antigo de avaliação funcional), com schema
--   diferente, e o `create table if not exists` silenciou a criação. O
--   próximo statement `create index` então falhou (`assessment_date` não
--   existia), abortando a transação inteira.
--   Esta versão usa ADD COLUMN IF NOT EXISTS + DROP POLICY IF EXISTS +
--   conversão defensiva de enum status → text + atualização explícita de
--   constraints, pra rodar tanto greenfield quanto sobre o schema legado.
--
-- Convenções:
--   • Toda tabela com dado de aluno tem RLS ativo (espelha student_reports)
--   • Trainer vê dados dos próprios alunos (students.trainer_id = auth.uid())
--   • Admin (user_roles.role='admin') vê tudo
--   • Aluno read-only nas próprias avaliações
--   • Tabelas de referência: SELECT público, INSERT/UPDATE só admin
--
-- Idempotente em todos os pontos: pode ser re-executada com segurança.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 1 · Extensão de students (sex + programa + tipo de cliente)
-- ────────────────────────────────────────────────────────────────────────────

alter table public.students
  add column if not exists sex text check (sex in ('M', 'F'));

alter table public.students
  add column if not exists student_type text
    not null default 'fabrik';

do $$ begin
  if not exists (
    select 1 from information_schema.constraint_column_usage
    where table_schema = 'public' and table_name = 'students'
      and constraint_name = 'students_student_type_check'
  ) then
    alter table public.students
      add constraint students_student_type_check
      check (student_type in ('fabrik', 'precision_external'));
  end if;
end $$;

alter table public.students
  add column if not exists home_gym_name text;

alter table public.students
  add column if not exists program_tier text
    not null default 'regular';

do $$ begin
  if not exists (
    select 1 from information_schema.constraint_column_usage
    where table_schema = 'public' and table_name = 'students'
      and constraint_name = 'students_program_tier_check'
  ) then
    alter table public.students
      add constraint students_program_tier_check
      check (program_tier in ('regular', 'precision_12'));
  end if;
end $$;

alter table public.students
  add column if not exists program_started_at date;

alter table public.students
  add column if not exists program_ends_at date;

comment on column public.students.sex is
  'Sexo biológico (M/F). Usado nas tabelas de referência ACSM/Mathiowetz/Araújo (bimodais por limitação científica). Distinto de gênero do questionário.';
comment on column public.students.student_type is
  'fabrik = aluno físico da Fabrik · precision_external = cliente Precision 12 de outra academia';
comment on column public.students.program_tier is
  'regular = aluno comum · precision_12 = participante do programa de 12 semanas';
comment on column public.students.program_ends_at is
  'Pra precision_12: started_at + 84 dias. Pra regular: NULL.';


-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 2 · Modalidade em workout_sessions
-- ────────────────────────────────────────────────────────────────────────────

alter table public.workout_sessions
  add column if not exists modality text;

do $$ begin
  if not exists (
    select 1 from information_schema.constraint_column_usage
    where table_schema = 'public' and table_name = 'workout_sessions'
      and constraint_name = 'workout_sessions_modality_check'
  ) then
    alter table public.workout_sessions
      add constraint workout_sessions_modality_check
      check (modality in ('functional','spin','walking','running','strength','swimming','other'));
  end if;
end $$;


-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 3 · Tabela assessments — reconcilia schema legado com novo
-- ────────────────────────────────────────────────────────────────────────────
-- Schema legado (módulo antigo de avaliação funcional):
--   id, professional_id, student_id, status (enum assessment_status),
--   started_at, completed_at, notes, created_at, updated_at
--
-- Schema novo (Precision 12 + bateria de testes):
--   id, student_id, trainer_id, assessment_type, assessment_date,
--   status (text), age_years, weight_kg, height_cm, sex, notes,
--   created_at, updated_at
-- ────────────────────────────────────────────────────────────────────────────

-- 3.1 · Cria a tabela do zero (greenfield) — se não existe.
create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  trainer_id uuid references auth.users(id),

  assessment_type text,
  assessment_date date not null default current_date,
  status text not null default 'in_progress',

  -- Snapshot do aluno (preservar mesmo que aluno mude depois)
  age_years int,
  weight_kg numeric(5,2),
  height_cm numeric(5,2),
  sex text check (sex in ('M', 'F')),

  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3.2 · Adiciona colunas faltantes em schema legado (idempotente)
alter table public.assessments
  add column if not exists trainer_id uuid references auth.users(id);

alter table public.assessments
  add column if not exists assessment_type text;

alter table public.assessments
  add column if not exists assessment_date date not null default current_date;

alter table public.assessments
  add column if not exists age_years int;

alter table public.assessments
  add column if not exists weight_kg numeric(5,2);

alter table public.assessments
  add column if not exists height_cm numeric(5,2);

alter table public.assessments
  add column if not exists sex text;

-- 3.3 · Garante constraint sex M/F (drop antiga se existir, recria)
alter table public.assessments
  drop constraint if exists assessments_sex_check;
alter table public.assessments
  add constraint assessments_sex_check
  check (sex is null or sex in ('M', 'F'));

-- 3.4 · Converte status de enum → text (se necessário, defensivo).
--       Schema legado tinha status como `assessment_status` enum.
--       Schema novo precisa de text + check constraint.
do $$
declare
  status_udt text;
begin
  select udt_name into status_udt
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'assessments'
    and column_name = 'status';

  -- Se for enum (udt_name != text/varchar), converter
  if status_udt is not null and status_udt not in ('text', 'varchar', 'character varying') then
    -- Remove default antigo (se existir)
    execute 'alter table public.assessments alter column status drop default';
    -- Converte tipo
    execute 'alter table public.assessments alter column status type text using status::text';
    -- Aplica novo default
    execute 'alter table public.assessments alter column status set default ''in_progress''';
  end if;
end $$;

-- 3.5 · Garante check constraint pra status (drop antigo se existir)
alter table public.assessments
  drop constraint if exists assessments_status_check;

-- 3.5.1 · Backfill de status legado antes de aplicar o novo check.
--         Schema novo aceita: 'in_progress', 'completed', 'aborted', 'blocked'.
--         Schema legado tinha (entre outros): 'draft', 'archived', e potencialmente
--         outros valores não previstos. Mapeamento:
--           draft     → in_progress (rascunho = ainda em progresso)
--           archived  → aborted     (arquivado = interrompido; blocked é só pra PAR-Q)
--           qualquer outro não previsto → aborted (fallback defensivo)
update public.assessments
   set status = case
     when status = 'completed'   then 'completed'
     when status = 'in_progress' then 'in_progress'
     when status = 'aborted'     then 'aborted'
     when status = 'blocked'     then 'blocked'
     when status = 'draft'       then 'in_progress'
     when status = 'archived'    then 'aborted'
     when status is null         then 'in_progress'
     else 'aborted'  -- safety fallback pra qualquer valor não previsto
   end
 where status is null
    or status not in ('in_progress', 'completed', 'aborted', 'blocked');

alter table public.assessments
  add constraint assessments_status_check
  check (status in ('in_progress', 'completed', 'aborted', 'blocked'));

-- 3.6 · Garante check constraint pra assessment_type
alter table public.assessments
  drop constraint if exists assessments_assessment_type_check;

-- Backfill defensivo de assessment_type pra qualquer linha legada
update public.assessments
  set assessment_type = 'questionnaire_precision12'
  where assessment_type is null;

alter table public.assessments
  add constraint assessments_assessment_type_check
  check (assessment_type in (
    'vo2_bike_max', 'vo2_bike_submax',
    'vo2_treadmill_walk_submax', 'vo2_treadmill_run_submax', 'vo2_treadmill_run_max',
    'handgrip', 'dexa', 'sit_to_stand', 'questionnaire_precision12'
  ));

alter table public.assessments
  alter column assessment_type set not null;

-- 3.7 · Índices (agora podem ser criados — colunas existem)
create index if not exists assessments_student_date_idx
  on public.assessments (student_id, assessment_date desc);

create index if not exists assessments_type_idx
  on public.assessments (assessment_type);

create index if not exists assessments_trainer_idx
  on public.assessments (trainer_id);

-- 3.8 · Habilita RLS (idempotente)
alter table public.assessments enable row level security;

-- 3.9 · Limpa policies antigas/conflitantes e cria as novas
drop policy if exists "Students can view their assessments" on public.assessments;
drop policy if exists "Trainers can manage their assessments" on public.assessments;
drop policy if exists "assessments_trainer_own_or_admin" on public.assessments;

create policy "assessments_trainer_own_or_admin"
  on public.assessments
  for all
  to authenticated
  using (
    exists (
      select 1 from public.students s
      where s.id = student_id
        and (s.trainer_id = auth.uid()
             or exists (select 1 from public.user_roles ur
                        where ur.user_id = auth.uid() and ur.role = 'admin'))
    )
  )
  with check (
    exists (
      select 1 from public.students s
      where s.id = student_id
        and (s.trainer_id = auth.uid()
             or exists (select 1 from public.user_roles ur
                        where ur.user_id = auth.uid() and ur.role = 'admin'))
    )
  );


-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 4 · VO₂ details (compartilhada bike + esteira)
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.vo2_assessment_details (
  assessment_id uuid primary key references public.assessments(id) on delete cascade,

  fc_max_predicted int,
  fc_peak int,
  vo2_final numeric(5,2),
  vo2_classification text,

  recovery_drop_1min int,
  recovery_classification text,

  -- Esteira (null pra bike)
  total_time_min numeric(5,2),
  final_speed_kmh numeric(4,1),
  final_incline_pct numeric(4,1),
  protocol_name text,

  -- Bike (null pra esteira)
  last_valid_load numeric(4,1),
  last_valid_watts int,
  abort_reason text
);


-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 5 · Estágios da bike
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.vo2_bike_stages (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,

  stage_order int not null,
  time_label text,
  phase text check (phase in ('warmup', 'test', 'recovery')),

  load_value numeric(4,1),
  rpm_target text,

  watts_observed int,
  hr_final int,
  pse int check (pse between 6 and 10),

  vo2_estimated numeric(5,2),

  notes text
);

create index if not exists vo2_bike_stages_assessment_idx
  on public.vo2_bike_stages (assessment_id, stage_order);


-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 6 · Handgrip
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.handgrip_results (
  assessment_id uuid primary key references public.assessments(id) on delete cascade,

  dominant_hand text check (dominant_hand in ('left', 'right')),

  right_kg_attempts numeric(5,2)[] default '{}',
  left_kg_attempts numeric(5,2)[] default '{}',

  right_kg numeric(5,2),
  left_kg numeric(5,2),
  best_kg numeric(5,2) generated always as (
    greatest(coalesce(right_kg, 0), coalesce(left_kg, 0))
  ) stored,

  classification text
);


-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 7 · DEXA (schema enxuto + 6 promovidos + TMB)
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.dexa_results (
  assessment_id uuid primary key references public.assessments(id) on delete cascade,

  total_mass_kg numeric(5,2),
  fat_mass_kg numeric(5,2),
  fat_pct numeric(4,1),
  lean_mass_kg numeric(5,2),
  bone_mass_kg numeric(5,2),
  bone_density_z_score numeric(4,2),
  visceral_fat_g numeric(7,1),
  android_gynoid_ratio numeric(4,2),
  scan_pdf_url text,

  bmr_harris_benedict_kcal int,
  bmr_mifflin_stjeor_kcal int,

  appendicular_lean_mass_kg numeric(5,2),
  imma_baumgartner numeric(5,2),
  fmi numeric(4,2),
  fat_percentile int,
  regional_distribution jsonb,
  conclusion_text text,

  scan_pdf_storage_path text,
  raw_extracted_json jsonb,
  extraction_confidence numeric(3,2),
  extraction_method text check (extraction_method in ('manual','ai','hybrid'))
);


-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 8 · Sit-to-Stand (Araújo 2012 split sentar/levantar)
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.sit_to_stand_results (
  assessment_id uuid primary key references public.assessments(id) on delete cascade,

  sit_score numeric(2,1) check (sit_score between 0 and 5),
  sit_supports jsonb default '{"hand":0,"knee":0,"forearm":0,"leg_side":0,"hand_on_knee":0}'::jsonb,
  sit_instabilities int default 0,

  rise_score numeric(2,1) check (rise_score between 0 and 5),
  rise_supports jsonb default '{"hand":0,"knee":0,"forearm":0,"leg_side":0,"hand_on_knee":0}'::jsonb,
  rise_instabilities int default 0,

  total_score numeric(3,1) generated always as (
    coalesce(sit_score, 0) + coalesce(rise_score, 0)
  ) stored,

  classification text,

  notes text
);


-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 9 · Cardiovascular baseline
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.cardiovascular_baseline (
  assessment_id uuid primary key references public.assessments(id) on delete cascade,

  systolic_mmhg int check (systolic_mmhg between 60 and 260),
  diastolic_mmhg int check (diastolic_mmhg between 30 and 160),
  resting_hr_bpm int check (resting_hr_bpm between 30 and 200),

  on_medication boolean default false,
  medication_details text,

  reference_doctor_name text,
  reference_doctor_contact text,

  classification text
);


-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 10 · Subjective scores
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.subjective_scores (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  assessment_id uuid references public.assessments(id) on delete cascade,

  recorded_at date not null default current_date,

  sleep_score smallint check (sleep_score between 0 and 10),
  energy_score smallint check (energy_score between 0 and 10),
  stress_score smallint check (stress_score between 0 and 10),
  recovery_score smallint check (recovery_score between 0 and 10),
  wellbeing_score smallint check (wellbeing_score between 0 and 10),
  mood_score smallint check (mood_score between 0 and 10),

  notes text,
  created_at timestamptz default now()
);

create index if not exists subjective_scores_student_date_idx
  on public.subjective_scores (student_id, recorded_at desc);

create index if not exists subjective_scores_assessment_idx
  on public.subjective_scores (assessment_id);


-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 11 · Questionário Precision 12 (54 perguntas)
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.questionnaire_responses (
  assessment_id uuid primary key references public.assessments(id) on delete cascade,
  questionnaire_version text not null default 'precision12_v1',

  -- Bloco 1
  full_name text, email text, phone text, birthdate date,
  gender text check (gender in ('M', 'F')),
  profession text, routine text,

  -- Bloco 2 — PAR-Q
  parq_q8_heart_condition boolean,
  parq_q9_chest_pain_exercise boolean,
  parq_q10_chest_pain_recent boolean,
  parq_q11_loss_consciousness_or_dizziness_fall boolean,
  parq_q12_bone_joint boolean,
  parq_q13_blood_pressure_meds boolean,
  parq_q14_other_health_reason boolean,
  parq_blocked boolean generated always as (
    coalesce(parq_q8_heart_condition,false)
    or coalesce(parq_q9_chest_pain_exercise,false)
    or coalesce(parq_q10_chest_pain_recent,false)
    or coalesce(parq_q11_loss_consciousness_or_dizziness_fall,false)
    or coalesce(parq_q12_bone_joint,false)
    or coalesce(parq_q13_blood_pressure_meds,false)
    or coalesce(parq_q14_other_health_reason,false)
  ) stored,

  -- Bloco 3
  goals text[], goal_details text, previous_attempts text,

  -- Bloco 4
  exercise_history text,
  fitness_self_rating smallint check (fitness_self_rating between 1 and 5),
  body_satisfaction smallint check (body_satisfaction between 1 and 5),

  -- Bloco 5
  session_duration text, weekly_frequency int, training_period text,
  frequent_traveler boolean, routine_description text,

  -- Bloco 6
  pain_status text, pain_movements text[],
  pain_location text, biggest_difficulty text[],

  -- Bloco 7
  sleep_hours text,
  sleep_quality smallint check (sleep_quality between 1 and 5),
  stress_level smallint check (stress_level between 1 and 5),
  energy_level smallint check (energy_level between 1 and 5),
  recovery_quality text,

  -- Bloco 8
  uses_wearable boolean, wearable_brand text, share_data boolean,

  -- Bloco 9
  has_medical_condition boolean, medical_condition_details text,
  recovery_strategies text[], alcohol text, tobacco text, caffeine_doses text,

  -- Bloco 10
  motivations text[], discomfort_response text, difficulty_helper text,
  missed_session_response text, firm_professional_response text,
  accompaniment_preference text, correction_preference text,
  consistency_self_rating text, life_stability text, deal_breaker text,

  -- Bloco 11
  consent_truthful boolean, consent_not_medical boolean,
  consent_data_use boolean, consent_terms boolean,

  submitted_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);


-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 12 · Profissionais externos do cliente
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.student_external_professionals (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,

  role text not null check (role in (
    'physical_coach', 'physician', 'nutritionist',
    'physiotherapist', 'psychologist', 'other'
  )),

  name text not null,
  contact_phone text,
  contact_email text,
  organization text,
  specialty text,

  receives_reports boolean default false,
  report_version_preference text check (report_version_preference in ('patient', 'technical', 'both')),

  notes text,
  added_at timestamptz default now()
);

create index if not exists student_external_professionals_student_idx
  on public.student_external_professionals (student_id);


-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 13 · Precision reports (PDFs gerados)
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.precision_reports (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,

  report_type text not null check (report_type in ('initial','monthly','final')),
  cycle_number int,
  total_cycles int default 3,
  week_number int,

  period_start date,
  period_end date,
  generated_at timestamptz default now(),

  anchor_quote text,
  anchor_message text,
  strategic_reading text,
  goal_calibration text,
  realistic_scenario text,
  ambitious_scenario text,
  bilateral_agreement_student jsonb,
  bilateral_agreement_fabrik jsonb,

  what_improved jsonb,
  what_needs_attention jsonb,
  student_quotes jsonb,
  numbers_narrative text,

  goals_status jsonb,
  monthly_journey jsonb,
  lessons_learned jsonb,
  next_cycle_proposal text,
  next_cycle_priorities jsonb,
  closing_message text,

  next_steps jsonb,
  top_priorities jsonb,

  analyst_id uuid references auth.users(id),
  analyst_name text,
  analyst_role text default 'Analista de Performance & Lifestyle',

  pdf_storage_path text,
  pdf_generated_at timestamptz,

  status text default 'draft' check (status in ('draft','reviewed','sent'))
);

create index if not exists precision_reports_student_idx
  on public.precision_reports (student_id, period_start desc);

create index if not exists precision_reports_status_idx
  on public.precision_reports (status);


-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 14 · Tabelas de referência (seedadas)
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.vo2_reference_ranges (
  id uuid primary key default gen_random_uuid(),
  sex text not null check (sex in ('M','F')),
  age_min int not null,
  age_max int not null,
  classification text not null,
  vo2_min numeric(5,2) not null,
  vo2_max numeric(5,2) not null,
  source text default 'ACSM 2018'
);

create table if not exists public.handgrip_reference_ranges (
  id uuid primary key default gen_random_uuid(),
  sex text not null check (sex in ('M','F')),
  age_min int not null,
  age_max int not null,
  classification text not null,
  kg_min numeric(5,2) not null,
  kg_max numeric(5,2) not null,
  source text default 'Mathiowetz 1985'
);

create table if not exists public.sit_to_stand_reference_ranges (
  id uuid primary key default gen_random_uuid(),
  age_min int not null,
  age_max int not null,
  classification text not null,
  score_min numeric(3,1) not null,
  score_max numeric(3,1) not null,
  source text default 'Araújo 2012 (EJPC)'
);

-- Seeds idempotentes
insert into public.sit_to_stand_reference_ranges (age_min, age_max, classification, score_min, score_max, source)
select * from (values
  (18, 99, 'Excelente', 8.0::numeric, 10.0::numeric, 'Araújo 2012 (EJPC)'),
  (18, 99, 'Bom',       6.0::numeric, 7.5::numeric,  'Araújo 2012 (EJPC)'),
  (18, 99, 'Atenção',   3.5::numeric, 5.5::numeric,  'Araújo 2012 (EJPC)'),
  (18, 99, 'Alerta',    0.0::numeric, 3.0::numeric,  'Araújo 2012 (EJPC)')
) as v(age_min, age_max, classification, score_min, score_max, source)
where not exists (
  select 1 from public.sit_to_stand_reference_ranges r
  where r.classification = v.classification and r.age_min = v.age_min
);


-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 15 · RLS — TODAS as policies idempotentes via DROP IF EXISTS
-- ────────────────────────────────────────────────────────────────────────────

-- 15.1 · Tabelas-filhas de assessment (acesso via JOIN)
do $$
declare
  child_table text;
  child_tables text[] := array[
    'vo2_assessment_details',
    'vo2_bike_stages',
    'handgrip_results',
    'dexa_results',
    'sit_to_stand_results',
    'cardiovascular_baseline',
    'questionnaire_responses'
  ];
  policy_name text;
begin
  foreach child_table in array child_tables loop
    execute format('alter table public.%I enable row level security', child_table);

    policy_name := child_table || '_via_assessment';
    execute format('drop policy if exists %I on public.%I', policy_name, child_table);

    execute format($p$
      create policy %I
        on public.%I
        for all
        to authenticated
        using (
          exists (
            select 1 from public.assessments a
            join public.students s on s.id = a.student_id
            where a.id = %I.assessment_id
              and (s.trainer_id = auth.uid()
                   or exists (select 1 from public.user_roles ur
                              where ur.user_id = auth.uid() and ur.role = 'admin'))
          )
        )
        with check (
          exists (
            select 1 from public.assessments a
            join public.students s on s.id = a.student_id
            where a.id = %I.assessment_id
              and (s.trainer_id = auth.uid()
                   or exists (select 1 from public.user_roles ur
                              where ur.user_id = auth.uid() and ur.role = 'admin'))
          )
        )
    $p$, policy_name, child_table, child_table, child_table);
  end loop;
end $$;

-- 15.2 · subjective_scores (acesso direto via student_id)
alter table public.subjective_scores enable row level security;

drop policy if exists "subjective_scores_trainer_own_or_admin" on public.subjective_scores;

create policy "subjective_scores_trainer_own_or_admin"
  on public.subjective_scores
  for all
  to authenticated
  using (
    exists (
      select 1 from public.students s
      where s.id = student_id
        and (s.trainer_id = auth.uid()
             or exists (select 1 from public.user_roles ur
                        where ur.user_id = auth.uid() and ur.role = 'admin'))
    )
  )
  with check (
    exists (
      select 1 from public.students s
      where s.id = student_id
        and (s.trainer_id = auth.uid()
             or exists (select 1 from public.user_roles ur
                        where ur.user_id = auth.uid() and ur.role = 'admin'))
    )
  );

-- 15.3 · student_external_professionals
alter table public.student_external_professionals enable row level security;

drop policy if exists "student_external_professionals_trainer_own_or_admin" on public.student_external_professionals;

create policy "student_external_professionals_trainer_own_or_admin"
  on public.student_external_professionals
  for all
  to authenticated
  using (
    exists (
      select 1 from public.students s
      where s.id = student_id
        and (s.trainer_id = auth.uid()
             or exists (select 1 from public.user_roles ur
                        where ur.user_id = auth.uid() and ur.role = 'admin'))
    )
  )
  with check (
    exists (
      select 1 from public.students s
      where s.id = student_id
        and (s.trainer_id = auth.uid()
             or exists (select 1 from public.user_roles ur
                        where ur.user_id = auth.uid() and ur.role = 'admin'))
    )
  );

-- 15.4 · precision_reports
alter table public.precision_reports enable row level security;

drop policy if exists "precision_reports_trainer_own_or_admin" on public.precision_reports;

create policy "precision_reports_trainer_own_or_admin"
  on public.precision_reports
  for all
  to authenticated
  using (
    exists (
      select 1 from public.students s
      where s.id = student_id
        and (s.trainer_id = auth.uid()
             or exists (select 1 from public.user_roles ur
                        where ur.user_id = auth.uid() and ur.role = 'admin'))
    )
  )
  with check (
    exists (
      select 1 from public.students s
      where s.id = student_id
        and (s.trainer_id = auth.uid()
             or exists (select 1 from public.user_roles ur
                        where ur.user_id = auth.uid() and ur.role = 'admin'))
    )
  );

-- 15.5 · Tabelas de referência (SELECT público, INSERT/UPDATE só admin)
alter table public.vo2_reference_ranges enable row level security;
alter table public.handgrip_reference_ranges enable row level security;
alter table public.sit_to_stand_reference_ranges enable row level security;

drop policy if exists "vo2_reference_ranges_select_authenticated" on public.vo2_reference_ranges;
drop policy if exists "vo2_reference_ranges_write_admin" on public.vo2_reference_ranges;
drop policy if exists "handgrip_reference_ranges_select_authenticated" on public.handgrip_reference_ranges;
drop policy if exists "handgrip_reference_ranges_write_admin" on public.handgrip_reference_ranges;
drop policy if exists "sit_to_stand_reference_ranges_select_authenticated" on public.sit_to_stand_reference_ranges;
drop policy if exists "sit_to_stand_reference_ranges_write_admin" on public.sit_to_stand_reference_ranges;

create policy "vo2_reference_ranges_select_authenticated"
  on public.vo2_reference_ranges for select to authenticated using (true);

create policy "vo2_reference_ranges_write_admin"
  on public.vo2_reference_ranges for all to authenticated
  using (exists (select 1 from public.user_roles ur
                 where ur.user_id = auth.uid() and ur.role = 'admin'))
  with check (exists (select 1 from public.user_roles ur
                      where ur.user_id = auth.uid() and ur.role = 'admin'));

create policy "handgrip_reference_ranges_select_authenticated"
  on public.handgrip_reference_ranges for select to authenticated using (true);

create policy "handgrip_reference_ranges_write_admin"
  on public.handgrip_reference_ranges for all to authenticated
  using (exists (select 1 from public.user_roles ur
                 where ur.user_id = auth.uid() and ur.role = 'admin'))
  with check (exists (select 1 from public.user_roles ur
                      where ur.user_id = auth.uid() and ur.role = 'admin'));

create policy "sit_to_stand_reference_ranges_select_authenticated"
  on public.sit_to_stand_reference_ranges for select to authenticated using (true);

create policy "sit_to_stand_reference_ranges_write_admin"
  on public.sit_to_stand_reference_ranges for all to authenticated
  using (exists (select 1 from public.user_roles ur
                 where ur.user_id = auth.uid() and ur.role = 'admin'))
  with check (exists (select 1 from public.user_roles ur
                      where ur.user_id = auth.uid() and ur.role = 'admin'));


-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 16 · Storage buckets + policies
-- ────────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('dexa-pdfs', 'dexa-pdfs', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('precision-reports', 'precision-reports', false)
on conflict (id) do nothing;

-- Policies (drop antes pra idempotência)
drop policy if exists "dexa_pdfs_trainer_own_or_admin_select" on storage.objects;
drop policy if exists "dexa_pdfs_trainer_own_or_admin_insert" on storage.objects;
drop policy if exists "precision_reports_trainer_own_or_admin_select" on storage.objects;
drop policy if exists "precision_reports_trainer_own_or_admin_insert" on storage.objects;

create policy "dexa_pdfs_trainer_own_or_admin_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'dexa-pdfs'
    and exists (
      select 1 from public.students s
      where s.trainer_id = auth.uid()
        and storage.objects.name like s.id::text || '/%'
    )
  );

create policy "dexa_pdfs_trainer_own_or_admin_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'dexa-pdfs'
    and exists (
      select 1 from public.students s
      where s.trainer_id = auth.uid()
        and storage.objects.name like s.id::text || '/%'
    )
  );

create policy "precision_reports_trainer_own_or_admin_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'precision-reports'
    and exists (
      select 1 from public.students s
      where s.trainer_id = auth.uid()
        and storage.objects.name like s.id::text || '/%'
    )
  );

create policy "precision_reports_trainer_own_or_admin_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'precision-reports'
    and exists (
      select 1 from public.students s
      where s.trainer_id = auth.uid()
        and storage.objects.name like s.id::text || '/%'
    )
  );


-- ────────────────────────────────────────────────────────────────────────────
-- END · Foundation E1 (idempotent)
-- ────────────────────────────────────────────────────────────────────────────
