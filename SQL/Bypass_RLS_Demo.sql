-- SQL/Bypass_RLS_Demo.sql
-- ==============================================================================================
-- ATENÇÃO: Execute este script no [SQL Editor] do seu painel Supabase.
-- Ele habilita a inserção/leitura de dados SOMENTE para o Tenant "00000000-0000..." (Modo Demo),
-- contornando o erro: 'new row violates row-level security policy'.
-- Sem isso, o Supabase bloqueia usuários "anônimos" (como o Modo Demo) de alterar o banco.
-- ==============================================================================================

CREATE POLICY "Bypass_Demo_Alunos" ON public.alunos FOR ALL USING (tenant_id = '00000000-0000-0000-0000-000000000000'::uuid) WITH CHECK (tenant_id = '00000000-0000-0000-0000-000000000000'::uuid);
CREATE POLICY "Bypass_Demo_Cursos" ON public.cursos FOR ALL USING (tenant_id = '00000000-0000-0000-0000-000000000000'::uuid) WITH CHECK (tenant_id = '00000000-0000-0000-0000-000000000000'::uuid);
CREATE POLICY "Bypass_Demo_Instrutores" ON public.instrutores FOR ALL USING (tenant_id = '00000000-0000-0000-0000-000000000000'::uuid) WITH CHECK (tenant_id = '00000000-0000-0000-0000-000000000000'::uuid);
CREATE POLICY "Bypass_Demo_Turmas" ON public.turmas FOR ALL USING (tenant_id = '00000000-0000-0000-0000-000000000000'::uuid) WITH CHECK (tenant_id = '00000000-0000-0000-0000-000000000000'::uuid);
CREATE POLICY "Bypass_Demo_Matriculas" ON public.matriculas FOR ALL USING (tenant_id = '00000000-0000-0000-0000-000000000000'::uuid) WITH CHECK (tenant_id = '00000000-0000-0000-0000-000000000000'::uuid);
CREATE POLICY "Bypass_Demo_Pagamentos" ON public.pagamentos FOR ALL USING (tenant_id = '00000000-0000-0000-0000-000000000000'::uuid) WITH CHECK (tenant_id = '00000000-0000-0000-0000-000000000000'::uuid);
CREATE POLICY "Bypass_Demo_Empresas" ON public.empresas FOR ALL USING (tenant_id = '00000000-0000-0000-0000-000000000000'::uuid) WITH CHECK (tenant_id = '00000000-0000-0000-0000-000000000000'::uuid);
CREATE POLICY "Bypass_Demo_Certificados" ON public.certificados FOR ALL USING (tenant_id = '00000000-0000-0000-0000-000000000000'::uuid) WITH CHECK (tenant_id = '00000000-0000-0000-0000-000000000000'::uuid);
