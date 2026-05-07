-- Prevent new session exercise rows from reintroducing exercise_library_id = NULL.
-- Existing historical rows are intentionally preserved for manual curation.
-- Updates to legacy rows remain allowed unless they try to rename/reassign the exercise while still unlinked.

CREATE OR REPLACE FUNCTION public.enforce_session_exercise_library_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.exercise_library_id IS NULL THEN
    RAISE EXCEPTION 'exercise_library_id is required for new session exercises'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE'
    AND NEW.exercise_library_id IS NULL
    AND (
      NEW.exercise_name IS DISTINCT FROM OLD.exercise_name
      OR NEW.session_id IS DISTINCT FROM OLD.session_id
    ) THEN
    RAISE EXCEPTION 'exercise_library_id is required when changing a session exercise identity'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_session_exercise_library_id ON public.exercises;
CREATE TRIGGER trg_enforce_session_exercise_library_id
BEFORE INSERT OR UPDATE ON public.exercises
FOR EACH ROW
EXECUTE FUNCTION public.enforce_session_exercise_library_id();

REVOKE ALL ON FUNCTION public.enforce_session_exercise_library_id() FROM PUBLIC;
