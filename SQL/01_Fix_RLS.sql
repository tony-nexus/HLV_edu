-- 01_Fix_RLS.sql
-- Este script corrige a função public.get_tenant_id() para não depender
-- exclusivamente do webhook/JWT do Supabase. Dessa forma, as políticas
-- de segurança (RLS) conseguirão verificar corretamente a sua permissão
-- lendo o tenant_id diretamente do seu perfil, destravando todos os Inserts/Updates.

CREATE OR REPLACE FUNCTION public.get_tenant_id()
RETURNS uuid AS $$
BEGIN
  -- Tenta ler do JWT (caso o hook de autenticação esteja configurado)
  -- Se estiver nulo, busca o tenant_id diretamente da tabela perfis.
  RETURN COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid,
    (SELECT tenant_id FROM public.perfis WHERE user_id = auth.uid() LIMIT 1)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
