do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'assessments'
      and column_name = 'professional_id'
  ) then
    alter table public.assessments add column professional_id uuid;
  end if;
  alter table public.assessments alter column professional_id drop not null;
end $$;

comment on column public.assessments.professional_id is 'LEGACY · coexiste com trainer_id desde a migration de 2026-05-13. Código novo (Precision 12) escreve apenas trainer_id. Manter nullable até auditoria de uso em queries antigas confirmar que pode ser dropada.';

comment on column public.assessments.trainer_id is 'CANÔNICO · referência ao coach responsável pela avaliação. Substitui professional_id legacy.';

drop policy if exists "dexa_pdfs_trainer_own_or_admin_select" on storage.objects;
drop policy if exists "dexa_pdfs_trainer_own_or_admin_insert" on storage.objects;
drop policy if exists "dexa_pdfs_trainer_own_or_admin_update" on storage.objects;
drop policy if exists "dexa_pdfs_trainer_own_or_admin_delete" on storage.objects;

create policy "dexa_pdfs_trainer_own_or_admin_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'dexa-pdfs'
    and (
      exists (select 1 from public.students s where s.trainer_id = auth.uid() and storage.objects.name like s.id::text || '/%')
      or exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin')
    )
  );

create policy "dexa_pdfs_trainer_own_or_admin_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'dexa-pdfs'
    and (
      exists (select 1 from public.students s where s.trainer_id = auth.uid() and storage.objects.name like s.id::text || '/%')
      or exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin')
    )
  );

create policy "dexa_pdfs_trainer_own_or_admin_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'dexa-pdfs'
    and (
      exists (select 1 from public.students s where s.trainer_id = auth.uid() and storage.objects.name like s.id::text || '/%')
      or exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin')
    )
  )
  with check (
    bucket_id = 'dexa-pdfs'
    and (
      exists (select 1 from public.students s where s.trainer_id = auth.uid() and storage.objects.name like s.id::text || '/%')
      or exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin')
    )
  );

create policy "dexa_pdfs_trainer_own_or_admin_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'dexa-pdfs'
    and exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin')
  );

drop policy if exists "precision_reports_trainer_own_or_admin_select" on storage.objects;
drop policy if exists "precision_reports_trainer_own_or_admin_insert" on storage.objects;
drop policy if exists "precision_reports_trainer_own_or_admin_update" on storage.objects;
drop policy if exists "precision_reports_trainer_own_or_admin_delete" on storage.objects;

create policy "precision_reports_trainer_own_or_admin_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'precision-reports'
    and (
      exists (select 1 from public.students s where s.trainer_id = auth.uid() and storage.objects.name like s.id::text || '/%')
      or exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin')
    )
  );

create policy "precision_reports_trainer_own_or_admin_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'precision-reports'
    and (
      exists (select 1 from public.students s where s.trainer_id = auth.uid() and storage.objects.name like s.id::text || '/%')
      or exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin')
    )
  );

create policy "precision_reports_trainer_own_or_admin_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'precision-reports'
    and (
      exists (select 1 from public.students s where s.trainer_id = auth.uid() and storage.objects.name like s.id::text || '/%')
      or exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin')
    )
  )
  with check (
    bucket_id = 'precision-reports'
    and (
      exists (select 1 from public.students s where s.trainer_id = auth.uid() and storage.objects.name like s.id::text || '/%')
      or exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin')
    )
  );

create policy "precision_reports_trainer_own_or_admin_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'precision-reports'
    and exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin')
  );

comment on column public.sit_to_stand_results.total_score is 'Regra MVP: coach calcula sit_score/rise_score manualmente seguindo método Fabrik (cada hemiteste 0-5, desconto -1 por apoio e -0.5 por instabilidade). UI mostra preview em tempo real ao lado do input. Generated column apenas soma os dois hemitestes. jsonb sit_supports/rise_supports + int sit_instabilities/rise_instabilities são preservados como audit trail / display no PDF.';

comment on column public.sit_to_stand_results.sit_supports is 'AUDIT TRAIL · contagem de apoios na fase sentar (mão, joelho, antebraço, lateral perna, mão no joelho). Não recalcula sit_score.';

comment on column public.sit_to_stand_results.rise_supports is 'AUDIT TRAIL · contagem de apoios na fase levantar (idem sit_supports).';

comment on table public.questionnaire_responses is 'Self-administered via link mágico (padrão Oura connect). Edge function valida token e escreve via service role, bypassando RLS. Aluno não tem acesso direto à tabela. Coach + admin acessam via JOIN com assessments → students (policy questionnaire_responses_via_assessment).';
