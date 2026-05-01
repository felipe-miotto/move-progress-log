-- Adds a stable library reference to executed session exercises.
-- The historical exercise_name snapshot is intentionally preserved.

ALTER TABLE public.exercises
ADD COLUMN IF NOT EXISTS exercise_library_id UUID NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'exercises_exercise_library_id_fkey'
      AND conrelid = 'public.exercises'::regclass
  ) THEN
    ALTER TABLE public.exercises
    ADD CONSTRAINT exercises_exercise_library_id_fkey
    FOREIGN KEY (exercise_library_id)
    REFERENCES public.exercises_library(id)
    ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_exercises_exercise_library_id
ON public.exercises(exercise_library_id);

-- Conservative backfill: only exact, case-insensitive matches where the
-- normalized library name is unique. Ambiguous/fuzzy matches stay NULL for
-- manual review instead of risking an incorrect historical link.
WITH unique_library_names AS (
  SELECT
    lower(trim(name)) AS normalized_name,
    min(id) AS exercise_library_id,
    count(*) AS match_count
  FROM public.exercises_library
  WHERE name IS NOT NULL
    AND trim(name) <> ''
  GROUP BY lower(trim(name))
  HAVING count(*) = 1
)
UPDATE public.exercises AS e
SET exercise_library_id = u.exercise_library_id
FROM unique_library_names AS u
WHERE e.exercise_library_id IS NULL
  AND lower(trim(e.exercise_name)) = u.normalized_name;
