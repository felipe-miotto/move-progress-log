ALTER TABLE public.prescription_folders DROP CONSTRAINT IF EXISTS check_max_depth;
ALTER TABLE public.prescription_folders ADD CONSTRAINT check_max_depth CHECK (depth_level <= 5);

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
  IF NEW.parent_id IS NULL THEN
    NEW.full_path := NEW.name;
    NEW.depth_level := 0;
  ELSE
    SELECT full_path, depth_level INTO parent_path, parent_depth
    FROM prescription_folders
    WHERE id = NEW.parent_id;

    IF parent_depth >= 5 THEN
      RAISE EXCEPTION 'Maximum folder depth (5 levels) exceeded';
    END IF;

    NEW.full_path := parent_path || ' > ' || NEW.name;
    NEW.depth_level := parent_depth + 1;
  END IF;

  RETURN NEW;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_prescription_folders_trainer_parent_order
  ON public.prescription_folders (trainer_id, parent_id, order_index);