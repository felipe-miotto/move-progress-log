-- ============================================================================
-- PRECISION 12 — Magic-link tokens para o Questionário (E3.4)
-- ============================================================================
-- Tabela dedicada para tokens de link mágico do Questionário Precision 12.
--
-- Decisões de arquitetura:
--   - Tabela NOVA (não reusa student_invites) — Precision 12 tem ciclo de
--     vida e RLS específicos; reuso aumentaria acoplamento e risco.
--   - Apenas `token_hash` (SHA-256) é persistido. O token puro vive
--     APENAS no momento da geração (retornado pra edge function).
--   - Cada link é single-use: `used_at` marca submit final.
--   - Coach pode revogar manualmente (`revoked_at`) ou refazer (edge
--     revoga ativo antes de criar novo).
--   - RLS: SELECT só pra coach dono do aluno ou admin; INSERT/UPDATE/
--     DELETE bloqueados via clientes — somente edge function (service
--     role) escreve.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 1 — Tabela
-- ────────────────────────────────────────────────────────────────────────────

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

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 2 — Índices
-- ────────────────────────────────────────────────────────────────────────────

create index if not exists idx_p12_links_assessment
  on public.precision12_questionnaire_links (assessment_id);

create index if not exists idx_p12_links_student
  on public.precision12_questionnaire_links (student_id);

create index if not exists idx_p12_links_expires_at
  on public.precision12_questionnaire_links (expires_at);

-- Garante 1 link ATIVO por assessment (não usado, não revogado, não expirado).
-- Permite múltiplos links históricos (revogados/usados/expirados).
create unique index if not exists idx_p12_links_one_active_per_assessment
  on public.precision12_questionnaire_links (assessment_id)
  where used_at is null and revoked_at is null;

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 3 — RLS
-- ────────────────────────────────────────────────────────────────────────────

alter table public.precision12_questionnaire_links enable row level security;

-- Coach dono do aluno OU admin podem ler.
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

-- INSERT / UPDATE / DELETE via clientes ficam BLOQUEADOS.
-- Edge function `create-precision12-questionnaire-link` usa service role
-- (bypassa RLS) para gravar. Outras escritas legítimas (revogação manual
-- via UI) vão por edge functions também — não por cliente direto.
--
-- Não há policies de INSERT/UPDATE/DELETE — qualquer write via client
-- authenticated será negado por padrão (RLS default deny).


-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 4 — COMMENTS (string literal única, sem ||  — gotcha Lovable)
-- ────────────────────────────────────────────────────────────────────────────

comment on table public.precision12_questionnaire_links is 'Tokens de link magico para o Questionario Precision 12. SELECT permitido apenas para coach dono ou admin. INSERT/UPDATE/DELETE somente via edge function com service role. Token puro nunca persiste; apenas SHA-256 em token_hash.';

comment on column public.precision12_questionnaire_links.token_hash is 'SHA-256 do token puro. Hex lowercase. O token puro NUNCA e persistido.';

comment on column public.precision12_questionnaire_links.expires_at is 'TTL do link. Edge function rejeita criacao com TTL > 14 dias. Default 7 dias.';

comment on column public.precision12_questionnaire_links.used_at is 'Setado pela edge function submit-precision12-questionnaire (E3.5) no submit final. Single-use.';

comment on column public.precision12_questionnaire_links.revoked_at is 'Setado quando link e revogado (coach refaz link ou cancela manualmente).';
