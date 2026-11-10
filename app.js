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
    const epiHost=document.createElement('div');epiHost.className='worker-epi-section';epiHost.innerHTML='<h3>Conferência individual dos EPIs</h3><p>Confirme a condição de cada EPI para este trabalhador.</p><div class="worker-epi-list"></div>';wrapper.insertBefore(epiHost,$('.signature-wrap',wrapper));renderWorkersEpis();
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
    ['area','A área foi inspecionada e os riscos do entorno foram identificados e controlados?'],
    ['isolamento','O local está isolado, sinalizado e com acesso restrito às pessoas envolvidas?'],
    ['apr','A APR foi elaborada com participação da equipe e todos compreenderam os riscos e controles?'],
    ['epi','Os EPIs foram definidos pela avaliação de riscos, estão disponíveis, íntegros e com CA válido quando aplicável?'],
    ['ferramentas','Ferramentas, máquinas e acessórios foram inspecionados e são adequados à tarefa?'],
    ['energia','As fontes de energia elétrica, mecânica, hidráulica, pneumática e outras foram identificadas e controladas?'],
    ['emergencia','A equipe conhece os meios de comunicação, recursos de emergência e procedimento de abandono?'],
    ['ambiente','Iluminação, ventilação, clima, limpeza, acesso e condições do piso permitem o trabalho seguro?'],
    ['interferencias','Atividades simultâneas e interferências com outras equipes foram avaliadas e coordenadas?'],
    ['competencia','Todos os envolvidos possuem capacitação, autorização e condição para executar a atividade?'],
    ['ordem','A organização, armazenamento de materiais e descarte de resíduos foram planejados?']
  ];
  const checklistByWork = {
    'Trabalho em altura': [
      ['altura_analise','A atividade foi planejada e a análise de risco de trabalho em altura foi realizada?'],
      ['altura_hierarquia','Foram priorizadas medidas para evitar o trabalho em altura e, quando inviável, proteção coletiva?'],
      ['altura_sistema','O sistema de proteção individual contra quedas é adequado, compatível, inspecionado e ancorado em ponto previsto?'],
      ['altura_inspecao','Cinturão, talabarte, conectores e trava-quedas foram inspecionados antes do uso?'],
      ['altura_resgate','Existe plano de emergência e resgate, equipe capacitada e recursos disponíveis no local?'],
      ['altura_clima','Vento, chuva, descargas atmosféricas e demais condições climáticas foram avaliados?'],
      ['altura_objetos','Ferramentas e materiais estão presos ou acondicionados para evitar queda de objetos?']
    ],
    'Trabalho a quente': [
      ['quente_autorizacao','A autorização para trabalho a quente foi emitida após avaliação dos riscos?'],
      ['quente_combustiveis','Materiais combustíveis, inflamáveis e fontes de vazamento foram removidos ou protegidos?'],
      ['quente_atmosfera','Quando aplicável, a atmosfera foi avaliada quanto a gases, vapores e risco de explosividade?'],
      ['quente_extintor','Há extintor compatível, inspecionado, desobstruído e acessível junto ao serviço?'],
      ['quente_faiscas','Fagulhas e partículas estão contidas, inclusive em níveis inferiores e no lado oposto da estrutura?'],
      ['quente_cilindros','Cilindros, mangueiras, reguladores e conexões estão íntegros, fixados e afastados de calor?'],
      ['quente_vigia','Foi definido vigia de incêndio e período de monitoramento após o término, conforme procedimento?']
    ],
    'Espaço confinado': [
      ['espaco_pet','A Permissão de Entrada e Trabalho (PET) foi emitida, está válida e disponível no local?'],
      ['espaco_isolamento','O espaço foi isolado de energias, linhas, produtos e possíveis entradas de fluidos?'],
      ['espaco_atmosfera','A atmosfera foi testada antes da entrada e será monitorada conforme a PET?'],
      ['espaco_ventilacao','A ventilação e os equipamentos utilizados são adequados aos riscos identificados?'],
      ['espaco_vigia','Há vigia exclusivo, comunicação contínua e controle de entrada e saída?'],
      ['espaco_resgate','Equipe, equipamentos e plano de resgate estão disponíveis sem depender de improviso?'],
      ['espaco_equipe','Trabalhadores, supervisor de entrada e vigia estão capacitados e autorizados?']
    ],
    'Elétrica': [
      ['eletrica_autorizacao','Os trabalhadores estão qualificados, capacitados e autorizados para a intervenção?'],
      ['eletrica_desenergizacao','A desenergização foi priorizada e as etapas de seccionamento, bloqueio e sinalização foram cumpridas?'],
      ['eletrica_teste','A ausência de tensão foi constatada com instrumento adequado e testado antes e depois da medição?'],
      ['eletrica_aterramento','O aterramento temporário e a equipotencialização foram aplicados quando exigidos?'],
      ['eletrica_zonas','As zonas controladas, de risco e distâncias de segurança foram respeitadas?'],
      ['eletrica_arco','O risco de arco elétrico foi avaliado e as medidas de proteção correspondentes foram adotadas?'],
      ['eletrica_religamento','Foi definido controle contra religamento acidental e procedimento para reenergização?']
    ],
    'Manutenção industrial': [
      ['manut_bloqueio','Todas as fontes de energia foram identificadas, isoladas, bloqueadas e testadas antes da intervenção?'],
      ['manut_pressao','Energias residuais, pressão, gravidade, temperatura e partes móveis foram eliminadas ou contidas?'],
      ['manut_guardas','Proteções e dispositivos de segurança serão reinstalados e testados antes da liberação?'],
      ['manut_pecas','Peças, ferramentas e dispositivos de içamento são compatíveis com a intervenção?'],
      ['manut_partida','Foi impedida a partida inesperada durante a execução e comunicada a equipe envolvida?'],
      ['manut_teste','A área está livre de pessoas e materiais antes dos testes funcionais?']
    ],
    'Telhados': [
      ['telhado_cobertura','A resistência, inclinação e condições da cobertura foram avaliadas antes do acesso?'],
      ['telhado_fragil','Telhas frágeis, claraboias, aberturas e bordas estão identificadas e protegidas?'],
      ['telhado_acesso','O acesso, circulação e transporte de materiais foram planejados e controlados?'],
      ['telhado_ancoragem','Os pontos de ancoragem e sistemas contra quedas são adequados e foram inspecionados?'],
      ['telhado_clima','Chuva, vento, umidade, calor e risco de descargas atmosféricas foram avaliados?'],
      ['telhado_resgate','Há plano e meios de resgate compatíveis com o acesso e a configuração do telhado?']
    ],
    'Movimentação de cargas': [
      ['carga_plano','A movimentação foi planejada considerando peso, dimensões, centro de gravidade e percurso?'],
      ['carga_capacidade','Equipamento e acessórios possuem capacidade identificada e compatível com a carga?'],
      ['carga_inspecao','Cabos, cintas, correntes, ganchos, manilhas e pontos de pega foram inspecionados?'],
      ['carga_isolamento','A área está isolada e ninguém permanece sob carga suspensa ou na zona de esmagamento?'],
      ['carga_sinaleiro','Sinaleiro e operador definiram comunicação e sinais antes do início?'],
      ['carga_condicoes','Solo, patolamento, estabilidade e interferências aéreas foram avaliados?']
    ],
    'Trabalho com empilhadeiras': [
      ['empilhadeira_check','A inspeção pré-uso foi realizada e defeitos foram comunicados?'],
      ['empilhadeira_operador','O operador está capacitado, autorizado e em condições de conduzir?'],
      ['empilhadeira_rota','A rota está definida, sinalizada, livre de obstáculos e segregada de pedestres?'],
      ['empilhadeira_carga','A carga está estável, corretamente posicionada e dentro da capacidade residual?'],
      ['empilhadeira_dispositivos','Freios, buzina, iluminação, alarmes, garfos e demais dispositivos estão operacionais?'],
      ['empilhadeira_estacionamento','Foi definido local seguro para estacionamento, com garfos abaixados e equipamento imobilizado?']
    ],
    'Escavação': [
      ['escavacao_interferencias','Redes enterradas e demais interferências foram localizadas e sinalizadas antes da escavação?'],
      ['escavacao_solo','Tipo de solo, estabilidade, profundidade e necessidade de escoramento foram avaliados?'],
      ['escavacao_borda','Materiais, máquinas e cargas estão afastados das bordas conforme avaliação técnica?'],
      ['escavacao_acesso','Há acesso e saída seguros, proteção contra quedas e controle de entrada?'],
      ['escavacao_agua','Há controle de água, infiltração, atmosfera perigosa e risco de soterramento?'],
      ['escavacao_inspecao','A escavação será inspecionada após chuva, alteração das condições ou evento que afete sua estabilidade?']
    ],
    'Outros': [
      ['outros_riscos','Os riscos específicos desta atividade foram identificados e registrados na APR?'],
      ['outros_controles','As medidas de prevenção foram definidas, comunicadas e verificadas com a equipe?']
    ]
  };
  const epiByWork = {
    'Trabalho em altura':['Capacete com jugular','Cinturão tipo paraquedista','Talabarte ou trava-quedas compatível com o sistema','Calçado de segurança adequado à superfície','Luvas adequadas à tarefa','Óculos de segurança'],
    'Trabalho a quente':['Máscara de solda com filtro adequado ao processo','Óculos de segurança para preparação e acabamento','Luvas de proteção térmica/solda','Avental de raspa ou vestimenta resistente a chamas','Mangotes e perneiras de proteção quando houver exposição','Calçado de segurança adequado ao risco','Proteção respiratória definida pela avaliação de fumos'],
    'Espaço confinado':['Capacete com jugular quando houver risco de impacto/queda de objetos','Óculos ou proteção facial conforme o risco','Luvas compatíveis com os agentes presentes','Calçado de segurança adequado ao ambiente','Proteção respiratória definida pela avaliação atmosférica','Cinturão e acessórios de resgate quando previstos na PET'],
    'Elétrica':['Capacete com classe de proteção adequada ao risco','Óculos de segurança e/ou proteção facial contra arco conforme análise','Luvas isolantes da classe adequada, com cobertura quando requerida','Vestimenta com proteção contra arco elétrico conforme estudo de energia incidente','Calçado de segurança compatível com o risco elétrico'],
    'Manutenção industrial':['Capacete de segurança conforme risco','Óculos de segurança ou proteção facial conforme tarefa','Luvas adequadas ao risco mecânico, químico ou térmico','Calçado de segurança adequado ao risco','Protetor auditivo conforme avaliação de ruído','Proteção respiratória conforme avaliação de contaminantes'],
    'Telhados':['Capacete com jugular','Cinturão tipo paraquedista','Talabarte ou trava-quedas compatível com o sistema','Calçado com solado adequado à cobertura','Luvas adequadas à tarefa','Óculos de segurança'],
    'Movimentação de cargas':['Capacete de segurança conforme risco','Óculos de segurança','Luvas adequadas ao manuseio e sem risco de enroscamento','Calçado de segurança com proteção compatível com a carga','Colete de alta visibilidade quando houver tráfego de veículos'],
    'Trabalho com empilhadeiras':['Calçado de segurança','Colete de alta visibilidade quando previsto na avaliação da rota','Capacete conforme risco do local','Óculos de segurança conforme risco da operação'],
    'Escavação':['Capacete de segurança','Óculos de segurança','Luvas adequadas ao material e à tarefa','Calçado de segurança adequado ao terreno','Colete de alta visibilidade quando houver circulação de máquinas','Proteção respiratória conforme avaliação de poeiras/contaminantes'],
    'Outros':['Capacete conforme avaliação de risco','Óculos de segurança conforme risco','Luvas adequadas ao risco','Calçado de segurança adequado','Proteção auditiva e respiratória conforme avaliação']
  };
  function checklistItems() {
    const selected=$$('input[name="equipamentos"]:checked').map(el=>el.value);
    const work=$('select[name="tipoTrabalho"]')?.value||'';
    return [...checklistBase,...(checklistByWork[work]||[]),...selected.flatMap(name=>checklistByEquipment[name]||[])];
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
      return {key,pergunta:question,status:selected?.value||'',justificativa:justification};
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
  function selectedActivityEpis(){
    const work=$('select[name="tipoTrabalho"]')?.value||'Outros';
    const equipment=$('input[name="equipamentos"]:checked').map(el=>el.value);
    const items=[...(epiByWork[work]||epiByWork['Outros'])];
    if(work==='Trabalho em altura'||work==='Telhados'||equipment.includes('PTA')||equipment.includes('Andaimes')){
      if(!items.includes('Capacete com jugular'))items.push('Capacete com jugular');
      if(!items.includes('Sistema individual de proteção contra quedas compatível'))items.push('Sistema individual de proteção contra quedas compatível');
    }
    if(equipment.includes('Escadas')&&!items.includes('Calçado com solado aderente'))items.push('Calçado com solado aderente');
    const extra=($('#epiExtra')?.value||'').split(',').map(x=>x.trim()).filter(Boolean);
    return [...new Set([...items,...extra])];
  }
  function renderActivityEpis(){
    const host=$('#activityEpiList');if(!host)return;
    const previous=new Set($('#activityEpiList input:checked').map(el=>el.value));
    const items=selectedActivityEpis();
    host.innerHTML=items.map(item=>'<label class="activity-epi-option"><input type="checkbox" name="episAtividade" value="'+escapeHtml(item)+'" '+(previous.has(item)||!previous.size?'checked':'')+'><span>'+escapeHtml(item)+'</span></label>').join('');
    renderWorkersEpis();
  }
  function renderWorkersEpis(){
    const items=$('input[name="episAtividade"]:checked').map(el=>el.value);
    $('.worker-card').forEach(card=>{
      const host=$('.worker-epi-list',card);if(!host)return;
      const previous={};$('input[type="radio"]',host).forEach(el=>{if(el.checked)previous[el.name]=el.value;});
      host.innerHTML=items.map((item,i)=>{const key='worker_epi_'+i;const value=previous[key]||'';return '<div class="worker-epi-row"><strong>'+escapeHtml(item)+'</strong><div class="worker-epi-status"><label><input type="radio" name="'+key+'" value="adequado" '+(value==='adequado'?'checked':'')+' required> Conferido / adequado</label><label><input type="radio" name="'+key+'" value="pendente" '+(value==='pendente'?'checked':'')+' required> Ausente / inadequado</label></div></div>';}).join('');
    });
  }
  $('input[name="equipamentos"]').forEach(el=>el.addEventListener('change',()=>{renderChecklist();renderActivityEpis();}));
  $('select[name="tipoTrabalho"]').addEventListener('change',()=>{renderChecklist();renderActivityEpis();});
  $('#epiExtra').addEventListener('input',renderActivityEpis);
  $('#activityEpiList').addEventListener('change',renderWorkersEpis);
  renderChecklist();renderActivityEpis();

  $('#addWorker').addEventListener('click',addWorker);
  addWorker();

  $('#ptForm').addEventListener('submit',event=>{
    event.preventDefault();
    const form=event.currentTarget;
    if(!form.reportValidity())return;
    const workerCards=$$('.worker-card');
    if(!workerCards.length){toast('Adicione pelo menos um trabalhador.');return;}
    const checklist=collectChecklist();
    const activityEpis=$('input[name="episAtividade"]:checked').map(el=>el.value);
    if(!activityEpis.length){toast('Defina os EPIs necessários para a atividade.');$('#activityEpiList')?.scrollIntoView({behavior:'smooth',block:'center'});return;}
    const epiPending=workerCards.some(card=>activityEpis.some((epi,i)=>{const selected=$('input[name="worker_epi_'+i+'"]:checked',card);return !selected||selected.value!=='adequado';}));
    if(epiPending){toast('Todos os EPIs devem estar conferidos e adequados para cada trabalhador.');$('.worker-epi-section')?.scrollIntoView({behavior:'smooth',block:'center'});return;}
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
    const record={id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),criadoEm:new Date().toISOString(),status:'Em andamento',...data,equipamentos:$('input[name="equipamentos"]:checked',form).map(el=>el.value),episAtividade:activityEpis,checklist,trabalhadores:people.map((person,index)=>({...person,episConferidos:activityEpis.map((epi,i)=>({epi,status:$('input[name="worker_epi_'+i+'"]:checked',workerCards[index])?.value||'pendente'}))}))};
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
    const details=[`PT — ${r.local}`,`Tipo: ${r.tipoTrabalho}`,`Serviço: ${r.servico}`,`Início: ${formatDate(r.dataInicio)}`,`Término: ${formatDate(r.dataFim)}`,`Equipamentos: ${(r.equipamentos||[]).join(', ')||'Não informado'}`,`Responsável execução: ${r.responsavelExecucao}`,`Responsável área: ${r.responsavelArea}`,`Segurança do Trabalho: ${r.seguranca}`,`Trabalhadores:\n${people||'Não informado'}`,`EPIs necessários:\n${(r.episAtividade||[]).join(', ')||'Não registrado'}`,`EPIs por trabalhador:\n${(r.trabalhadores||[]).map(p=>p.nome+': '+(p.episConferidos||[]).map(e=>e.epi+' — '+(e.status==='adequado'?'Conferido':'Pendente')).join('; ')).join('\n')}`,`Checklist de segurança:\n${(r.checklist||[]).map((item,i)=>`${i+1}. ${item.pergunta} — ${item.status==='conforme'?'Conforme':item.status==='nao_conforme'?'Não conforme':'Não se aplica'}${item.justificativa?' | Pendência: '+item.justificativa:''}`).join('\n')||'Não registrado'}`,`Observações: ${r.observacoes||'—'}`].join('\n\n');
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