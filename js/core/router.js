/**
 * /js/core/router.js
 * Sistema de navegação SPA para o EduOS.
 *
 * Cada rota é um import() dinâmico para o arquivo de view correspondente.
 * As views exportam uma função `render()` que injeta HTML no #main-content
 * e busca dados no Supabase.
 *
 * Uso:
 *   import { navigate } from './router.js';
 *   navigate('alunos');
 */

// ─── Mapa de rotas → arquivo de view ─────────────────────────────────────────
const ROUTES = {
  dashboard:     () => import('../views/dashboard.js'),
  alunos:        () => import('../views/alunos.js'),
  turmas:        () => import('../views/turmas.js'),
  cursos:        () => import('../views/cursos.js'),
  instrutores:   () => import('../views/instrutores.js'),
  matriculas:    () => import('../views/matriculas.js'),
  pipeline:      () => import('../views/pipeline.js'),
  certificados:  () => import('../views/certificados.js'),
  empresas:      () => import('../views/empresas.js'),
  renovacoes:    () => import('../views/renovacoes.js'),
  financeiro:    () => import('../views/financeiro.js'),
  relatorios:    () => import('../views/relatorios.js'),
  rbac:          () => import('../views/rbac.js'),
  configuracoes: () => import('../views/configuracoes.js'),
};

// ─── Títulos do topbar ────────────────────────────────────────────────────────
const PAGE_TITLES = {
  dashboard:     'Dashboard',
  alunos:        'Alunos',
  turmas:        'Turmas',
  cursos:        'Cursos',
  instrutores:   'Instrutores',
  matriculas:    'Matrículas',
  pipeline:      'Pipeline',
  certificados:  'Certificados',
  empresas:      'Empresas B2B',
  renovacoes:    'Renovações',
  financeiro:    'Financeiro',
  relatorios:    'Relatórios',
  rbac:          'Permissões RBAC',
  configuracoes: 'Configurações',
};

let _currentPage = 'dashboard';

/** Retorna a página ativa no momento */
export function getCurrentPage() {
  return _currentPage;
}

/**
 * Navega para uma página.
 * 1. Atualiza o nav-item ativo no sidebar
 * 2. Atualiza o título do topbar
 * 3. Faz import dinâmico do módulo de view
 * 4. Chama view.render() para injetar conteúdo no #main-content
 *
 * @param {string} page  - chave da rota (ex: 'alunos')
 */
export async function navigate(page) {
  if (!ROUTES[page]) {
    console.warn(`[Router] Rota desconhecida: "${page}"`);
    return;
  }

  _currentPage = page;

  // Atualiza nav-items
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });

  // Atualiza topbar
  const titleEl = document.getElementById('topbar-title');
  if (titleEl) titleEl.textContent = PAGE_TITLES[page] ?? page;

  // Mostra estado de carregamento
  const mainContent = document.getElementById('main-content');
  if (mainContent) {
    mainContent.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:200px;color:var(--text-tertiary);font-size:13px;gap:10px">
        <div class="skeleton" style="width:16px;height:16px;border-radius:50%"></div>
        Carregando...
      </div>`;
  }

  try {
    const module = await ROUTES[page]();
    await module.render();
  } catch (err) {
    console.error(`[Router] Erro ao carregar view "${page}":`, err);
    if (mainContent) {
      mainContent.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <h3>Erro ao carregar página</h3>
          <p>${err.message}</p>
        </div>`;
    }
  }
}
