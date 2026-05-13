-- ============================================================================
-- Precision 12 — atomic assessment creation RPC
-- ============================================================================
-- Client-side Supabase JS cannot wrap parent + child + optional rows in one
-- transaction. This RPC is SECURITY INVOKER, so normal RLS still applies, but
-- Postgres executes the whole create flow atomically: any child insert failure
-- rolls back the parent assessment too.
-- ============================================================================

ALTER TABLE public.assessments
  ADD COLUMN IF NOT EXISTS professional_id uuid;

ALTER TABLE public.assessments
  ALTER COLUMN professional_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.create_precision12_assessment(
  p_parent jsonb,
  p_child_kind text,
  p_child_data jsonb DEFAULT '{}'::jsonb,
  p_bike_stages jsonb DEFAULT '[]'::jsonb,
  p_cardiovascular jsonb DEFAULT NULL,
  p_subjective jsonb DEFAULT NULL
)
RETURNS public.assessments
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_student_id uuid;
  v_student_trainer_id uuid;
  v_trainer_id uuid;
  v_assessment public.assessments%ROWTYPE;
  v_status text;
  v_assessment_type text;
  v_child_kind text := COALESCE(NULLIF(p_child_kind, ''), 'none');
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  IF p_parent IS NULL OR jsonb_typeof(p_parent) <> 'object' THEN
    RAISE EXCEPTION 'Invalid parent payload';
  END IF;

  v_student_id := NULLIF(p_parent->>'student_id', '')::uuid;
  v_assessment_type := NULLIF(p_parent->>'assessment_type', '');
  v_status := COALESCE(NULLIF(p_parent->>'status', ''), 'in_progress');

  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'student_id is required';
  END IF;
  IF v_assessment_type IS NULL THEN
    RAISE EXCEPTION 'assessment_type is required';
  END IF;

  SELECT s.trainer_id
    INTO v_student_trainer_id
    FROM public.students s
   WHERE s.id = v_student_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_student_trainer_id IS DISTINCT FROM v_caller
     AND NOT public.has_role(v_caller, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Access denied for this student' USING ERRCODE = '42501';
  END IF;

  v_trainer_id := COALESCE(v_student_trainer_id, v_caller);

  IF v_child_kind = 'questionnaire'
     OR v_assessment_type = 'questionnaire_precision12' THEN
    RAISE EXCEPTION 'Questionnaire assessments must be created via the magic-link edge function'
      USING ERRCODE = '42501';
  END IF;

  IF v_child_kind NOT IN ('vo2', 'handgrip', 'dexa', 'sit_to_stand', 'none') THEN
    RAISE EXCEPTION 'Invalid child payload kind';
  END IF;

  IF v_child_kind = 'none' AND v_status = 'completed' THEN
    RAISE EXCEPTION 'Completed assessments require a child payload';
  END IF;

  IF v_assessment_type = 'sit_to_stand' AND v_child_kind <> 'sit_to_stand' THEN
    RAISE EXCEPTION 'sit_to_stand assessment requires sit_to_stand child payload';
  END IF;
  IF v_assessment_type = 'handgrip' AND v_child_kind <> 'handgrip' THEN
    RAISE EXCEPTION 'handgrip assessment requires handgrip child payload';
  END IF;
  IF v_assessment_type = 'dexa' AND v_child_kind <> 'dexa' THEN
    RAISE EXCEPTION 'dexa assessment requires dexa child payload';
  END IF;
  IF v_assessment_type LIKE 'vo2_%' AND v_child_kind <> 'vo2' THEN
    RAISE EXCEPTION 'vo2 assessment requires vo2 child payload';
  END IF;

  INSERT INTO public.assessments (
    student_id,
    trainer_id,
    professional_id,
    assessment_type,
    assessment_date,
    status,
    age_years,
    weight_kg,
    height_cm,
    sex,
    notes
  )
  VALUES (
    v_student_id,
    v_trainer_id,
    v_trainer_id,
    v_assessment_type,
    COALESCE(NULLIF(p_parent->>'assessment_date', '')::date, CURRENT_DATE),
    v_status,
    NULLIF(p_parent->>'age_years', '')::int,
    NULLIF(p_parent->>'weight_kg', '')::numeric,
    NULLIF(p_parent->>'height_cm', '')::numeric,
    NULLIF(p_parent->>'sex', ''),
    NULLIF(p_parent->>'notes', '')
  )
  RETURNING * INTO v_assessment;

  IF v_child_kind = 'vo2' THEN
    INSERT INTO public.vo2_assessment_details (
      assessment_id,
      fc_max_predicted,
      fc_peak,
      vo2_final,
      vo2_classification,
      recovery_drop_1min,
      recovery_classification,
      total_time_min,
      final_speed_kmh,
      final_incline_pct,
      protocol_name,
      last_valid_load,
      last_valid_watts,
      abort_reason
    )
    SELECT
      v_assessment.id,
      x.fc_max_predicted,
      x.fc_peak,
      x.vo2_final,
      x.vo2_classification,
      x.recovery_drop_1min,
      x.recovery_classification,
      x.total_time_min,
      x.final_speed_kmh,
      x.final_incline_pct,
      x.protocol_name,
      x.last_valid_load,
      x.last_valid_watts,
      x.abort_reason
    FROM jsonb_to_record(COALESCE(p_child_data, '{}'::jsonb)) AS x(
      fc_max_predicted int,
      fc_peak int,
      vo2_final numeric,
      vo2_classification text,
      recovery_drop_1min int,
      recovery_classification text,
      total_time_min numeric,
      final_speed_kmh numeric,
      final_incline_pct numeric,
      protocol_name text,
      last_valid_load numeric,
      last_valid_watts int,
      abort_reason text
    );

    IF p_bike_stages IS NOT NULL
       AND jsonb_typeof(p_bike_stages) = 'array'
       AND jsonb_array_length(p_bike_stages) > 0 THEN
      INSERT INTO public.vo2_bike_stages (
        assessment_id,
        stage_order,
        time_label,
        phase,
        load_value,
        rpm_target,
        watts_observed,
        hr_final,
        pse,
        vo2_estimated,
        notes
      )
      SELECT
        v_assessment.id,
        s.stage_order,
        s.time_label,
        s.phase,
        s.load_value,
        s.rpm_target,
        s.watts_observed,
        s.hr_final,
        s.pse,
        s.vo2_estimated,
        s.notes
      FROM jsonb_to_recordset(p_bike_stages) AS s(
        stage_order int,
        time_label text,
        phase text,
        load_value numeric,
        rpm_target text,
        watts_observed int,
        hr_final int,
        pse int,
        vo2_estimated numeric,
        notes text
      );
    END IF;
  ELSIF v_child_kind = 'handgrip' THEN
    INSERT INTO public.handgrip_results (
      assessment_id,
      dominant_hand,
      right_kg_attempts,
      left_kg_attempts,
      right_kg,
      left_kg,
      classification
    )
    VALUES (
      v_assessment.id,
      NULLIF(p_child_data->>'dominant_hand', ''),
      COALESCE((SELECT array_agg(value::numeric) FROM jsonb_array_elements_text(COALESCE(p_child_data->'right_kg_attempts', '[]'::jsonb))), '{}'::numeric[]),
      COALESCE((SELECT array_agg(value::numeric) FROM jsonb_array_elements_text(COALESCE(p_child_data->'left_kg_attempts', '[]'::jsonb))), '{}'::numeric[]),
      NULLIF(p_child_data->>'right_kg', '')::numeric,
      NULLIF(p_child_data->>'left_kg', '')::numeric,
      NULLIF(p_child_data->>'classification', '')
    );
  ELSIF v_child_kind = 'dexa' THEN
    INSERT INTO public.dexa_results (
      assessment_id,
      total_mass_kg,
      fat_mass_kg,
      fat_pct,
      lean_mass_kg,
      bone_mass_kg,
      bone_density_z_score,
      visceral_fat_g,
      android_gynoid_ratio,
      scan_pdf_url,
      bmr_harris_benedict_kcal,
      bmr_mifflin_stjeor_kcal,
      appendicular_lean_mass_kg,
      imma_baumgartner,
      fmi,
      fat_percentile,
      regional_distribution,
      conclusion_text,
      scan_pdf_storage_path,
      raw_extracted_json,
      extraction_confidence,
      extraction_method
    )
    SELECT
      v_assessment.id,
      x.total_mass_kg,
      x.fat_mass_kg,
      x.fat_pct,
      x.lean_mass_kg,
      x.bone_mass_kg,
      x.bone_density_z_score,
      x.visceral_fat_g,
      x.android_gynoid_ratio,
      x.scan_pdf_url,
      x.bmr_harris_benedict_kcal,
      x.bmr_mifflin_stjeor_kcal,
      x.appendicular_lean_mass_kg,
      x.imma_baumgartner,
      x.fmi,
      x.fat_percentile,
      x.regional_distribution,
      x.conclusion_text,
      x.scan_pdf_storage_path,
      x.raw_extracted_json,
      x.extraction_confidence,
      x.extraction_method
    FROM jsonb_to_record(COALESCE(p_child_data, '{}'::jsonb)) AS x(
      total_mass_kg numeric,
      fat_mass_kg numeric,
      fat_pct numeric,
      lean_mass_kg numeric,
      bone_mass_kg numeric,
      bone_density_z_score numeric,
      visceral_fat_g numeric,
      android_gynoid_ratio numeric,
      scan_pdf_url text,
      bmr_harris_benedict_kcal int,
      bmr_mifflin_stjeor_kcal int,
      appendicular_lean_mass_kg numeric,
      imma_baumgartner numeric,
      fmi numeric,
      fat_percentile int,
      regional_distribution jsonb,
      conclusion_text text,
      scan_pdf_storage_path text,
      raw_extracted_json jsonb,
      extraction_confidence numeric,
      extraction_method text
    );
  ELSIF v_child_kind = 'sit_to_stand' THEN
    INSERT INTO public.sit_to_stand_results (
      assessment_id,
      sit_score,
      sit_supports,
      sit_instabilities,
      rise_score,
      rise_supports,
      rise_instabilities,
      classification,
      notes
    )
    SELECT
      v_assessment.id,
      x.sit_score,
      COALESCE(x.sit_supports, '{}'::jsonb),
      COALESCE(x.sit_instabilities, 0),
      x.rise_score,
      COALESCE(x.rise_supports, '{}'::jsonb),
      COALESCE(x.rise_instabilities, 0),
      x.classification,
      x.notes
    FROM jsonb_to_record(COALESCE(p_child_data, '{}'::jsonb)) AS x(
      sit_score numeric,
      sit_supports jsonb,
      sit_instabilities int,
      rise_score numeric,
      rise_supports jsonb,
      rise_instabilities int,
      classification text,
      notes text
    );
  END IF;

  IF p_cardiovascular IS NOT NULL AND jsonb_typeof(p_cardiovascular) = 'object' THEN
    INSERT INTO public.cardiovascular_baseline (
      assessment_id,
      systolic_mmhg,
      diastolic_mmhg,
      resting_hr_bpm,
      on_medication,
      medication_details,
      reference_doctor_name,
      reference_doctor_contact,
      classification
    )
    SELECT
      v_assessment.id,
      x.systolic_mmhg,
      x.diastolic_mmhg,
      x.resting_hr_bpm,
      COALESCE(x.on_medication, false),
      x.medication_details,
      x.reference_doctor_name,
      x.reference_doctor_contact,
      x.classification
    FROM jsonb_to_record(p_cardiovascular) AS x(
      systolic_mmhg int,
      diastolic_mmhg int,
      resting_hr_bpm int,
      on_medication boolean,
      medication_details text,
      reference_doctor_name text,
      reference_doctor_contact text,
      classification text
    );
  END IF;

  IF p_subjective IS NOT NULL AND jsonb_typeof(p_subjective) = 'object' THEN
    INSERT INTO public.subjective_scores (
      student_id,
      assessment_id,
      recorded_at,
      sleep_score,
      energy_score,
      stress_score,
      recovery_score,
      wellbeing_score,
      mood_score,
      notes
    )
    SELECT
      v_student_id,
      v_assessment.id,
      COALESCE(x.recorded_at, v_assessment.assessment_date),
      x.sleep_score,
      x.energy_score,
      x.stress_score,
      x.recovery_score,
      x.wellbeing_score,
      x.mood_score,
      x.notes
    FROM jsonb_to_record(p_subjective) AS x(
      recorded_at date,
      sleep_score smallint,
      energy_score smallint,
      stress_score smallint,
      recovery_score smallint,
      wellbeing_score smallint,
      mood_score smallint,
      notes text
    );
  END IF;

  RETURN v_assessment;
END;
$$;

REVOKE ALL ON FUNCTION public.create_precision12_assessment(jsonb, text, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_precision12_assessment(jsonb, text, jsonb, jsonb, jsonb, jsonb) TO authenticated;

COMMENT ON FUNCTION public.create_precision12_assessment(jsonb, text, jsonb, jsonb, jsonb, jsonb) IS
  'Atomic Precision 12 assessment create. SECURITY INVOKER: respects RLS, but runs parent + child + optional rows in one Postgres transaction.';
