/**
 * /js/views/alunos.js
 * CRUD real via Supabase — sem dados mockados.
 *
 * Operações:
 *  - READ:   loadAlunos() — busca com join em empresas
 *  - CREATE: salvarNovoAluno() — insert + re-fetch
 *  - UPDATE: abrirModalEditar() — update + re-fetch
 *  - DELETE: (via botão "Inativar" no modal de edição)
 *
 * Segurança: tenant_id vem de currentUser (preenchido no login real).
 * As políticas RLS do banco garantem isolamento — o JS só filtra por UX.
 */

import { getClient, getTenantId } from '../core/supabase.js';
import { currentUser } from '../core/auth.js';
import { setContent, openModal, closeModal, toast } from '../ui/components.js';

// Cache local — evita re-fetch desnecessário ao filtrar
let _alunosCache = [];
// Cache de empresas para o select do modal
let _empresasCache = [];

// ─── Render principal ─────────────────────────────────────────────────────────
export async function render() {
  // Renderiza o shell da página imediatamente (esqueleto)
  setContent(`
    <div class="page-header">
      <div><h1>Alunos</h1><p>Cadastro e gestão de discentes</p></div>
      <div class="page-header-actions">
        <button class="btn btn-secondary" id="btn-exportar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Exportar
        </button>
        <button class="btn btn-primary" id="btn-novo-aluno">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Novo Aluno
        </button>
      </div>
    </div>

    <!-- KPIs com skeleton enquanto carrega -->
    <div class="stats-row" id="alunos-kpis">
      ${['','','',''].map(() => `<div class="stat-card"><div class="skeleton" style="height:14px;width:80px;margin-bottom:10px"></div><div class="skeleton" style="height:32px;width:60px"></div></div>`).join('')}
    </div>

    <div class="table-wrap">
      <div class="table-toolbar">
        <div class="search-input-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input class="search-input" id="search-alunos" placeholder="Nome, CPF ou e-mail...">
        </div>
        <select class="select-input" id="filtro-tipo">
          <option value="">Todos os tipos</option>
          <option value="pessoa_fisica">Pessoa Física</option>
          <option value="empresa">Via Empresa</option>
        </select>
        <select class="select-input" id="filtro-status">
          <option value="">Todos os status</option>
          <option value="ativo">Ativo</option>
          <option value="inativo">Inativo</option>
        </select>
      </div>
      <table>
        <thead><tr>
          <th>Aluno</th><th>CPF</th><th>Contato</th><th>Tipo</th><th>Empresa</th><th>Status</th><th>Ações</th>
        </tr></thead>
        <tbody id="alunos-tbody">
          <tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-tertiary)">
            <div style="display:flex;align-items:center;justify-content:center;gap:10px">
              <div class="skeleton" style="width:16px;height:16px;border-radius:50%"></div>
              Carregando alunos...
            </div>
          </td></tr>
        </tbody>
      </table>
      <div class="table-footer">
        <span class="table-info" id="alunos-count">—</span>
        <div class="pagination" id="alunos-pag"></div>
      </div>
    </div>
  `);

  // Registra listeners que não dependem dos dados
  document.getElementById('btn-novo-aluno')?.addEventListener('click', () => modalNovoAluno());
  document.getElementById('btn-exportar')?.addEventListener('click', () => exportarCSV());

  // Carrega dados do Supabase em paralelo
  await Promise.all([loadAlunos(), loadEmpresas()]);
}

// ─── Fetch de alunos ──────────────────────────────────────────────────────────
async function loadAlunos() {
  try {
    const client = await getClient();
    const { data, error } = await client
      .from('alunos')
      .select('id, nome, cpf, email, telefone, tipo_pessoa, status, empresa:empresa_id(id, nome)')
      .eq('tenant_id', getTenantId())
      .order('nome')
      .limit(200);

    if (error) throw error;

    _alunosCache = (data ?? []).map(a => ({
      ...a,
      empresa_nome: a.empresa?.nome ?? '—',
      empresa_id:   a.empresa?.id   ?? null,
    }));

  } catch (err) {
    toast(`Erro ao carregar alunos: ${err.message}`, 'error');
    _alunosCache = [];
  }

  renderKPIs(_alunosCache);
  renderTabela(_alunosCache);
  bindFiltros();
}

