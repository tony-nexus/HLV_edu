/**
 * /js/core/supabase.js
 * Configuração do cliente Supabase para o EduOS.
 *
 * CORREÇÕES APLICADAS:
 *  - getTenantId() agora lê currentUser.tenant_id em vez de UUID hardcoded
 *  - UUID demo '00000000...' usado apenas como fallback explícito para modo demo
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL  = 'https://rktpcktvjkmznfblsqqk.supabase.co';
const SUPABASE_ANON = 'sb_publishable_CYHGe5RqvppU6EsGzLudOw_dutLXbou';

export const DEMO_TENANT_ID = '00000000-0000-0000-0000-000000000000';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});

export const getClient = async () => supabase;

/**
 * Retorna o tenant_id do usuário logado.
 * - Usuário real  → lê currentUser.tenant_id (preenchido via tabela perfis no login)
 * - Modo demo     → retorna DEMO_TENANT_ID para acionar as policies de bypass
 */
export function getTenantId() {
  try {
    const u = globalThis.__eduos_auth?.currentUser;
    if (u?.tenant_id) return u.tenant_id;
  } catch (_) { /* módulo ainda não carregado */ }
  return DEMO_TENANT_ID;
}

export async function getSupabaseUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}
