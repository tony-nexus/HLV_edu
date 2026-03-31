/**
 * /js/views/certificados.js
 * CRUD real para Certificados.
 */

import { supabase, getTenantId } from '../core/supabase.js';
import { setContent, openModal, closeModal, toast, fmtDate } from '../ui/components.js';

let _certs = [];
let _alunos = [];
let _cursos = [];

export async function render() {
  setContent(`
    <div class="page-header">
      <div><h1>Certificados</h1><p>Emissão, QR Code e controle de validade</p></div>
      <div class="page-header-actions">
        <button class="btn btn-secondary" id="btn-exportar-lote">Exportar CSV</button>
        <button class="btn btn-primary" id="btn-emitir">Emitir Certificado</button>
      </div>
    </div>
    <div class="stats-row" id="certs-kpis">
      <div class="stat-card"><div class="skeleton" style="height:40px;width:100%"></div></div>
      <div class="stat-card"><div class="skeleton" style="height:40px;width:100%"></div></div>
      <div class="stat-card"><div class="skeleton" style="height:40px;width:100%"></div></div>
      <div class="stat-card"><div class="skeleton" style="height:40px;width:100%"></div></div>
    </div>
    <div class="table-wrap">
      <div class="table-toolbar">
        <div class="search-input-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input class="search-input" id="search-certs" placeholder="Aluno, curso ou código...">
        </div>
        <select class="select-input" id="filtro-status-cert">
          <option value="">Todos os status</option>
          <option value="valido">Válidos</option>
          <option value="a_vencer">A Vencer</option>
          <option value="vencido">Vencidos</option>
        </select>
      </div>
      <table>
        <thead><tr><th>Aluno</th><th>Curso</th><th>Código Verificação</th><th>Emissão</th><th>Validade</th><th>Status</th><th>Ações</th></tr></thead>
        <tbody id="certs-tbody">
          <tr><td colspan="7" style="text-align:center;padding:40px"><div class="skeleton" style="width:16px;height:16px;border-radius:50%;display:inline-block"></div> Carregando...</td></tr>
        </tbody>
      </table>
    </div>
  `);

  document.getElementById('btn-exportar-lote')?.addEventListener('click', () => toast('Função de PDF Lote em desenvolvimento', 'info'));
  document.getElementById('btn-emitir')?.addEventListener('click', () => modalEmitir());
  document.getElementById('search-certs')?.addEventListener('input', applyFilter);
  document.getElementById('filtro-status-cert')?.addEventListener('change', applyFilter);

  await Promise.all([loadCerts(), loadAux()]);
}

async function loadAux() {
  try {
    const p1 = supabase.from('alunos').select('id, nome').eq('tenant_id', getTenantId()).order('nome');
    const p2 = supabase.from('cursos').select('id, nome, validade').eq('tenant_id', getTenantId()).order('nome');
    
    const [r1, r2] = await Promise.all([p1, p2]);
    _alunos = r1.data || [];
    _cursos = r2.data || [];
  } catch (err) {
    console.error(err);
  }
}

async function loadCerts() {
  try {
    const { data, error } = await supabase
      .from('certificados')
      .select('*, aluno:aluno_id(nome), curso:curso_id(nome)')
      .eq('tenant_id', getTenantId())
      .order('created_at', { ascending: false });

    if (error) throw error;
    _certs = (data || []).map(c => ({
      ...c,
      aluno_nome: c.aluno?.nome || '—',
      curso_nome: c.curso?.nome || '—',
    }));
  } catch (err) {
    toast('Erro ao carregar certificados', 'error');
    _certs = [];
  }
  
  renderKPIs(_certs);
  applyFilter();
}

function renderKPIs(certs) {
  const v = certs.filter(c => c.status === 'valido').length;
  const a = certs.filter(c => c.status === 'a_vencer').length;
  const exp = certs.filter(c => c.status === 'vencido').length;

  const el = document.getElementById('certs-kpis');
  if(!el) return;
  el.innerHTML = `
    <div class="stat-card"><div class="stat-label">Total Emitidos</div><div class="stat-value" style="color:var(--purple)">${certs.length}</div></div>
    <div class="stat-card"><div class="stat-label">Válidos</div><div class="stat-value" style="color:var(--green)">${v}</div></div>
    <div class="stat-card"><div class="stat-label">A Vencer</div><div class="stat-value" style="color:var(--amber)">${a}</div></div>
    <div class="stat-card"><div class="stat-label">Vencidos</div><div class="stat-value" style="color:var(--red)">${exp}</div></div>
  `;
}

