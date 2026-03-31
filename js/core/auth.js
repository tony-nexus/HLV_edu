/**
 * /js/core/auth.js
 * Autenticação real via Supabase + modo demo local.
 *
 * CORREÇÕES APLICADAS:
 *  - currentUser exposto em globalThis.__eduos_auth para getTenantId() sem import circular
 *  - initials gerado com segurança (guard contra nomes undefined)
 *  - Mensagens de erro em PT-BR mais descritivas
 */

import { navigate } from './router.js';

const DEMO_USERS = {
  admin:      { name:'Ana Rodrigues',  role:'Administrador', initials:'AR', perfil:'admin',      tenant_id:'00000000-0000-0000-0000-000000000000' },
  secretaria: { name:'Carlos Lima',    role:'Secretaria',    initials:'CL', perfil:'secretaria', tenant_id:'00000000-0000-0000-0000-000000000000' },
  instrutor:  { name:'Prof. Beatriz',  role:'Instrutor',     initials:'PB', perfil:'instrutor',  tenant_id:'00000000-0000-0000-0000-000000000000' },
};

export let currentUser = null;

// Expõe para getTenantId() sem criar dependência circular
function _syncGlobal() {
  globalThis.__eduos_auth = { currentUser };
}

// ─── Login real ───────────────────────────────────────────────────────────────
export async function doLogin(email, password) {
  const errorEl = document.getElementById('login-error');
  errorEl.style.display = 'none';

  if (email.endsWith('@eduos.demo')) {
    loginAsDemo('admin');
    return;
  }

  setLoginLoading(true);
  try {
    const { getClient } = await import('./supabase.js');
    const client = await getClient();

    const { data: authData, error: authError } =
      await client.auth.signInWithPassword({ email, password });

    if (authError) throw authError;

    const { data: perfil, error: perfilError } = await client
      .from('perfis')
      .select('nome, role, tenant_id')
      .eq('user_id', authData.user.id)
      .single();

    if (perfilError) throw new Error('Perfil não encontrado. Contate o administrador.');

    currentUser = {
      id:        authData.user.id,
      email,
      name:      perfil.nome,
      role:      perfil.role,
      initials:  _makeInitials(perfil.nome),
      perfil:    perfil.role,
      tenant_id: perfil.tenant_id,
    };
    _syncGlobal();

    showApp();
    navigate('dashboard');

  } catch (err) {
    const msgs = {
      'Invalid login credentials': 'E-mail ou senha incorretos.',
      'Email not confirmed':        'Confirme seu e-mail antes de fazer login.',
    };
    errorEl.textContent = msgs[err.message] ?? err.message ?? 'Erro ao fazer login.';
    errorEl.style.display = 'block';
  } finally {
    setLoginLoading(false);
  }
}

// ─── Login demo ───────────────────────────────────────────────────────────────
export function loginAsDemo(role) {
  currentUser = { ...DEMO_USERS[role] };
  _syncGlobal();
  showApp();
  navigate('dashboard');
}

// ─── Logout ───────────────────────────────────────────────────────────────────
export async function logout() {
  currentUser = null;
  _syncGlobal();
  try {
    const { getClient } = await import('./supabase.js');
    const client = await getClient();
    await client.auth.signOut();
  } catch (_) { /* modo demo */ }
  hideApp();
}

// ─── Restaurar sessão ao carregar ─────────────────────────────────────────────
export async function initAuth() {
  try {
    const { getClient } = await import('./supabase.js');
    const client = await getClient();

    const { data: { session } } = await client.auth.getSession();
    if (!session?.user) return false;

    const { data: perfil } = await client
      .from('perfis')
      .select('nome, role, tenant_id')
      .eq('user_id', session.user.id)
      .single();

    currentUser = {
      id:        session.user.id,
      email:     session.user.email,
      name:      perfil?.nome  ?? session.user.email.split('@')[0],
      role:      perfil?.role  ?? 'admin',
      initials:  _makeInitials(perfil?.nome ?? session.user.email),
      perfil:    perfil?.role  ?? 'admin',
      tenant_id: perfil?.tenant_id ?? null,
    };
    _syncGlobal();

    showApp();
    navigate('dashboard');
    return true;

  } catch (_) { /* sem sessão */ }
  return false;
}

// ─── Helpers internos ─────────────────────────────────────────────────────────
function _makeInitials(name) {
  if (!name) return '?';
  return name.split(' ').filter(Boolean).map(p => p[0]).slice(0, 2).join('').toUpperCase();
}

function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').classList.add('visible');

  // Fecha o drawer mobile se estiver aberto
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebar-overlay')?.classList.remove('open');

  if (currentUser) {
    document.getElementById('user-avatar-sidebar').textContent = currentUser.initials;
    document.getElementById('user-name-sidebar').textContent   = currentUser.name;
    document.getElementById('user-role-sidebar').textContent   = currentUser.role;
  }
}

function hideApp() {
  document.getElementById('app').classList.remove('visible');
  document.getElementById('login-screen').style.display = '';
  const emailEl = document.getElementById('login-email');
  const passEl  = document.getElementById('login-pass');
  if (emailEl && !emailEl.value.endsWith('@eduos.demo')) {
    emailEl.value = '';
    if (passEl) passEl.value = '';
  }
}

function setLoginLoading(loading) {
  const btn = document.getElementById('login-btn');
  if (!btn) return;
  btn.disabled = loading;
  btn.innerHTML = loading
    ? `<span style="opacity:0.7">Autenticando...</span>`
    : `Entrar na plataforma <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`;
}
