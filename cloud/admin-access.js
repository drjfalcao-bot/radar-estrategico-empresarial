(() => {
  'use strict';
  const cloud = window.RadarCloud;
  if (!cloud?.profile || cloud.profile.role !== 'admin') return;

  const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const labels = {pending:'Pendente',approved:'Aprovado',rejected:'Rejeitado',suspended:'Suspenso'};

  function style() {
    if (document.getElementById('radar-admin-style')) return;
    const s=document.createElement('style');
    s.id='radar-admin-style';
    s.textContent=`.admin-access-btn{position:relative}.admin-access-btn b{position:absolute;top:-7px;right:-7px;background:#cf2947;color:#fff;border-radius:99px;min-width:18px;height:18px;display:grid;place-items:center;font-size:10px}.ra-o{position:fixed;inset:0;z-index:99999;background:#041425b8;display:grid;place-items:center;padding:20px;font-family:Inter,Arial}.ra-m{width:min(1040px,100%);max-height:90vh;overflow:auto;background:#f5f8fa;border-radius:18px;color:#0b2540}.ra-h{position:sticky;top:0;background:#071b33;color:#fff;padding:18px 22px;display:flex;justify-content:space-between;align-items:center}.ra-h h2{margin:0}.ra-h button,.ra-a button,.ra-tabs button{border:0;border-radius:8px;padding:9px 11px;font-weight:800;cursor:pointer}.ra-h button{background:#173d60;color:#fff}.ra-b{padding:20px}.ra-k{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:15px}.ra-k div,.ra-r{background:#fff;border:1px solid #d9e4ec;border-radius:12px;padding:13px}.ra-k strong{display:block;font-size:23px}.ra-tabs{display:flex;gap:8px;margin-bottom:14px}.ra-tabs button{background:#fff;color:#31536d}.ra-tabs button.on{background:#0a6da8;color:#fff}.ra-p{display:none}.ra-p.on{display:grid;gap:9px}.ra-r{display:grid;grid-template-columns:1.5fr 1fr .8fr auto;gap:10px;align-items:center}.ra-r small{display:block;color:#6d8090}.ra-a{display:flex;gap:6px;flex-wrap:wrap}.ra-a button{border:1px solid #d1dfe8;background:#fff}.ra-a .ok{background:#e8f8ee;color:#17623a}.ra-a .no{background:#fff0f2;color:#981c34}.ra-a .hold{background:#fff5dc;color:#705000}.ra-r select{width:100%;padding:9px;border:1px solid #cfdae3;border-radius:8px}.ra-msg{padding:11px;border-radius:9px;background:#eaf4fb;color:#164f73;margin-bottom:12px}.ra-msg.err{background:#fff0f2;color:#981c34}@media(max-width:780px){.ra-k{grid-template-columns:1fr 1fr}.ra-r{grid-template-columns:1fr}}`;
    document.head.appendChild(s);
  }

  async function data() {
    const [p,l]=await Promise.all([
      cloud.supabase.from('profiles').select('id,email,full_name,phone,professional_title,role,approval_status,requested_at').order('requested_at',{ascending:false}),
      cloud.supabase.from('leads').select('id,owner_user_id,company_name,cnpj,stage,updated_at').order('updated_at',{ascending:false})
    ]);
    if (p.error) throw p.error;
    if (l.error) throw l.error;
    return {profiles:p.data||[],leads:l.data||[]};
  }

  function userActions(p) {
    if (p.id===cloud.profile.id) return '<small>Administrador atual</small>';
    const a=[];
    if(p.approval_status!=='approved')a.push(`<button class="ok" data-st="approved" data-u="${p.id}">Aprovar</button>`);
    if(p.approval_status!=='rejected')a.push(`<button class="no" data-st="rejected" data-u="${p.id}">Rejeitar</button>`);
    if(p.approval_status!=='suspended')a.push(`<button class="hold" data-st="suspended" data-u="${p.id}">Suspender</button>`);
    return a.join('');
  }

  function userRow(p){return `<div class="ra-r"><div><strong>${esc(p.full_name||'Sem nome')}</strong><small>${esc(p.email||'')}</small></div><div><strong>${esc(p.professional_title||'Sem título')}</strong><small>${esc(p.phone||'Sem telefone')}</small></div><div><strong>${esc(labels[p.approval_status]||p.approval_status)}</strong><small>${p.role==='admin'?'Administrador':'Usuário'}</small></div><div class="ra-a">${userActions(p)}</div></div>`;}

  function leadRow(l,users){const opts=users.map(u=>`<option value="${u.id}" ${u.id===l.owner_user_id?'selected':''}>${esc(u.full_name||u.email)}</option>`).join('');return `<div class="ra-r"><div><strong>${esc(l.company_name||'Empresa sem nome')}</strong><small>${esc(l.cnpj||'CNPJ não informado')}</small></div><div><strong>${esc(l.stage||'identificada')}</strong><small>${new Date(l.updated_at).toLocaleDateString('pt-BR')}</small></div><div><select data-owner-for="${esc(l.id)}">${opts}</select></div><div class="ra-a"><button data-save-owner="${esc(l.id)}">Salvar</button></div></div>`;}

  function msg(root,text,error=false){const m=root.querySelector('#ra-msg');if(m)m.innerHTML=`<div class="ra-msg ${error?'err':''}">${esc(text)}</div>`;}

  async function openAdmin(){
    style();
    const o=document.createElement('div');o.className='ra-o';o.innerHTML='<section class="ra-m"><header class="ra-h"><div><h2>Administração de acessos</h2><small>Aprovações e distribuição de leads</small></div><button>Fechar</button></header><div class="ra-b"><div class="ra-msg">Carregando...</div></div></section>';document.body.appendChild(o);
    o.querySelector('.ra-h button').onclick=()=>o.remove();o.onclick=e=>{if(e.target===o)o.remove()};
    try{
      const {profiles,leads}=await data();const approved=profiles.filter(p=>p.approval_status==='approved');const pending=profiles.filter(p=>p.approval_status==='pending').length;
      o.querySelector('.ra-b').innerHTML=`<div id="ra-msg"></div><div class="ra-k"><div><small>Pendentes</small><strong>${pending}</strong></div><div><small>Aprovados</small><strong>${approved.length}</strong></div><div><small>Usuários</small><strong>${profiles.length}</strong></div><div><small>Leads</small><strong>${leads.length}</strong></div></div><nav class="ra-tabs"><button class="on" data-t="u">Usuários</button><button data-t="l">Leads</button></nav><section class="ra-p on" data-p="u">${profiles.map(userRow).join('')||'<div class="ra-msg">Nenhum usuário.</div>'}</section><section class="ra-p" data-p="l">${leads.map(l=>leadRow(l,approved)).join('')||'<div class="ra-msg">Nenhuma lead.</div>'}</section>`;
      o.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>{o.querySelectorAll('[data-t]').forEach(x=>x.classList.toggle('on',x===b));o.querySelectorAll('[data-p]').forEach(x=>x.classList.toggle('on',x.dataset.p===b.dataset.t))});
      o.querySelectorAll('[data-st]').forEach(b=>b.onclick=async()=>{b.disabled=true;msg(o,'Atualizando acesso...');const {error}=await cloud.supabase.rpc('set_user_access',{target_user:b.dataset.u,new_status:b.dataset.st});if(error){b.disabled=false;return msg(o,error.message,true)}o.remove();openAdmin()});
      o.querySelectorAll('[data-save-owner]').forEach(b=>b.onclick=async()=>{const id=b.dataset.saveOwner;const sel=o.querySelector(`[data-owner-for="${CSS.escape(id)}"]`);if(!sel?.value)return;b.disabled=true;msg(o,'Reatribuindo lead...');const {error}=await cloud.supabase.rpc('assign_lead',{target_lead:id,target_owner:sel.value});if(error){b.disabled=false;return msg(o,error.message,true)}msg(o,'Lead reatribuída. Atualizando...');setTimeout(()=>location.reload(),650)});
    }catch(e){o.querySelector('.ra-b').innerHTML=`<div class="ra-msg err">${esc(e.message||e)}</div>`}
  }

  async function addButton(){
    style();const {count}=await cloud.supabase.from('profiles').select('id',{count:'exact',head:true}).eq('approval_status','pending');
    const inject=()=>{const nav=document.querySelector('.topnav');if(!nav||document.getElementById('radar-admin-access-button'))return;const b=document.createElement('button');b.id='radar-admin-access-button';b.className='admin-access-btn';b.innerHTML=`Acessos${count?`<b>${count}</b>`:''}`;b.onclick=openAdmin;nav.appendChild(b)};
    inject();new MutationObserver(inject).observe(document.documentElement,{childList:true,subtree:true});
  }

  addButton().catch(e=>console.error('[Radar Admin]',e));
})();
