
-- Add nullable column
ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS exercise_library_id uuid NULL;

-- Add FK constraint (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'exercises_exercise_library_id_fkey'
  ) THEN
    ALTER TABLE public.exercises
      ADD CONSTRAINT exercises_exercise_library_id_fkey
      FOREIGN KEY (exercise_library_id)
      REFERENCES public.exercises_library(id)
      ON DELETE SET NULL;
  END IF;
END$$;

-- Index
CREATE INDEX IF NOT EXISTS idx_exercises_exercise_library_id
  ON public.exercises(exercise_library_id);

-- Conservative backfill: only unique exact (case-insensitive, trimmed) matches
WITH norm_lib AS (
  SELECT id, lower(trim(name)) AS k,
         count(*) OVER (PARTITION BY lower(trim(name))) AS dup
  FROM public.exercises_library
),
unique_lib AS (
  SELECT k, id FROM norm_lib WHERE dup = 1
)
UPDATE public.exercises e
SET exercise_library_id = ul.id
FROM unique_lib ul
WHERE e.exercise_library_id IS NULL
  AND lower(trim(e.exercise_name)) = ul.k;
