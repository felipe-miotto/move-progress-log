-- ============================================================================
-- PRECISION 12 — HARDENING PRÉ-E2 (resposta à auditoria externa Codex)
-- ============================================================================
-- Endereça 3 achados High da auditoria do PR #115 (commit 2d8eff4) que
-- estão a 1 SQL de distância:
--
--   H1+H2 · assessments.professional_id em prod é NOT NULL legacy,
--           mas migration greenfield não declara. Risco em ambientes novos
--           e divergência types.ts ↔ tipo manual.
--           → Tornar nullable + garantir presença em greenfield.
--
--   H5    · Storage policies dos buckets dexa-pdfs / precision-reports
--           têm nome trainer_own_or_admin mas só checam trainer_id.
--           Admin não passa. Falta também policy UPDATE pra upsert.
--           → Recriar 4 policies com OR admin branch + adicionar UPDATE.
--
-- Decisões MVP registradas via COMMENT (não viram código):
--
--   H3 · sit_to_stand_results.total_score continua simples (sit + rise).
--        Coach calcula score do hemiteste manualmente seguindo método
--        Fabrik (back to basics). jsonb supports + int instabilities
--        permanecem como audit trail. UI da E2 mostrará preview do
--        cálculo (5 − apoios − 0.5×instabilidades) ao lado do input pro
--        coach validar visualmente antes de digitar.
--
--   H4 · Questionário Precision 12 é self_administered via link mágico
--        (edge function escreve com service role, padrão Oura connect).
--        RLS de questionnaire_responses continua sem branch aluno.
--        Coach continua vendo via JOIN com students.trainer_id.
--
-- Idempotente: aplica greenfield + sobre prod sem destruir nada.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 1 · assessments.professional_id — nullable + presente em greenfield
-- ────────────────────────────────────────────────────────────────────────────

do $$
begin
  -- Garantir presença da coluna pra ambientes greenfield
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'assessments'
      and column_name = 'professional_id'
  ) then
    alter table public.assessments
      add column professional_id uuid;
  end if;

  -- Em prod, a coluna existe NOT NULL legacy.
  -- Código novo (Precision 12) usa trainer_id como referência canônica
  -- ao coach. Tornar nullable evita quebrar inserts feitos pelo módulo
  -- novo, e preserva integridade dos rows legados.
  alter table public.assessments
    alter column professional_id drop not null;
end $$;

comment on column public.assessments.professional_id is
  'LEGACY · coexiste com trainer_id desde a migration de 2026-05-13. ' ||
  'Código novo (Precision 12) escreve apenas trainer_id. Manter ' ||
  'nullable até auditoria de uso em queries antigas confirmar que ' ||
  'pode ser dropada.';

comment on column public.assessments.trainer_id is
  'CANÔNICO · referência ao coach responsável pela avaliação. ' ||
  'Substitui professional_id legacy.';


-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 2 · Storage policies — adicionar admin branch + UPDATE
-- ────────────────────────────────────────────────────────────────────────────

-- 2.1 · dexa-pdfs — drop antigas
drop policy if exists "dexa_pdfs_trainer_own_or_admin_select"
  on storage.objects;
drop policy if exists "dexa_pdfs_trainer_own_or_admin_insert"
  on storage.objects;
drop policy if exists "dexa_pdfs_trainer_own_or_admin_update"
  on storage.objects;
drop policy if exists "dexa_pdfs_trainer_own_or_admin_delete"
  on storage.objects;

-- 2.2 · dexa-pdfs — SELECT
create policy "dexa_pdfs_trainer_own_or_admin_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'dexa-pdfs'
    and (
      exists (
        select 1 from public.students s
        where s.trainer_id = auth.uid()
          and storage.objects.name like s.id::text || '/%'
      )
      or exists (
        select 1 from public.user_roles ur
        where ur.user_id = auth.uid()
          and ur.role = 'admin'
      )
    )
  );

-- 2.3 · dexa-pdfs — INSERT
create policy "dexa_pdfs_trainer_own_or_admin_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'dexa-pdfs'
    and (
      exists (
        select 1 from public.students s
        where s.trainer_id = auth.uid()
          and storage.objects.name like s.id::text || '/%'
      )
      or exists (
        select 1 from public.user_roles ur
        where ur.user_id = auth.uid()
          and ur.role = 'admin'
      )
    )
  );

