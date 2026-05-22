-- PR 2: move_prescription_folder() RPC for drag-and-drop of folders.
CREATE OR REPLACE FUNCTION public.move_prescription_folder(
  p_folder_id uuid,
  p_new_parent_id uuid DEFAULT NULL,
  p_order_index integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_folder prescription_folders%ROWTYPE;
  v_parent prescription_folders%ROWTYPE;
  v_new_depth integer;
  v_subtree_height integer;
  v_order integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_folder
  FROM prescription_folders
  WHERE id = p_folder_id AND trainer_id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Folder not found or not owned by current user'
      USING ERRCODE = '42501';
  END IF;

  IF p_new_parent_id = p_folder_id THEN
    RAISE EXCEPTION 'Cannot move a folder into itself';
  END IF;

  IF p_new_parent_id IS NOT NULL THEN
    SELECT * INTO v_parent
    FROM prescription_folders
    WHERE id = p_new_parent_id AND trainer_id = v_uid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Target parent folder not found or not owned by current user'
        USING ERRCODE = '42501';
    END IF;

    IF EXISTS (
      WITH RECURSIVE descendants AS (
        SELECT id FROM prescription_folders
        WHERE parent_id = p_folder_id AND trainer_id = v_uid
        UNION ALL
        SELECT c.id FROM prescription_folders c
        JOIN descendants d ON c.parent_id = d.id
        WHERE c.trainer_id = v_uid
      )
      SELECT 1 FROM descendants WHERE id = p_new_parent_id
    ) THEN
      RAISE EXCEPTION 'Cannot move a folder into its own descendant';
    END IF;
  END IF;

  v_new_depth := COALESCE(v_parent.depth_level + 1, 0);

  WITH RECURSIVE subtree AS (
    SELECT id, depth_level FROM prescription_folders
    WHERE id = p_folder_id
    UNION ALL
    SELECT c.id, c.depth_level FROM prescription_folders c
    JOIN subtree s ON c.parent_id = s.id
    WHERE c.trainer_id = v_uid
  )
  SELECT MAX(depth_level) - v_folder.depth_level INTO v_subtree_height
  FROM subtree;

  IF v_new_depth + v_subtree_height > 5 THEN
    RAISE EXCEPTION 'Maximum folder depth (5 levels) exceeded';
  END IF;

  IF p_order_index IS NOT NULL THEN
    v_order := p_order_index;
  ELSE
    SELECT COALESCE(MAX(order_index), -1) + 1 INTO v_order
    FROM prescription_folders
    WHERE trainer_id = v_uid
      AND id <> p_folder_id
      AND parent_id IS NOT DISTINCT FROM p_new_parent_id;
  END IF;

  UPDATE prescription_folders
  SET parent_id = p_new_parent_id,
      order_index = v_order
  WHERE id = p_folder_id;

  WITH RECURSIVE subtree AS (
    SELECT c.id,
           mf.depth_level + 1 AS new_depth,
           mf.full_path || ' > ' || c.name AS new_path
    FROM prescription_folders c
    JOIN prescription_folders mf ON mf.id = p_folder_id
    WHERE c.parent_id = p_folder_id AND c.trainer_id = v_uid
    UNION ALL
    SELECT c.id,
           s.new_depth + 1,
           s.new_path || ' > ' || c.name
    FROM prescription_folders c
    JOIN subtree s ON c.parent_id = s.id
    WHERE c.trainer_id = v_uid
  )
  UPDATE prescription_folders pf
  SET depth_level = s.new_depth,
      full_path = s.new_path
  FROM subtree s
  WHERE pf.id = s.id;
END;
$$;

REVOKE ALL ON FUNCTION public.move_prescription_folder(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.move_prescription_folder(uuid, uuid, integer) TO authenticated;