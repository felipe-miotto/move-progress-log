ALTER TABLE public.oura_connections
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

CREATE TRIGGER update_oura_connections_updated_at
  BEFORE UPDATE ON public.oura_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();