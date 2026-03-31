/**
 * /js/views/relatorios.js
 */

import { setContent, toast } from '../ui/components.js';

const CARDS = [
  {titulo:'Receita por Período',  desc:'DRE simplificado com recebimentos e pendências por mês', cor:'var(--green)'},
  {titulo:'Matrículas por Curso', desc:'Ranking de cursos com maior volume de matrículas', cor:'var(--blue)'},
  {titulo:'Inadimplência',        desc:'Alunos com pagamentos em atraso e dias de inadimplência', cor:'var(--red)'},
  {titulo:'Taxa de Conclusão',    desc:'Percentual de alunos que concluíram cada curso', cor:'var(--accent)'},
  {titulo:'Ocupação de Turmas',   desc:'Vagas disponíveis vs ocupadas por turma e período', cor:'var(--purple)'},
  {titulo:'Certificados Emitidos',desc:'Volume de certificados emitidos por mês e curso', cor:'var(--amber)'},
  {titulo:'Taxa de Renovação',    desc:'Conversão de contatos de renovação em novas matrículas', cor:'var(--green)'},
  {titulo:'Coorte de Alunos',     desc:'Acompanhamento da jornada de alunos ao longo do tempo', cor:'var(--blue)'},
];

export async function render() {
  setContent(`
    <div class="page-header">
      <div><h1>Relatórios</h1><p>Análise e Business Intelligence</p></div>
      <div class="page-header-actions">
        <select class="select-input"><option>Últimos 30 dias</option><option>Este mês</option><option>Este trimestre</option><option>Este ano</option></select>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px">
      ${CARDS.map(c => `
        <div class="card" style="padding:20px;cursor:pointer" data-titulo="${c.titulo}"
          onmouseover="this.style.borderColor='${c.cor}';this.style.transform='translateY(-2px)'"
          onmouseout="this.style.borderColor='';this.style.transform=''">
          <div style="width:40px;height:40px;border-radius:var(--radius-sm);background:${c.cor}20;display:grid;place-items:center;margin-bottom:14px;color:${c.cor}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
              ${c.titulo.includes('Receita')     ? '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>' :
                c.titulo.includes('Matrículas')  ? '<path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>' :
                c.titulo.includes('Inadimplência')? '<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/>' :
                '<polyline points="20 6 9 17 4 12"/>'}
            </svg>
          </div>
          <div style="font-weight:600;font-size:14px;margin-bottom:6px">${c.titulo}</div>
          <div style="font-size:12px;color:var(--text-tertiary);line-height:1.5">${c.desc}</div>
        </div>
      `).join('')}
    </div>
  `);

  document.querySelectorAll('.card[data-titulo]').forEach(card => {
    card.addEventListener('click', () => toast(`Abrindo: ${card.dataset.titulo}`, 'info'));
  });
}
