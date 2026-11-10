(() => {
  'use strict';
  const STORAGE_KEY = 'tatiSafe.permissoes.v1';
  const $ = (selector, root=document) => root.querySelector(selector);
  const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];
  let workers = 0;
  const readRecords = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; } };
  const saveRecords = records => localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const formatDate = value => value ? new Date(value).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}) : '—';
  function toast(message) { const el=$('#toast'); el.textContent=message; el.classList.add('show'); clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.classList.remove('show'),2800); }
  function navigate(page) {
    $$('.page').forEach(el=>el.classList.toggle('active',el.id===`page-${page}`));
    $$('.nav-link').forEach(el=>el.classList.toggle('active',el.dataset.page===page));
    const labels={'inicio':'Painel inicial','nova-pt':'Nova Permissão de Trabalho','em-andamento':'PTs em andamento','aguardando':'Aguardando liberação','encerradas':'PTs encerradas','historico':'Histórico de PTs','analises':'Análises e APR','checklists':'Checklists de segurança','trabalhadores':'Trabalhadores','relatorios':'Relatórios','notificacoes':'Notificações','configuracoes':'Configurações'};
    $('#pageHeading').textContent=labels[page] || 'TATI SAFE';
    $('#sidebar').classList.remove('open');
    if(page==='historico') renderHistory();
    if(page==='inicio') renderDashboard();
    window.scrollTo({top:0,behavior:'smooth'});
  }
  document.addEventListener('click',event=>{
    const nav=event.target.closest('[data-page],[data-go]');
    if(nav){navigate(nav.dataset.page || nav.dataset.go);}
  });
  $('#menuButton').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));
  $('#menuSearch').addEventListener('input',event=>{const term=event.target.value.toLocaleLowerCase('pt-BR');$('.nav-link').forEach(link=>{link.style.display=link.textContent.toLocaleLowerCase('pt-BR').includes(term)?'flex':'none';});$('.nav-section-label').forEach(label=>{let next=label.nextElementSibling,visible=false;while(next&& !next.classList.contains('nav-section-label')){if(next.classList.contains('nav-link')&&next.style.display!=='none')visible=true;next=next.nextElementSibling;}label.style.display=visible?'block':'none';});});

  function addWorker() {
    workers++;
    const id=workers;
    const wrapper=document.createElement('div');
    wrapper.className='worker-card'; wrapper.dataset.worker=id;
    wrapper.innerHTML=`<div class="worker-head"><strong>Trabalhador ${id}</strong><button type="button" class="remove-worker">Remover</button></div>
      <div class="worker-grid">
        <label>Nome completo<input class="worker-name" required placeholder="Nome do trabalhador"></label>
        <label>Pressão arterial — sistólica (mmHg)<input class="worker-sys" type="number" min="50" max="260" placeholder="Ex.: 120"></label>
        <label>Pressão arterial — diastólica (mmHg)<input class="worker-dia" type="number" min="30" max="160" placeholder="Ex.: 80"></label>
      </div>
      <div class="signature-wrap"><label>Assinatura do trabalhador</label><canvas class="signature-pad" aria-label="Campo para assinatura digital"></canvas><div class="signature-tools"><button type="button" class="clear-signature">Limpar assinatura</button></div></div>`;
    $('#workersList').appendChild(wrapper);
    setupSignature($('.signature-pad',wrapper));
    $('.remove-worker',wrapper).addEventListener('click',()=>wrapper.remove());
    $('.clear-signature',wrapper).addEventListener('click',()=>{const c=$('.signature-pad',wrapper),ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);});
  }
  function setupSignature(canvas) {
    const ctx=canvas.getContext('2d'); let drawing=false, signed=false;
    const resize=()=>{const ratio=window.devicePixelRatio||1, rect=canvas.getBoundingClientRect();const old=signed?canvas.toDataURL():null;canvas.width=rect.width*ratio;canvas.height=rect.height*ratio;ctx.setTransform(ratio,0,0,ratio,0,0);ctx.lineWidth=2;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#183c59';if(old){const img=new Image();img.onload=()=>ctx.drawImage(img,0,0,rect.width,rect.height);img.src=old;}};
    resize();
    const point=e=>{const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};};
    canvas.addEventListener('pointerdown',e=>{drawing=true;signed=true;canvas.setPointerCapture(e.pointerId);const p=point(e);ctx.beginPath();ctx.moveTo(p.x,p.y);});
    canvas.addEventListener('pointermove',e=>{if(!drawing)return;const p=point(e);ctx.lineTo(p.x,p.y);ctx.stroke();});
    ['pointerup','pointercancel','lostpointercapture'].forEach(name=>canvas.addEventListener(name,()=>drawing=false));
    canvas.dataset.signed='false';
    Object.defineProperty(canvas,'hasSignature',{get:()=>signed});
  }
  $('#addWorker').addEventListener('click',addWorker);
  addWorker();

  $('#ptForm').addEventListener('submit',event=>{
    event.preventDefault();
    const form=event.currentTarget;
    if(!form.reportValidity())return;
    const workerCards=$$('.worker-card');
    if(!workerCards.length){toast('Adicione pelo menos um trabalhador.');return;}
    const people=workerCards.map(card=>({
      nome:$('.worker-name',card).value.trim(),
      pressaoSistolica:$('.worker-sys',card).value,
      pressaoDiastolica:$('.worker-dia',card).value,
      assinatura:$('.signature-pad',card).hasSignature?$('.signature-pad',card).toDataURL('image/png'):null
    }));
    const data=Object.fromEntries(new FormData(form).entries());
    const record={id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),criadoEm:new Date().toISOString(),status:'Em andamento',...data,equipamentos:$$('input[name="equipamentos"]:checked',form).map(el=>el.value),trabalhadores:people};
    const records=readRecords();records.unshift(record);saveRecords(records);
    form.reset();$('#workersList').innerHTML='';workers=0;addWorker();
    toast('Permissão salva neste dispositivo.');navigate('historico');
  });

  function recordCard(record) {
    return `<article class="record-item"><div><strong>${escapeHtml(record.local || 'Local não informado')}</strong><small>${escapeHtml(record.tipoTrabalho || 'Tipo não informado')} · ${escapeHtml(record.responsavelExecucao || 'Responsável não informado')}</small><small>Início: ${formatDate(record.dataInicio)} · ${(record.trabalhadores||[]).length} trabalhador(es)</small></div><div class="record-meta"><span>${escapeHtml(record.status)}</span><div class="record-actions"><button data-view="${escapeHtml(record.id)}">Ver detalhes</button><button class="delete" data-delete="${escapeHtml(record.id)}">Excluir</button></div></div></article>`;
  }
  function renderHistory() {
    const term=($('#historySearch')?.value||'').toLocaleLowerCase('pt-BR');
    const records=readRecords().filter(r=>[r.local,r.servico,r.responsavelExecucao,r.tipoTrabalho].join(' ').toLocaleLowerCase('pt-BR').includes(term));
    $('#historyCount').textContent=`${records.length} registro(s)`;
    $('#historyList').innerHTML=records.length?records.map(recordCard).join(''):'<div class="empty-state">Nenhuma permissão encontrada.</div>';
  }
  function renderDashboard() {
    const records=readRecords();
    const active=records.filter(r=>r.status==='Em andamento');
    $('#totalPts').textContent=records.length;$('#activePts').textContent=active.length;$('#closedPts').textContent=records.length-active.length;
    $('#recentList').innerHTML=records.length?records.slice(0,4).map(recordCard).join(''):'<div class="empty-state">Nenhuma PT cadastrada. Comece criando uma nova permissão.</div>';
  }
  $('#historySearch').addEventListener('input',renderHistory);
  document.addEventListener('click',event=>{
    const view=event.target.closest('[data-view]');
    if(view){const record=readRecords().find(r=>r.id===view.dataset.view);if(record)showDetails(record);}
    const del=event.target.closest('[data-delete]');
    if(del){if(!confirm('Deseja realmente excluir esta Permissão de Trabalho?'))return;saveRecords(readRecords().filter(r=>r.id!==del.dataset.delete));renderHistory();renderDashboard();toast('Registro excluído.');}
  });
  function showDetails(r) {
    const people=(r.trabalhadores||[]).map(p=>`• ${escapeHtml(p.nome)} — PA: ${escapeHtml(p.pressaoSistolica||'—')}/${escapeHtml(p.pressaoDiastolica||'—')} mmHg`).join('\n');
    const details=[`PT — ${r.local}`,`Tipo: ${r.tipoTrabalho}`,`Serviço: ${r.servico}`,`Início: ${formatDate(r.dataInicio)}`,`Término: ${formatDate(r.dataFim)}`,`Equipamentos: ${(r.equipamentos||[]).join(', ')||'Não informado'}`,`Responsável execução: ${r.responsavelExecucao}`,`Responsável área: ${r.responsavelArea}`,`Segurança do Trabalho: ${r.seguranca}`,`Trabalhadores:\n${people||'Não informado'}`,`Observações: ${r.observacoes||'—'}`].join('\n\n');
    alert(details);
  }
  renderDashboard();

  function updateClock(){
    const now=new Date();
    const date=$('#clockDate'),time=$('#clockTime');
    if(date)date.textContent=new Intl.DateTimeFormat('pt-BR',{weekday:'short',day:'2-digit',month:'short',year:'numeric'}).format(now);
    if(time)time.textContent=new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(now);
  }
  updateClock();
  setInterval(updateClock,1000);
})();