// ─── Fetch de empresas (para o select do modal) ───────────────────────────────
async function loadEmpresas() {
  try {
    const client = await getClient();
    const { data, error } = await client
      .from('empresas')
      .select('id, nome')
      .eq('tenant_id', getTenantId())
      .eq('status', 'ativo')
      .order('nome');
    if (error) throw error;
    _empresasCache = data ?? [];
  } catch (_) {
    _empresasCache = [];
  }
}

// ─── KPIs ─────────────────────────────────────────────────────────────────────
function renderKPIs(alunos) {
  const ativos  = alunos.filter(a => a.status === 'ativo').length;
  const pf      = alunos.filter(a => a.tipo_pessoa === 'pessoa_fisica').length;
  const empresa = alunos.filter(a => a.tipo_pessoa === 'empresa').length;

  const kpisEl = document.getElementById('alunos-kpis');
  if (!kpisEl) return;

  kpisEl.innerHTML = `
    <div class="stat-card"><div class="stat-label">Total Ativos</div><div class="stat-value" style="color:var(--blue)">${ativos}</div></div>
    <div class="stat-card"><div class="stat-label">Pessoa Física</div><div class="stat-value" style="color:var(--accent)">${pf}</div></div>
    <div class="stat-card"><div class="stat-label">Via Empresa</div><div class="stat-value" style="color:var(--amber)">${empresa}</div></div>
    <div class="stat-card"><div class="stat-label">Total Geral</div><div class="stat-value" style="color:var(--text-primary)">${alunos.length}</div></div>
  `;
}

