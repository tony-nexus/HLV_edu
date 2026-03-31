/**
 * /js/views/pipeline.js
 * Kanban alimentado pela tabela de matriculas do Supabase.
 */

import { supabase, getTenantId } from '../core/supabase.js';
import { setContent, toast } from '../ui/components.js';
import { navigate } from '../core/router.js';

let _matriculas = [];

export async function render() {
  setContent(`
    <div class="page-header">
      <div><h1>Pipeline Operacional</h1><p>Jornada completa do aluno</p></div>
      <div class="page-header-actions">
        <button class="btn btn-primary" id="btn-nova-mat-pipeline">Nova Matrícula</button>
      </div>
    </div>
    <div class="kanban-board" id="kanban-board">
      <div style="padding:40px;text-align:center;width:100%;color:var(--text-tertiary)">Carregando pipeline...</div>
    </div>
  `);

  document.getElementById('btn-nova-mat-pipeline')?.addEventListener('click', () => navigate('matriculas'));
  await loadData();
}

async function loadData() {
  try {
    const { data, error } = await supabase
      .from('matriculas')
      .select('*, aluno:aluno_id(nome), curso:curso_id(nome)')
      .eq('tenant_id', getTenantId());

    if (error) throw error;
    _matriculas = data || [];
  } catch (err) {
    console.error(err);
    toast('Erro ao carregar pipeline', 'error');
    _matriculas = [];
  }
  renderKanban();
}

function renderKanban() {
  const board = document.getElementById('kanban-board');
  if(!board) return;

  const cols = [
    { key: ['matriculado'], label: 'Matriculados', color: 'var(--blue)', items: [] },
    { key: ['aguardando_turma'], label: 'Aguardando Turma', color: 'var(--amber)', items: [] },
    { key: ['em_andamento'], label: 'Em Andamento', color: 'var(--accent)', items: [] },
    { key: ['concluido'], label: 'Concluído', color: 'var(--green)', items: [] },
    { key: ['certificado_emitido'], label: 'Cert. Emitido', color: 'var(--purple)', items: [] },
  ];

  _matriculas.forEach(m => {
    const col = cols.find(c => c.key.includes(m.status));
    if (col) col.items.push(m);
  });

  board.innerHTML = cols.map(c => `
    <div class="kanban-col">
      <div class="kanban-col-header">
        <span class="kanban-col-title">
          <span class="dot" style="background:${c.color}"></span>
          ${c.label}
        </span>
        <span class="kanban-col-count">${c.items.length}</span>
      </div>
      <div class="kanban-col-body">
        ${c.items.map(m => `
          <div class="kanban-card" data-id="${m.id}" data-nome="${m.aluno?.nome||'—'}" data-curso="${m.curso?.nome||'—'}">
            <div class="kanban-card-name">${m.aluno?.nome || '—'}</div>
            <div class="kanban-card-meta">
              <span class="badge badge-gray" style="font-size:10px">${m.curso?.nome || '—'}</span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');

  document.querySelectorAll('.kanban-card').forEach(card => {
    card.addEventListener('click', () => {
      // Poderia abrir modal de edição rápida do status da matrícula
      toast(`Matrícula selecionada: ${card.dataset.nome}`, 'info');
    });
  });
}