function applyFilter() {
  const q  = document.getElementById('search-certs')?.value.toLowerCase() || '';
  const st = document.getElementById('filtro-status-cert')?.value || '';
  const f  = _certs.filter(c =>
    (!q  || c.aluno_nome.toLowerCase().includes(q) || c.curso_nome.toLowerCase().includes(q) || (c.codigo_verificacao||'').toLowerCase().includes(q)) &&
    (!st || c.status === st)
  );
  
  const tbody = document.getElementById('certs-tbody');
  if(!tbody) return;

  if(!f.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-tertiary)">Nenhum certificado encontrado</td></tr>`;
    return;
  }

  tbody.innerHTML = f.map(c => `
    <tr>
      <td style="font-weight:500">${c.aluno_nome}</td>
      <td style="font-size:12.5px;color:var(--text-secondary)">${c.curso_nome}</td>
      <td><span style="font-family:var(--font-mono);font-size:11.5px;color:var(--text-tertiary)">${c.codigo_verificacao || '—'}</span></td>
      <td style="font-size:12.5px">${c.emissao ? fmtDate(c.emissao) : '—'}</td>
      <td style="font-size:12.5px">${c.validade ? fmtDate(c.validade) : 'Sem validade'}</td>
      <td><span class="badge ${c.status==='valido'?'badge-green':c.status==='a_vencer'?'badge-amber':'badge-red'}">${c.status==='valido'?'Válido':c.status==='a_vencer'?'A Vencer':'Vencido'}</span></td>
      <td>
        <div style="display:flex;gap:4px">
          <button class="action-btn" data-action="pdf" data-id="${c.id}">PDF</button>
        </div>
      </td>
    </tr>
  `).join('');

  document.querySelectorAll('.action-btn[data-action="pdf"]').forEach(b => {
    b.addEventListener('click', () => toast('Geração de PDF em breve', 'success'));
  });
}

function modalEmitir() {
  const aluOpts = _alunos.map(a => `<option value="${a.id}">${a.nome}</option>`).join('');
  const curOpts = _cursos.map(c => `<option value="${c.id}" data-val="${c.validade||0}">${c.nome}</option>`).join('');

  openModal('Emitir Certificado', `
    <div class="form-grid">
      <div class="form-group full">
        <label>Aluno *</label>
        <select id="f-aluno">
          <option value="">— Selecionar aluno —</option>
          ${aluOpts}
        </select>
      </div>
      <div class="form-group full">
        <label>Curso *</label>
        <select id="f-curso" onchange="autoLoadValidade(this)">
          <option value="">— Selecionar curso —</option>
          ${curOpts}
        </select>
      </div>
      <div class="form-group">
        <label>Data de Emissão</label>
        <input id="f-emissao" type="date" value="${new Date().toISOString().split('T')[0]}">
      </div>
      <div class="form-group">
        <label>Data de Validade (opcional)</label>
        <input id="f-validade" type="date">
        <small style="color:var(--text-tertiary)" id="f-validade-help">Preenchido auto se curso tiver expiração.</small>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
      <button class="btn btn-primary" id="modal-save">Salvar e Gerar Código</button>
    </div>
  `);

  window.autoLoadValidade = (selectEl) => {
    const months = parseInt(selectEl.options[selectEl.selectedIndex].dataset.val) || 0;
    if(months > 0) {
      const d = new Date(document.getElementById('f-emissao').value || new Date());
      d.setMonth(d.getMonth() + months);
      document.getElementById('f-validade').value = d.toISOString().split('T')[0];
    } else {
      document.getElementById('f-validade').value = '';
    }
  };

  document.getElementById('modal-cancel')?.addEventListener('click', () => closeModal());
  document.getElementById('modal-save')?.addEventListener('click', () => saveCert());
}

async function saveCert() {
  const aluno_id = document.getElementById('f-aluno').value;
  const curso_id = document.getElementById('f-curso').value;
  const emissao = document.getElementById('f-emissao').value;
  const validade = document.getElementById('f-validade').value || null;

  if (!aluno_id || !curso_id) {
    toast('Aluno e Curso são obrigatórios.', 'warning');
    return;
  }

  const codGerado = 'CRT-' + Math.random().toString(36).substring(2, 8).toUpperCase() + '-' + Date.now().toString().slice(-4);

  const payload = {
    tenant_id: getTenantId(),
    aluno_id,
    curso_id,
    emissao,
    validade,
    codigo_verificacao: codGerado,
    status: 'valido'
  };

  const btn = document.getElementById('modal-save');
  btn.disabled = true;
  btn.textContent = 'Gerando...';

  try {
    const { error } = await supabase.from('certificados').insert(payload);
    if (error) throw error;
    closeModal();
    toast('Certificado emitido com sucesso!', 'success');
    await loadCerts();
  } catch(e) {
    console.error(e);
    toast('Erro ao emitir certificado.', 'error');
    btn.disabled = false;
    btn.textContent = 'Salvar e Gerar Código';
  }
}