// ─── Tabela ───────────────────────────────────────────────────────────────────
function renderTabela(alunos) {
  const tbody   = document.getElementById('alunos-tbody');
  const countEl = document.getElementById('alunos-count');
  if (!tbody) return;

  if (!alunos.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:48px;color:var(--text-tertiary)">Nenhum aluno encontrado</td></tr>`;
    if (countEl) countEl.textContent = '0 alunos';
    return;
  }

  tbody.innerHTML = alunos.map(a => `
    <tr>
      <td>
        <div style="display:flex;align-items:center;gap:9px">
          <div style="width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--purple));display:grid;place-items:center;font-size:11px;font-weight:600;color:white;flex-shrink:0">${a.nome.charAt(0)}</div>
          <div>
            <div style="font-weight:500;font-size:13px">${a.nome}</div>
            <div style="font-size:11px;color:var(--text-tertiary)">${a.email ?? '—'}</div>
          </div>
        </div>
      </td>
      <td style="font-family:var(--font-mono);font-size:12px">${a.cpf ?? '—'}</td>
      <td style="font-size:12.5px">${a.telefone ?? '—'}</td>
      <td><span class="badge ${a.tipo_pessoa === 'pessoa_fisica' ? 'badge-blue' : 'badge-amber'}">${a.tipo_pessoa === 'pessoa_fisica' ? 'PF' : 'Empresa'}</span></td>
      <td style="font-size:12.5px;color:var(--text-secondary)">${a.empresa_nome}</td>
      <td><span class="badge ${a.status === 'ativo' ? 'badge-green' : 'badge-gray'}">${a.status === 'ativo' ? 'Ativo' : 'Inativo'}</span></td>
      <td>
        <div style="display:flex;gap:4px">
          <button class="action-btn" data-action="editar" data-id="${a.id}">Editar</button>
          <button class="action-btn danger" data-action="toggle-status" data-id="${a.id}" data-status="${a.status}">
            ${a.status === 'ativo' ? 'Inativar' : 'Ativar'}
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  if (countEl) countEl.textContent = `${alunos.length} aluno${alunos.length !== 1 ? 's' : ''}`;
  bindRowActions();
}

// ─── Filtros em tempo real (client-side sobre o cache) ─────────────────────────
function bindFiltros() {
  const search   = document.getElementById('search-alunos');
  const filtTipo = document.getElementById('filtro-tipo');
  const filtSt   = document.getElementById('filtro-status');
  if (!search) return;

  function applyFilter() {
    const q  = search.value.toLowerCase().trim();
    const tp = filtTipo.value;
    const st = filtSt.value;
    const filtered = _alunosCache.filter(a =>
      (!q  || a.nome.toLowerCase().includes(q) || (a.cpf ?? '').includes(q) || (a.email ?? '').toLowerCase().includes(q)) &&
      (!tp || a.tipo_pessoa === tp) &&
      (!st || a.status === st)
    );
    renderTabela(filtered);
  }

  search.addEventListener('input', applyFilter);
  filtTipo.addEventListener('change', applyFilter);
  filtSt.addEventListener('change', applyFilter);
}

// ─── Ações das linhas ─────────────────────────────────────────────────────────
function bindRowActions() {
  document.querySelectorAll('.action-btn[data-action="editar"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const aluno = _alunosCache.find(a => a.id === btn.dataset.id);
      if (aluno) modalEditarAluno(aluno);
    });
  });

  document.querySelectorAll('.action-btn[data-action="toggle-status"]').forEach(btn => {
    btn.addEventListener('click', () => toggleStatus(btn.dataset.id, btn.dataset.status));
  });
}

// ─── Toggle ativo/inativo ─────────────────────────────────────────────────────
async function toggleStatus(id, statusAtual) {
  const novoStatus = statusAtual === 'ativo' ? 'inativo' : 'ativo';
  try {
    const client = await getClient();
    const { error } = await client
      .from('alunos')
      .update({ status: novoStatus })
      .eq('id', id)
      .eq('tenant_id', getTenantId());

    if (error) throw error;
    toast(`Aluno ${novoStatus === 'ativo' ? 'ativado' : 'inativado'} com sucesso`, 'success');
    await loadAlunos(); // re-fetch para atualizar a tabela
  } catch (err) {
    toast(`Erro: ${err.message}`, 'error');
  }
}

// ─── Modal: Novo Aluno ────────────────────────────────────────────────────────
function modalNovoAluno() {
  const empresaOptions = _empresasCache.map(e =>
    `<option value="${e.id}">${e.nome}</option>`
  ).join('');

  openModal('Novo Aluno', `
    <div class="form-grid">
      <div class="form-group full">
        <label>Nome Completo *</label>
        <input id="f-nome" type="text" placeholder="João da Silva" autocomplete="off">
      </div>
      <div class="form-group">
        <label>CPF *</label>
        <input id="f-cpf" type="text" placeholder="000.000.000-00">
      </div>
      <div class="form-group">
        <label>Data de Nascimento</label>
        <input id="f-nasc" type="date">
      </div>
      <div class="form-group">
        <label>E-mail</label>
        <input id="f-email" type="email" placeholder="joao@email.com">
      </div>
      <div class="form-group">
        <label>Telefone / WhatsApp</label>
        <input id="f-tel" type="text" placeholder="(11) 99999-9999">
      </div>
      <div class="form-group">
        <label>Tipo</label>
        <select id="f-tipo">
          <option value="pessoa_fisica">Pessoa Física</option>
          <option value="empresa">Via Empresa</option>
        </select>
      </div>
      <div class="form-group">
        <label>Empresa (opcional)</label>
        <select id="f-empresa">
          <option value="">— Nenhuma —</option>
          ${empresaOptions}
        </select>
      </div>
      <div class="form-group full">
        <label>Observações</label>
        <textarea id="f-obs" placeholder="Informações adicionais..."></textarea>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
      <button class="btn btn-primary" id="modal-save">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="20 6 9 17 4 12"/></svg>
        Salvar Aluno
      </button>
    </div>
  `);

  document.getElementById('modal-cancel')?.addEventListener('click', () => closeModal());
  document.getElementById('modal-save')?.addEventListener('click', () => salvarNovoAluno());
}

// ─── INSERT real ──────────────────────────────────────────────────────────────
async function salvarNovoAluno() {
  const nome       = document.getElementById('f-nome')?.value.trim();
  const cpf        = document.getElementById('f-cpf')?.value.trim();
  const email      = document.getElementById('f-email')?.value.trim();
  const telefone   = document.getElementById('f-tel')?.value.trim();
  const nascimento = document.getElementById('f-nasc')?.value;
  const tipo       = document.getElementById('f-tipo')?.value;
  const empresaId  = document.getElementById('f-empresa')?.value || null;
  const obs        = document.getElementById('f-obs')?.value.trim();

  // Validação mínima
  if (!nome) { toast('O campo Nome é obrigatório.', 'warning'); return; }
  if (!cpf)  { toast('O campo CPF é obrigatório.', 'warning'); return; }

  const saveBtn = document.getElementById('modal-save');
  saveBtn.disabled = true;
  saveBtn.innerHTML = 'Salvando...';

  try {
    const client = await getClient();
    const { error } = await client
      .from('alunos')
      .insert({
        tenant_id:       getTenantId(),
        nome,
        cpf,
        email:           email || null,
        telefone:        telefone || null,
        data_nascimento: nascimento || null,
        tipo_pessoa:     tipo,
        empresa_id:      empresaId,
        observacoes:     obs || null,
        status:          'ativo',
      });

    if (error) {
      // Erro de CPF duplicado (unique constraint)
      if (error.code === '23505') throw new Error('Já existe um aluno cadastrado com este CPF.');
      throw error;
    }

    closeModal();
    toast(`Aluno "${nome.split(' ')[0]}" cadastrado com sucesso!`, 'success');
    await loadAlunos(); // re-fetch para mostrar o novo registro

  } catch (err) {
    toast(`Erro ao salvar: ${err.message}`, 'error');
    saveBtn.disabled = false;
    saveBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="20 6 9 17 4 12"/></svg> Salvar Aluno`;
  }
}

