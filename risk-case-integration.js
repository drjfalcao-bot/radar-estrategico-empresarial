(() => {
  const DB_KEY = 'radar_estrategico_v2';
  const CURRENT_CASE_KEY = 'radar_current_case_id';
  let scheduled = false;

  const esc = (value = '') => String(value).replace(/[&<>'"]/g, char => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;'
  })[char]);

  function loadDB() {
    try {
      const data = JSON.parse(localStorage.getItem(DB_KEY) || '{"leads":[]}');
      if (!Array.isArray(data.leads)) data.leads = [];
      return data;
    } catch {
      return { leads:[] };
    }
  }

  function currentLead() {
    const db = loadDB();
    const stored = localStorage.getItem(CURRENT_CASE_KEY);
    let lead = db.leads.find(item => item.id === stored);
    if (lead) return lead;
    const company = String(document.querySelector('[data-field="companyName"]')?.value || '').trim();
    const cnpj = String(document.querySelector('[data-field="cnpj"]')?.value || '').trim();
    if (company || cnpj) lead = db.leads.find(item => (cnpj && item.cnpj === cnpj) || (company && item.companyName === company));
    return lead || null;
  }

  function hasRisk(lead) {
    return lead && Number.isFinite(Number(lead.collectionRiskScore)) && lead.collectionRiskStrategy;
  }

  function summaryHTML(lead) {
    const fronts = Array.isArray(lead.collectionRiskFronts) ? lead.collectionRiskFronts : [];
    return `<section class="saved-risk-summary" data-saved-risk-summary>
      <div class="saved-risk-score"><small>Risco de cobrança</small><strong>${Number(lead.collectionRiskScore || 0)}</strong><span>${esc(lead.collectionRiskBand || 'Não classificado')}</span></div>
      <div class="saved-risk-copy"><div class="eyebrow">Leitura processual salva</div><h3>${esc(lead.collectionRiskStrategy)}</h3><p>A indicação foi gerada a partir do estágio de cobrança, execução, citação, constrições, garantias e impactos empresariais informados na prospecção.</p><div class="saved-risk-fronts">${fronts.map(item => `<span>${esc(item)}</span>`).join('')}</div><div class="saved-risk-meta"><span>Complexidade: <strong>${esc(lead.collectionRiskComplexity || 'A definir')}</strong></span><span>Prioridade: <strong>${esc(lead.collectionRiskPriority || 'A definir')}</strong></span></div></div>
    </section>`;
  }

  function injectCaseSummary() {
    const lead = currentLead();
    if (!hasRisk(lead)) return;
    if (document.querySelector('[data-saved-risk-summary]')) return;

    const reading = document.querySelector('.reading-grid');
    const strategy = document.querySelector('.strategy-strip');
    const quickForm = document.querySelector('.quick-form');
    const target = reading || strategy || quickForm;
    if (!target) return;
    target.insertAdjacentHTML('beforebegin', summaryHTML(lead));
  }

  function injectReport() {
    const lead = currentLead();
    const body = document.querySelector('.report-body');
    if (!hasRisk(lead) || !body || body.querySelector('[data-report-risk]')) return;
    const fronts = Array.isArray(lead.collectionRiskFronts) ? lead.collectionRiskFronts : [];
    const sections = [...body.querySelectorAll('.report-section')];
    const strategySection = sections.find(section => /Estratégia (indicada|recomendada)/i.test(section.querySelector('h3')?.textContent || ''));
    const section = document.createElement('section');
    section.className = 'report-section';
    section.dataset.reportRisk = 'true';
    section.innerHTML = `<h3>Risco de cobrança e execução</h3><div class="report-risk-box"><div class="report-risk-grid"><div><small>Risco</small><strong>${Number(lead.collectionRiskScore || 0)}/100 — ${esc(lead.collectionRiskBand || '')}</strong></div><div><small>Complexidade</small><strong>${esc(lead.collectionRiskComplexity || 'A definir')}</strong></div><div><small>Prioridade</small><strong>${esc(lead.collectionRiskPriority || 'A definir')}</strong></div></div><h4>${esc(lead.collectionRiskStrategy)}</h4><p>A estratégia indicada decorre do estágio da cobrança e dos eventos processuais informados, devendo ser confirmada mediante análise dos processos, extratos e documentos do caso.</p>${fronts.length ? `<ul class="report-risk-fronts">${fronts.map(item => `<li>${esc(item)}</li>`).join('')}</ul>` : ''}</div>`;
    if (strategySection) body.insertBefore(section, strategySection);
    else body.appendChild(section);
  }

  function apply() {
    scheduled = false;
    injectCaseSummary();
    injectReport();
  }

  function scheduleApply() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(apply);
  }

  const observer = new MutationObserver(scheduleApply);
  observer.observe(document.documentElement, { childList:true, subtree:true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleApply);
  else scheduleApply();
})();
