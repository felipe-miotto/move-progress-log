create table if not exists public.precision12_questionnaire_links (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  trainer_id uuid not null references auth.users(id),
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create index if not exists idx_p12_links_assessment
  on public.precision12_questionnaire_links (assessment_id);

create index if not exists idx_p12_links_student
  on public.precision12_questionnaire_links (student_id);

create index if not exists idx_p12_links_expires_at
  on public.precision12_questionnaire_links (expires_at);

create unique index if not exists idx_p12_links_one_active_per_assessment
  on public.precision12_questionnaire_links (assessment_id)
  where used_at is null and revoked_at is null;

alter table public.precision12_questionnaire_links enable row level security;

drop policy if exists "p12_links_trainer_or_admin_select"
  on public.precision12_questionnaire_links;

create policy "p12_links_trainer_or_admin_select"
  on public.precision12_questionnaire_links
  for select to authenticated
  using (
    exists (
      select 1 from public.students s
      where s.id = precision12_questionnaire_links.student_id
        and s.trainer_id = auth.uid()
    )
    or public.has_role(auth.uid(), 'admin'::public.app_role)
  );

comment on table public.precision12_questionnaire_links is 'Tokens de link magico para o Questionario Precision 12. SELECT permitido apenas para coach dono ou admin. INSERT/UPDATE/DELETE somente via edge function com service role. Token puro nunca persiste; apenas SHA-256 em token_hash.';
comment on column public.precision12_questionnaire_links.token_hash is 'SHA-256 do token puro. Hex lowercase. O token puro NUNCA e persistido.';
comment on column public.precision12_questionnaire_links.expires_at is 'TTL do link. Edge function rejeita criacao com TTL > 14 dias. Default 7 dias.';
comment on column public.precision12_questionnaire_links.used_at is 'Setado pela edge function submit-precision12-questionnaire (E3.5) no submit final. Single-use.';
comment on column public.precision12_questionnaire_links.revoked_at is 'Setado quando link e revogado (coach refaz link ou cancela manualmente).';