// ─── Modal: Editar Aluno ──────────────────────────────────────────────────────
function modalEditarAluno(aluno) {
  const empresaOptions = _empresasCache.map(e =>
    `<option value="${e.id}" ${e.id === aluno.empresa_id ? 'selected' : ''}>${e.nome}</option>`
  ).join('');

  openModal(`Editar — ${aluno.nome.split(' ')[0]}`, `
    <div class="form-grid">
      <div class="form-group full">
        <label>Nome Completo *</label>
        <input id="e-nome" type="text" value="${aluno.nome}">
      </div>
      <div class="form-group">
        <label>CPF</label>
        <input id="e-cpf" type="text" value="${aluno.cpf ?? ''}" disabled style="opacity:0.6">
      </div>
      <div class="form-group">
        <label>E-mail</label>
        <input id="e-email" type="email" value="${aluno.email ?? ''}">
      </div>
      <div class="form-group">
        <label>Telefone / WhatsApp</label>
        <input id="e-tel" type="text" value="${aluno.telefone ?? ''}">
      </div>
      <div class="form-group">
        <label>Tipo</label>
        <select id="e-tipo">
          <option value="pessoa_fisica" ${aluno.tipo_pessoa === 'pessoa_fisica' ? 'selected' : ''}>Pessoa Física</option>
          <option value="empresa"       ${aluno.tipo_pessoa === 'empresa'       ? 'selected' : ''}>Via Empresa</option>
        </select>
      </div>
      <div class="form-group">
        <label>Empresa</label>
        <select id="e-empresa">
          <option value="">— Nenhuma —</option>
          ${empresaOptions}
        </select>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
      <button class="btn btn-primary" id="modal-update" data-id="${aluno.id}">Salvar Alterações</button>
    </div>
  `);

  document.getElementById('modal-cancel')?.addEventListener('click', () => closeModal());
  document.getElementById('modal-update')?.addEventListener('click', () => atualizarAluno(aluno.id));
}

// ─── UPDATE real ──────────────────────────────────────────────────────────────
async function atualizarAluno(id) {
  const nome      = document.getElementById('e-nome')?.value.trim();
  const email     = document.getElementById('e-email')?.value.trim();
  const telefone  = document.getElementById('e-tel')?.value.trim();
  const tipo      = document.getElementById('e-tipo')?.value;
  const empresaId = document.getElementById('e-empresa')?.value || null;

  if (!nome) { toast('O campo Nome é obrigatório.', 'warning'); return; }

  const updateBtn = document.getElementById('modal-update');
  updateBtn.disabled = true;
  updateBtn.textContent = 'Salvando...';

  try {
    const client = await getClient();
    const { error } = await client
      .from('alunos')
      .update({
        nome,
        email:      email     || null,
        telefone:   telefone  || null,
        tipo_pessoa: tipo,
        empresa_id: empresaId,
      })
      .eq('id', id)
      .eq('tenant_id', getTenantId());

    if (error) throw error;

    closeModal();
    toast('Dados atualizados com sucesso!', 'success');
    await loadAlunos();

  } catch (err) {
    toast(`Erro ao atualizar: ${err.message}`, 'error');
    updateBtn.disabled = false;
    updateBtn.textContent = 'Salvar Alterações';
  }
}

// ─── Exportar CSV ────────────────────────────────────────────────────────────
function exportarCSV() {
  if (!_alunosCache.length) {
    toast('Nenhum dado para exportar.', 'warning');
    return;
  }
  const headers = ['Nome','CPF','Email','Telefone','Tipo','Empresa','Status'];
  const rows = _alunosCache.map(a => [
    a.nome, a.cpf, a.email ?? '', a.telefone ?? '',
    a.tipo_pessoa, a.empresa_nome, a.status,
  ].map(v => `"${v}"`).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'alunos.csv'; a.click();
  URL.revokeObjectURL(url);
  toast('Exportação concluída!', 'success');
}
