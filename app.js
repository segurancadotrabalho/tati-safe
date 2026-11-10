(() => {
  'use strict';
  const STORAGE_KEY = 'tatiSafe.permissoes.v1';
  const $ = (selector, root=document) => root.querySelector(selector);
  const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];
  let workers = 0;
  let historyStatusFilter = 'todos';
  const readRecords = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; } };
  const saveRecords = records => localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const formatDate = value => value ? new Date(value).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}) : '—';
  function toast(message) { const el=$('#toast'); el.textContent=message; el.classList.add('show'); clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.classList.remove('show'),2800); }
  function navigate(page, filter='todos') {
    if(page==='historico') historyStatusFilter=filter;
    $$('.page').forEach(el=>el.classList.toggle('active',el.id===`page-${page}`));
    $$('.nav-link').forEach(el=>el.classList.toggle('active',el.dataset.page===page));
    const labels={'inicio':'Painel inicial','nova-pt':'Nova Permissão de Trabalho','em-andamento':'PTs em andamento','aguardando':'Aguardando liberação','historico':'Histórico de PTs','analises':'Análises e APR','checklists':'Checklists de segurança','trabalhadores':'Trabalhadores','relatorios':'Relatórios','notificacoes':'Notificações','configuracoes':'Configurações'};
    $('#pageHeading').textContent=labels[page] || 'TATI SAFE';
    $('#sidebar').classList.remove('open');
    if(page==='historico') renderHistory();
    if(page==='inicio') renderDashboard();
    window.scrollTo({top:0,behavior:'smooth'});
  }
  document.addEventListener('click',event=>{
    const nav=event.target.closest('[data-page],[data-go]');
    if(nav){navigate(nav.dataset.page || nav.dataset.go,nav.dataset.filter || 'todos');}
  });
  const shell=$('.app-shell');
  const sidebarToggle=$('#sidebarToggle');
  $('.nav-link').forEach(link=>link.dataset.label=link.textContent.trim());
  if(window.matchMedia('(min-width: 701px)').matches && localStorage.getItem('tatiSidebarCollapsed')==='true'){
    shell.classList.add('sidebar-collapsed');
    sidebarToggle?.setAttribute('aria-label','Expandir menu lateral');
    sidebarToggle?.setAttribute('title','Expandir menu lateral');
  }
  sidebarToggle?.addEventListener('click',()=>{
    const collapsed=shell.classList.toggle('sidebar-collapsed');
    localStorage.setItem('tatiSidebarCollapsed',String(collapsed));
    sidebarToggle.setAttribute('aria-label',collapsed?'Expandir menu lateral':'Minimizar menu lateral');
    sidebarToggle.setAttribute('title',collapsed?'Expandir menu lateral':'Minimizar menu lateral');
  });
  $('#menuButton').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));

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
  const checklistBase = [
    ['area','A área de trabalho foi inspecionada e está livre de riscos não controlados?'],
    ['isolamento','A área está isolada e sinalizada para impedir acesso de pessoas não envolvidas?'],
    ['apr','A análise preliminar de riscos (APR) e as orientações da atividade foram realizadas com a equipe?'],
    ['epi','Os EPIs necessários foram definidos, estão disponíveis e em boas condições?'],
    ['ferramentas','As ferramentas e os equipamentos necessários foram inspecionados e estão adequados?'],
    ['energia','As fontes de energia perigosas foram identificadas e, quando necessário, bloqueadas e identificadas?'],
    ['emergencia','A equipe conhece os meios de comunicação e o procedimento de emergência aplicável?'],
    ['condicoes','As condições do ambiente (iluminação, organização, clima e acesso) permitem executar o serviço com segurança?']
  ];
  const checklistByEquipment = {
    'PTA': [
      ['pta_inspecao','A PTA passou por inspeção antes do uso e não apresenta danos ou falhas aparentes?'],
      ['pta_operador','O operador está capacitado e autorizado para operar a plataforma?'],
      ['pta_solo','O piso está firme, nivelado e suporta a operação da plataforma?'],
      ['pta_area','Há distância segura de redes elétricas, obstáculos e circulação de veículos?'],
      ['pta_cinto','O sistema de proteção contra quedas e o ponto de ancoragem indicado pelo fabricante estão sendo utilizados?']
    ],
    'Escadas': [
      ['escada_estado','A escada está íntegra, sem degraus soltos, trincas, deformações ou improvisos?'],
      ['escada_apoio','A escada está apoiada em superfície firme e posicionada de forma estável?'],
      ['escada_fixacao','A escada está fixada ou estabilizada contra escorregamento e deslocamento?'],
      ['escada_eletrica','Foi verificado o risco de contato com instalações elétricas e escolhido material compatível?'],
      ['escada_uso','O uso da escada é adequado à tarefa, sem sobrealcance ou transporte de carga que comprometa o equilíbrio?']
    ],
    'Andaimes': [
      ['andaime_montagem','O andaime foi montado, alterado e liberado por trabalhador qualificado/autorizado?'],
      ['andaime_base','A base está firme, nivelada e com elementos de apoio adequados?'],
      ['andaime_piso','Os pisos de trabalho estão completos, fixados e sem aberturas perigosas?'],
      ['andaime_guarda','Há proteção contra quedas nas laterais e acessos, conforme configuração aplicável?'],
      ['andaime_acesso','O acesso ao andaime é seguro e independente de subir pela estrutura?'],
      ['andaime_inspecao','O andaime foi inspecionado antes da utilização e está identificado como liberado?']
    ]
  };
  function checklistItems() {
    const selected=$$('input[name="equipamentos"]:checked').map(el=>el.value);
    return [...checklistBase,...selected.flatMap(name=>checklistByEquipment[name]||[])];
  }
  function renderChecklist() {
    const host=$('#safetyChecklist'); if(!host)return;
    const previous=collectChecklist(false);
    const items=checklistItems();
    host.innerHTML=items.map(([key,title],index)=>{
      const old=previous.find(item=>item.key===key)||{};
      const options=[['conforme','Conforme','ok'],['nao_conforme','Não conforme','no'],['na','Não se aplica','na']];
      return `<article class="check-item" data-check-item="${key}">
        <div class="check-question"><span class="check-number">${String(index+1).padStart(2,'0')}</span><strong>${escapeHtml(title)}</strong></div>
        <div class="check-options">${options.map(([value,label,cls])=>`<label class="check-option ${cls}"><input type="radio" name="check_${key}" value="${value}" ${old.status===value?'checked':''} required><span>${label}</span></label>`).join('')}</div>
        <label class="check-justification" ${old.status==='nao_conforme'?'':'hidden'}>Descreva a não conformidade e a ação necessária<textarea rows="2" data-justification="${key}" placeholder="Descreva a pendência encontrada...">${escapeHtml(old.justificativa||'')}</textarea></label>
      </article>`;
    }).join('');
    updateChecklistSummary();
  }
  function collectChecklist(validate=true) {
    return $$('#safetyChecklist [data-check-item]').map(card=>{
      const key=card.dataset.checkItem;
      const selected=$('input[type="radio"]:checked',card);
      const question=$('.check-question strong',card)?.textContent||'';
      const justification=$('[data-justification]',card)?.value.trim()||'';
      return {key,pergunta:question,status:selected?.value||'',justificativa};
    });
  }
  function updateChecklistSummary() {
    const items=collectChecklist(false),answered=items.filter(x=>x.status).length;
    const pending=items.length-answered,issues=items.filter(x=>x.status==='nao_conforme').length;
    const summary=$('#checklistSummary');
    if(summary)summary.textContent=`${answered} de ${items.length} itens respondidos · ${issues} não conformidade(s) · ${pending} pendente(s)`;
  }
  $('#safetyChecklist').addEventListener('change',event=>{
    const card=event.target.closest('[data-check-item]');
    if(card && event.target.matches('input[type="radio"]')){
      const justification=$('[data-justification]',card);
      if(justification){justification.closest('.check-justification').hidden=event.target.value!=='nao_conforme';if(event.target.value!=='nao_conforme')justification.value='';}
      updateChecklistSummary();
    }
  });
  $('#safetyChecklist').addEventListener('input',event=>{if(event.target.matches('[data-justification]'))updateChecklistSummary();});
  $$('input[name="equipamentos"],select[name="tipoTrabalho"]').forEach(el=>el.addEventListener('change',renderChecklist));
  renderChecklist();

  $('#addWorker').addEventListener('click',addWorker);
  addWorker();

  $('#ptForm').addEventListener('submit',event=>{
    event.preventDefault();
    const form=event.currentTarget;
    if(!form.reportValidity())return;
    const workerCards=$$('.worker-card');
    if(!workerCards.length){toast('Adicione pelo menos um trabalhador.');return;}
    const checklist=collectChecklist();
    const unanswered=checklist.filter(item=>!item.status);
    const unjustified=checklist.filter(item=>item.status==='nao_conforme'&&!item.justificativa);
    if(unanswered.length){toast(`Responda todos os itens do checklist (${unanswered.length} pendente(s)).`);$('#safetyChecklist [data-check-item] input:not(:checked)')?.focus();return;}
    if(unjustified.length){toast('Descreva todas as não conformidades antes de salvar.');$('[data-justification]',$('#safetyChecklist [data-check-item="'+unjustified[0].key+'"]'))?.focus();return;}
    const people=workerCards.map(card=>({
      nome:$('.worker-name',card).value.trim(),
      pressaoSistolica:$('.worker-sys',card).value,
      pressaoDiastolica:$('.worker-dia',card).value,
      assinatura:$('.signature-pad',card).hasSignature?$('.signature-pad',card).toDataURL('image/png'):null
    }));
    const data=Object.fromEntries(new FormData(form).entries());
    const record={id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),criadoEm:new Date().toISOString(),status:'Em andamento',...data,equipamentos:$$('input[name="equipamentos"]:checked',form).map(el=>el.value),checklist,trabalhadores:people};
    const records=readRecords();records.unshift(record);saveRecords(records);
    form.reset();$('#workersList').innerHTML='';workers=0;addWorker();
    toast('Permissão salva neste dispositivo.');navigate('historico');
  });

  function recordCard(record) {
    return `<article class="record-item"><div><strong>${escapeHtml(record.local || 'Local não informado')}</strong><small>${escapeHtml(record.tipoTrabalho || 'Tipo não informado')} · ${escapeHtml(record.responsavelExecucao || 'Responsável não informado')}</small><small>Início: ${formatDate(record.dataInicio)} · ${(record.trabalhadores||[]).length} trabalhador(es)</small></div><div class="record-meta"><span>${escapeHtml(record.status)}</span><div class="record-actions"><button data-view="${escapeHtml(record.id)}">Ver detalhes</button><button class="delete" data-delete="${escapeHtml(record.id)}">Excluir</button></div></div></article>`;
  }
  function renderHistory() {
    const term=($('#historySearch')?.value||'').toLocaleLowerCase('pt-BR');
    const records=readRecords().filter(r=>{
      const matchesText=[r.local,r.servico,r.responsavelExecucao,r.tipoTrabalho].join(' ').toLocaleLowerCase('pt-BR').includes(term);
      const matchesStatus=historyStatusFilter==='todos' || (historyStatusFilter==='andamento' ? r.status==='Em andamento' : r.status!=='Em andamento');
      return matchesText && matchesStatus;
    });
    const filterLabel=historyStatusFilter==='andamento'?' em andamento':historyStatusFilter==='encerradas'?' encerrada(s)':'';
    $('#historyCount').textContent=`${records.length} registro(s)${filterLabel}`;
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
    const details=[`PT — ${r.local}`,`Tipo: ${r.tipoTrabalho}`,`Serviço: ${r.servico}`,`Início: ${formatDate(r.dataInicio)}`,`Término: ${formatDate(r.dataFim)}`,`Equipamentos: ${(r.equipamentos||[]).join(', ')||'Não informado'}`,`Responsável execução: ${r.responsavelExecucao}`,`Responsável área: ${r.responsavelArea}`,`Segurança do Trabalho: ${r.seguranca}`,`Trabalhadores:\n${people||'Não informado'}`,`Checklist de segurança:\n${(r.checklist||[]).map((item,i)=>`${i+1}. ${item.pergunta} — ${item.status==='conforme'?'Conforme':item.status==='nao_conforme'?'Não conforme':'Não se aplica'}${item.justificativa?' | Pendência: '+item.justificativa:''}`).join('\n')||'Não registrado'}`,`Observações: ${r.observacoes||'—'}`].join('\n\n');
    alert(details);
  }
  renderDashboard();

  function updateClock(){
    const now=new Date();
    const date=$('#clockDate'),time=$('#clockTime');
    if(date)date.textContent=new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'2-digit',month:'long',year:'numeric',timeZone:'America/Sao_Paulo'}).format(now);
    if(time)time.textContent=new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false,timeZone:'America/Sao_Paulo'}).format(now);
  }
  updateClock();
  setInterval(updateClock,1000);
})();