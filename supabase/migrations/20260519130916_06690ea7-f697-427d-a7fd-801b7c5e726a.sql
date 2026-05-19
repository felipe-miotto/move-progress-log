ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS reserve_reps text NULL;

COMMENT ON COLUMN public.exercises.reserve_reps IS
  'Executed reserve/reps-in-reserve note for this set/exercise, e.g. 0, 2-3, 4+, RM. Free text by design to preserve coach input.';