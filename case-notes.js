(() => {
  const DB_KEY = 'radar_estrategico_v2';
  const CURRENT_CASE_KEY = 'radar_current_case_id';
  const CATEGORIES = {
    geral:'Observação geral',
    contato:'Contato',
    reuniao:'Reunião',
    alinhamento:'Alinhamento interno',
    documento:'Documento',
    objecao:'Objeção',
    estrategia:'Estratégia',
    proposta:'Proposta',
    retorno:'Retorno',
    oportunidade:'Oportunidade'
  };
  const state = { open:false, search:'', category:'todos', editingId:null, scheduled:false };

  const today = () => new Date().toISOString().slice(0, 10);
  const uid = () => `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const esc = (value = '') => String(value).replace(/[&<>'"]/g, char => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;'
  })[char]);
  const fmtDate = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : 'Sem data';

  function loadDB() {
    try {
      const data = JSON.parse(localStorage.getItem(DB_KEY) || '{"leads":[]}');
      if (!Array.isArray(data.leads)) data.leads = [];
      return data;
    } catch {
      return { leads: [] };
    }
  }

  function saveDB(data) {
    localStorage.setItem(DB_KEY, JSON.stringify(data));
  }

  function migrateNotes() {
    const db = loadDB();
    let changed = false;
    db.leads.forEach(lead => {
      if (!Array.isArray(lead.caseNotes)) {
        lead.caseNotes = [];
        changed = true;
      }
    });
    if (changed) saveDB(db);
    return db;
  }

  function currentLead() {
    const db = migrateNotes();
    const storedId = localStorage.getItem(CURRENT_CASE_KEY);
    let lead = db.leads.find(item => item.id === storedId);
    if (lead) return lead;

    const company = String(document.querySelector('[data-field="companyName"]')?.value || '').trim();
    const cnpj = String(document.querySelector('[data-field="cnpj"]')?.value || '').trim();
    if (company || cnpj) {
      lead = db.leads.find(item => (cnpj && item.cnpj === cnpj) || (company && item.companyName === company));
    }
    if (!lead && document.querySelector('.quick-form, .reading-grid, .strategy-strip, .report')) {
      lead = [...db.leads].sort((a,b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')))[0];
    }
    if (lead) localStorage.setItem(CURRENT_CASE_KEY, lead.id);
    return lead || null;
  }

  function updateLead(id, updater) {
    const db = migrateNotes();
    const lead = db.leads.find(item => item.id === id);
    if (!lead) return null;
    updater(lead);
    lead.updatedAt = today();
    saveDB(db);
    return lead;
  }

  function noteCount(lead) {
    return Array.isArray(lead?.caseNotes) ? lead.caseNotes.length : 0;
  }

  function installTab() {
    const nav = document.querySelector('.nav-tabs');
    if (!nav) return;
    const lead = currentLead();
    if (!lead) return;
    let tab = nav.querySelector('.case-notes-tab');
    if (!tab) {
      tab = document.createElement('button');
      tab.className = 'nav-tab case-notes-tab';
      tab.type = 'button';
      tab.innerHTML = `Caderno <span class="note-count">${noteCount(lead)}</span>`;
      tab.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        state.open = true;
        state.editingId = null;
        renderNotebook();
      });
      nav.appendChild(tab);
    } else {
      const count = tab.querySelector('.note-count');
      if (count) count.textContent = noteCount(lead);
    }

    nav.querySelectorAll('.nav-tab:not(.case-notes-tab)').forEach(button => {
      if (button.dataset.noteCloseBound === 'true') return;
      button.dataset.noteCloseBound = 'true';
      button.addEventListener('click', () => { state.open = false; state.editingId = null; }, true);
    });
  }

  function categoryOptions(selected = 'geral', includeAll = false) {
    const options = includeAll ? `<option value="todos" ${selected === 'todos' ? 'selected' : ''}>Todas as tags</option>` : '';
    return options + Object.entries(CATEGORIES).map(([value,label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join('');
  }

  function filteredNotes(lead) {
    const term = state.search.trim().toLowerCase();
    return [...(lead.caseNotes || [])]
      .filter(note => state.category === 'todos' || note.category === state.category || (note.tags || []).includes(state.category))
      .filter(note => {
        if (!term) return true;
        return [note.title, note.body, CATEGORIES[note.category], ...(note.tags || [])]
          .some(value => String(value || '').toLowerCase().includes(term));
      })
      .sort((a,b) => {
        const byDate = String(b.date || '').localeCompare(String(a.date || ''));
        if (byDate !== 0) return byDate;
        return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
      });
  }

  function editorNote(lead) {
    return (lead.caseNotes || []).find(note => note.id === state.editingId) || {
      id:'', date:today(), category:'geral', title:'', body:'', tags:[], pinned:false
    };
  }

  function noteCard(note) {
    const tags = [...new Set([...(note.tags || [])])];
    return `<article class="case-note-card ${note.pinned ? 'pinned' : ''}">
      <div class="case-note-meta"><span class="case-note-date">${fmtDate(note.date)}</span><span class="case-note-category">${esc(CATEGORIES[note.category] || 'Observação')}</span></div>
      <h4>${esc(note.title || CATEGORIES[note.category] || 'Anotação')}</h4>
      <div class="case-note-body">${esc(note.body || '')}</div>
      ${tags.length ? `<div class="case-note-tags">${tags.map(tag => `<span>#${esc(tag)}</span>`).join('')}</div>` : ''}
      <div class="case-note-card-actions"><button data-note-edit="${note.id}">Editar</button><button class="delete" data-note-delete="${note.id}">Excluir</button></div>
    </article>`;
  }

  function renderNotebook() {
    const shell = document.querySelector('.shell');
    const nav = shell?.querySelector('.nav-tabs');
    const lead = currentLead();
    if (!shell || !nav || !lead) return;

    nav.querySelectorAll('.nav-tab').forEach(button => button.classList.remove('active'));
    nav.querySelector('.case-notes-tab')?.classList.add('active');
    [...shell.children].forEach(child => { if (child !== nav) child.remove(); });

    const note = editorNote(lead);
    const notes = filteredNotes(lead);
    const pinnedCount = (lead.caseNotes || []).filter(item => item.pinned).length;
    const categoriesUsed = new Set((lead.caseNotes || []).map(item => item.category)).size;
    const page = document.createElement('section');
    page.className = 'case-notes-page';
    page.innerHTML = `
      <header class="case-notes-head">
        <div><div class="eyebrow">Caderno do Caso</div><h2>${esc(lead.companyName || 'Empresa em análise')}</h2><p>Registre conversas, alinhamentos, objeções, documentos, retornos e decisões. As anotações ficam vinculadas a este caso.</p></div>
        <div class="case-notes-summary"><div class="case-note-stat"><small>Anotações</small><strong>${noteCount(lead)}</strong></div><div class="case-note-stat"><small>Importantes</small><strong>${pinnedCount}</strong></div><div class="case-note-stat"><small>Tipos usados</small><strong>${categoriesUsed}</strong></div></div>
      </header>
      <div class="case-notes-layout">
        <aside class="card case-note-editor">
          <h3>${state.editingId ? 'Editar anotação' : 'Nova anotação'}</h3>
          <p>Use uma nota por conversa ou evento relevante para manter a linha do tempo compreensível.</p>
          <form class="case-note-form" id="case-note-form">
            <input type="hidden" name="id" value="${esc(note.id || '')}">
            <div class="case-note-field two"><label>Data<input name="date" type="date" value="${esc(note.date || today())}"></label><label>Tipo<select name="category">${categoryOptions(note.category || 'geral')}</select></label></div>
            <div class="case-note-field"><label>Título<input name="title" value="${esc(note.title || '')}" placeholder="Ex.: Cliente pediu retorno após reunião com o sócio"></label></div>
            <div class="case-note-field"><label>Anotação<textarea name="body" placeholder="Registre o que foi falado, decisões, objeções, combinações, documentos prometidos e próximos passos">${esc(note.body || '')}</textarea></label></div>
            <div class="case-note-field"><label>Tags adicionais<input name="tags" value="${esc((note.tags || []).join(', '))}" placeholder="Ex.: urgente, sócio, capag, garantia"></label></div>
            <label class="case-note-check"><input name="pinned" type="checkbox" ${note.pinned ? 'checked' : ''}> Marcar como importante</label>
            <div class="case-note-help">Ao salvar, esta anotação também conta como movimentação do caso e atualiza a data de último contato.</div>
            <div class="case-note-actions"><button class="btn btn-primary" type="submit">${state.editingId ? 'Atualizar anotação' : 'Salvar anotação'}</button>${state.editingId ? '<button class="btn btn-secondary" type="button" data-note-cancel>Cancelar edição</button>' : ''}</div>
          </form>
        </aside>
        <main class="card case-notes-list">
          <div class="case-notes-list-head"><div><h3>Linha do tempo</h3><p>Mais recentes primeiro. Use a busca ou filtre pelo tipo de alinhamento.</p></div><div class="case-notes-tools"><input id="case-note-search" value="${esc(state.search)}" placeholder="Buscar nas anotações"><select id="case-note-filter">${categoryOptions(state.category, true)}</select></div></div>
          <div class="case-notes-timeline">${notes.length ? notes.map(noteCard).join('') : '<div class="case-notes-empty"><div class="icon">✎</div><strong>Nenhuma anotação encontrada.</strong><br>Registre o primeiro contato, alinhamento ou decisão deste caso.</div>'}</div>
        </main>
      </div>`;
    shell.appendChild(page);
    bindNotebook(lead);
  }

  function parseTags(value) {
    return [...new Set(String(value || '').split(',').map(tag => tag.trim().replace(/^#/, '').toLowerCase()).filter(Boolean))];
  }

  function saveNote(event, lead) {
    event.preventDefault();
    const form = event.currentTarget;
    const fd = new FormData(form);
    const id = String(fd.get('id') || '').trim();
    const now = new Date().toISOString();
    const data = {
      id:id || uid(),
      date:String(fd.get('date') || today()),
      category:String(fd.get('category') || 'geral'),
      title:String(fd.get('title') || '').trim(),
      body:String(fd.get('body') || '').trim(),
      tags:parseTags(fd.get('tags')),
      pinned:Boolean(form.elements.pinned.checked),
      createdAt:now,
      updatedAt:now
    };
    if (!data.body && !data.title) {
      notify('Escreva um título ou uma anotação.');
      return;
    }

    updateLead(lead.id, target => {
      if (!Array.isArray(target.caseNotes)) target.caseNotes = [];
      const existing = target.caseNotes.find(item => item.id === id);
      if (existing) Object.assign(existing, data, { createdAt:existing.createdAt || now });
      else target.caseNotes.push(data);
      target.lastMovementAt = today();
      if (!Array.isArray(target.commercialHistory)) target.commercialHistory = [];
      target.commercialHistory.push({
        date:new Date().toLocaleString('pt-BR'),
        title:existing ? 'Anotação do caso atualizada' : 'Anotação registrada no caderno',
        note:data.title || CATEGORIES[data.category] || 'Registro do caso'
      });
    });
    state.editingId = null;
    renderNotebook();
    notify(id ? 'Anotação atualizada.' : 'Anotação salva.');
  }

  function deleteNote(leadId, noteId) {
    updateLead(leadId, lead => {
      lead.caseNotes = (lead.caseNotes || []).filter(note => note.id !== noteId);
    });
    if (state.editingId === noteId) state.editingId = null;
    renderNotebook();
    notify('Anotação excluída.');
  }

  function bindNotebook(lead) {
    document.getElementById('case-note-form')?.addEventListener('submit', event => saveNote(event, lead));
    document.querySelector('[data-note-cancel]')?.addEventListener('click', () => { state.editingId = null; renderNotebook(); });
    document.querySelectorAll('[data-note-edit]').forEach(button => button.addEventListener('click', () => { state.editingId = button.dataset.noteEdit; renderNotebook(); window.scrollTo({top:0,behavior:'smooth'}); }));
    document.querySelectorAll('[data-note-delete]').forEach(button => button.addEventListener('click', () => deleteNote(lead.id, button.dataset.noteDelete)));
    const search = document.getElementById('case-note-search');
    if (search) search.addEventListener('input', event => {
      state.search = event.target.value;
      renderNotebook();
      setTimeout(() => {
        const field = document.getElementById('case-note-search');
        if (field) { field.focus(); field.setSelectionRange(field.value.length, field.value.length); }
      }, 0);
    });
    const filter = document.getElementById('case-note-filter');
    if (filter) filter.addEventListener('change', event => { state.category = event.target.value; renderNotebook(); });
  }

  function notify(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2200);
  }

  function apply() {
    state.scheduled = false;
    migrateNotes();
    installTab();
    if (state.open && !document.querySelector('.case-notes-page') && document.querySelector('.nav-tabs')) renderNotebook();
  }

  function scheduleApply() {
    if (state.scheduled) return;
    state.scheduled = true;
    requestAnimationFrame(apply);
  }

  const observer = new MutationObserver(scheduleApply);
  observer.observe(document.documentElement, { childList:true, subtree:true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleApply);
  else scheduleApply();
})();
