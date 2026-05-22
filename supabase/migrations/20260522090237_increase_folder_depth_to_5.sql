-- PR 1: raise the prescription-folder nesting limit from 3 to 5 levels.
--
-- prescription_folders.depth_level is 0-based. The original limit
-- (migrations 20251113105809 / 20251113105824) was depth_level <= 3,
-- enforced by BOTH the check_max_depth constraint and the
-- update_folder_full_path() trigger function. This migration raises both
-- to 5. Existing folders (depth 0-3) stay valid -- no data change needed.

-- 1) Relax the depth constraint to 0..5.
ALTER TABLE public.prescription_folders
  DROP CONSTRAINT IF EXISTS check_max_depth;
ALTER TABLE public.prescription_folders
  ADD CONSTRAINT check_max_depth CHECK (depth_level <= 5);

-- 2) Recreate update_folder_full_path() with the 5-level limit. SECURITY
--    DEFINER + search_path are preserved; CREATE OR REPLACE keeps the same
--    function OID, so the existing trigger_update_folder_full_path trigger
--    keeps working unchanged.
CREATE OR REPLACE FUNCTION public.update_folder_full_path()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parent_path TEXT;
  parent_depth INTEGER;
BEGIN
  -- If no parent, path is just the name.
  IF NEW.parent_id IS NULL THEN
    NEW.full_path := NEW.name;
    NEW.depth_level := 0;
  ELSE
    -- Get parent's full path and depth.
    SELECT full_path, depth_level INTO parent_path, parent_depth
    FROM prescription_folders
    WHERE id = NEW.parent_id;

    -- Depth limit: a parent must be at depth < 5 to accept children.
    IF parent_depth >= 5 THEN
      RAISE EXCEPTION 'Maximum folder depth (5 levels) exceeded';
    END IF;

    -- Build full path.
    NEW.full_path := parent_path || ' > ' || NEW.name;
    NEW.depth_level := parent_depth + 1;
  END IF;

  RETURN NEW;
END;
$$;

-- 3) Composite index for trainer/parent/order_index lookups (folder lists
--    and sibling ordering). IF NOT EXISTS so the migration is idempotent.
CREATE INDEX IF NOT EXISTS idx_prescription_folders_trainer_parent_order
  ON public.prescription_folders (trainer_id, parent_id, order_index);