-- 2.4 · dexa-pdfs — UPDATE (pra upsert / replace de PDF)
create policy "dexa_pdfs_trainer_own_or_admin_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'dexa-pdfs'
    and (
      exists (
        select 1 from public.students s
        where s.trainer_id = auth.uid()
          and storage.objects.name like s.id::text || '/%'
      )
      or exists (
        select 1 from public.user_roles ur
        where ur.user_id = auth.uid()
          and ur.role = 'admin'
      )
    )
  )
  with check (
    bucket_id = 'dexa-pdfs'
    and (
      exists (
        select 1 from public.students s
        where s.trainer_id = auth.uid()
          and storage.objects.name like s.id::text || '/%'
      )
      or exists (
        select 1 from public.user_roles ur
        where ur.user_id = auth.uid()
          and ur.role = 'admin'
      )
    )
  );

-- 2.5 · dexa-pdfs — DELETE (admin only, coach não deleta PDF clínico)
create policy "dexa_pdfs_trainer_own_or_admin_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'dexa-pdfs'
    and exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.role = 'admin'
    )
  );

-- 2.6 · precision-reports — drop antigas
drop policy if exists "precision_reports_trainer_own_or_admin_select"
  on storage.objects;
drop policy if exists "precision_reports_trainer_own_or_admin_insert"
  on storage.objects;
drop policy if exists "precision_reports_trainer_own_or_admin_update"
  on storage.objects;
drop policy if exists "precision_reports_trainer_own_or_admin_delete"
  on storage.objects;

-- 2.7 · precision-reports — SELECT
create policy "precision_reports_trainer_own_or_admin_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'precision-reports'
    and (
      exists (
        select 1 from public.students s
        where s.trainer_id = auth.uid()
          and storage.objects.name like s.id::text || '/%'
      )
      or exists (
        select 1 from public.user_roles ur
        where ur.user_id = auth.uid()
          and ur.role = 'admin'
      )
    )
  );

-- 2.8 · precision-reports — INSERT
create policy "precision_reports_trainer_own_or_admin_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'precision-reports'
    and (
      exists (
        select 1 from public.students s
        where s.trainer_id = auth.uid()
          and storage.objects.name like s.id::text || '/%'
      )
      or exists (
        select 1 from public.user_roles ur
        where ur.user_id = auth.uid()
          and ur.role = 'admin'
      )
    )
  );

-- 2.9 · precision-reports — UPDATE
create policy "precision_reports_trainer_own_or_admin_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'precision-reports'
    and (
      exists (
        select 1 from public.students s
        where s.trainer_id = auth.uid()
          and storage.objects.name like s.id::text || '/%'
      )
      or exists (
        select 1 from public.user_roles ur
        where ur.user_id = auth.uid()
          and ur.role = 'admin'
      )
    )
  )
  with check (
    bucket_id = 'precision-reports'
    and (
      exists (
        select 1 from public.students s
        where s.trainer_id = auth.uid()
          and storage.objects.name like s.id::text || '/%'
      )
      or exists (
        select 1 from public.user_roles ur
        where ur.user_id = auth.uid()
          and ur.role = 'admin'
      )
    )
  );

-- 2.10 · precision-reports — DELETE (admin only)
create policy "precision_reports_trainer_own_or_admin_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'precision-reports'
    and exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.role = 'admin'
    )
  );


-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 3 · Doc inline da regra MVP do total_score (H3)
-- ────────────────────────────────────────────────────────────────────────────

comment on column public.sit_to_stand_results.total_score is
  'Regra MVP: coach calcula sit_score/rise_score manualmente seguindo ' ||
  'método Fabrik (cada hemiteste 0-5, desconto -1 por apoio e -0.5 por ' ||
  'instabilidade). UI mostra preview em tempo real ao lado do input. ' ||
  'Generated column apenas soma os dois hemitestes. ' ||
  'jsonb sit_supports/rise_supports + int sit_instabilities/' ||
  'rise_instabilities são preservados como audit trail / display no PDF.';

comment on column public.sit_to_stand_results.sit_supports is
  'AUDIT TRAIL · contagem de apoios na fase sentar (mão, joelho, ' ||
  'antebraço, lateral perna, mão no joelho). Não recalcula sit_score.';

comment on column public.sit_to_stand_results.rise_supports is
  'AUDIT TRAIL · contagem de apoios na fase levantar (idem sit_supports).';


-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 4 · Doc inline do caminho do questionário (H4)
-- ────────────────────────────────────────────────────────────────────────────

comment on table public.questionnaire_responses is
  'Self-administered via link mágico (padrão Oura connect). ' ||
  'Edge function valida token e escreve via service role, bypassando RLS. ' ||
  'Aluno não tem acesso direto à tabela. Coach + admin acessam via JOIN ' ||
  'com assessments → students (policy questionnaire_responses_via_assessment).';
