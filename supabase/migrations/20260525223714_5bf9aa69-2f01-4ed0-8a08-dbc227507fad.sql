DO $$
DECLARE
  v_id UUID := '17a99d0c-dbdd-4d93-ac68-a991df443465';
  v_old_name TEXT;
  v_new_name TEXT;
BEGIN
  SELECT name INTO v_old_name FROM public.exercises_library WHERE id = v_id;
  IF v_old_name IS NULL THEN
    RAISE EXCEPTION 'ID nao encontrado';
  END IF;
  v_new_name := REPLACE(v_old_name, 'helter', 'halter');
  IF EXISTS (SELECT 1 FROM public.exercises_library WHERE name = v_new_name AND id <> v_id) THEN
    RAISE EXCEPTION 'Colisao de nome duplicado: %', v_new_name;
  END IF;
  UPDATE public.exercises_library SET name = v_new_name WHERE id = v_id;
  RAISE NOTICE 'UPDATE OK: % -> %', v_old_name, v_new_name;
END $$;
