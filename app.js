(() => {
  'use strict';
  const STORAGE_KEY = 'tatiSafe.permissoes.v1';
  const $ = (selector, root=document) => root.querySelector(selector);
  const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];
  let workers = 0;
  let historyStatusFilter = 'todos';
  let runningMetricFilter = 'all';
  let pendingMetricFilter = 'all';
  const readRecords = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; } };
  const saveRecords = records => localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const formatDate = value => value ? new Date(value).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}) : '—';
  function toast(message) { const el=$('#toast'); el.textContent=message; el.classList.add('show'); clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.classList.remove('show'),2800); }
  function navigate(page, filter='todos') {
    if(page==='historico') historyStatusFilter=filter;
    $$('.page').forEach(el=>el.classList.toggle('active',el.id===`page-${page}`));
    $$('.nav-link').forEach(el=>el.classList.toggle('active',el.dataset.page===page));
    const labels={'inicio':'Painel inicial','nova-pt':'Nova Permissão de Trabalho','em-andamento':'Permissões em execução','aguardando':'Aguardando liberação','historico':'Histórico de PTs','analises':'Análises e APR','checklists':'Checklists de segurança','trabalhadores':'Trabalhadores','relatorios':'Relatórios','notificacoes':'Notificações','configuracoes':'Configurações'};
    $('#pageHeading').textContent=labels[page] || 'TATI SAFE';
    $('#sidebar').classList.remove('open');
    if(page==='historico') renderHistory();
    if(page==='analises') renderAprs();
    if(page==='checklists') renderSafetyChecks();
    if(page==='em-andamento') renderRunning();
    if(page==='aguardando') renderPending();
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
      <div class="signature-wrap"><label>Assinatura do trabalhador</label><div class="signature-preview"><canvas class="signature-pad" aria-label="Prévia da assinatura digital"></canvas></div><div class="signature-tools"><button type="button" class="open-signature">✍ Assinar digitalmente</button><button type="button" class="clear-signature">Limpar</button></div></div>`;
    $('#workersList').appendChild(wrapper);
    setupSignature($('.signature-pad',wrapper));
    const epiHost=document.createElement('section');epiHost.className='worker-epi-section';epiHost.innerHTML='<button type="button" class="worker-epi-toggle" aria-expanded="false"><span><strong>Conferência individual dos EPIs</strong><small>Verificar os equipamentos deste trabalhador</small></span><span class="worker-epi-chevron" aria-hidden="true">⌄</span></button><div class="worker-epi-content" hidden><div class="worker-epi-list"></div></div>';wrapper.insertBefore(epiHost,$('.signature-wrap',wrapper));$('.worker-epi-toggle',epiHost).addEventListener('click',()=>{const toggle=$('.worker-epi-toggle',epiHost);const content=$('.worker-epi-content',epiHost);const expanded=toggle.getAttribute('aria-expanded')==='true';toggle.setAttribute('aria-expanded',String(!expanded));content.hidden=expanded;});renderWorkersEpis();
    $('.remove-worker',wrapper).addEventListener('click',()=>wrapper.remove());
    $('.clear-signature',wrapper).addEventListener('click',()=>$('.signature-pad',wrapper).clearSignature());
    $('.open-signature',wrapper).addEventListener('click',()=>openSignature($('.signature-pad',wrapper)));
  }
  function setupSignature(canvas) {
    const ctx = canvas.getContext('2d');
    let drawing = false, signed = false, lastPoint = null;
    let activePointerId = null;
    let signatureData = null;
    let redrawToken = 0;

    const ratioNow = () => Math.max(1, window.devicePixelRatio || 1);
    const configureContext = () => {
      const ratio = ratioNow();
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.lineWidth = 2.8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#183c59';
    };
    const drawSaved = (data, token) => {
      if (!data) return;
      const image = new Image();
      image.onload = () => {
        if (token !== redrawToken) return;
        const rect = canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        configureContext();
        ctx.clearRect(0, 0, rect.width, rect.height);
        ctx.drawImage(image, 0, 0, rect.width, rect.height);
      };
      image.src = data;
    };
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return false;
      const ratio = ratioNow();
      const width = Math.round(rect.width * ratio);
      const height = Math.round(rect.height * ratio);
      if (canvas.width === width && canvas.height === height) return true;
      // A assinatura fica guardada fora do bitmap, que é apagado ao redimensionar.
      if (signed && !signatureData) {
        try { signatureData = canvas.toDataURL('image/png'); } catch (_) {}
      }
      canvas.width = width;
      canvas.height = height;
      configureContext();
      const token = ++redrawToken;
      if (signed && signatureData) drawSaved(signatureData, token);
      return true;
    };
    const point = event => {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    const start = event => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (event.cancelable) event.preventDefault();
      if (!resize()) return;
      const p = point(event);
      drawing = true;
      signed = true;
      lastPoint = p;
      activePointerId = event.pointerId ?? null;
      canvas.dataset.signed = 'true';
      if (activePointerId !== null && canvas.setPointerCapture) {
        try { canvas.setPointerCapture(activePointerId); } catch (_) {}
      }
      configureContext();
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.4, 0, Math.PI * 2);
      ctx.fillStyle = '#183c59';
      ctx.fill();
      signatureData = null;
    };
    const move = event => {
      if (!drawing) return;
      if (event.cancelable) event.preventDefault();
      const p = point(event);
      configureContext();
      ctx.beginPath();
      ctx.moveTo(lastPoint.x, lastPoint.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      lastPoint = p;
    };
    const stop = event => {
      if (activePointerId !== null && event?.pointerId !== undefined &&
          event.pointerId !== activePointerId) return;
      if (drawing) {
        drawing = false;
        lastPoint = null;
        activePointerId = null;
        try { signatureData = canvas.toDataURL('image/png'); } catch (_) {}
      }
    };

    canvas.style.touchAction = 'none';
    canvas.style.pointerEvents = 'auto';
    canvas.style.userSelect = 'none';
    canvas.style.webkitUserSelect = 'none';
    if (window.PointerEvent) {
      canvas.addEventListener('pointerdown', start, { passive: false });
      canvas.addEventListener('pointermove', move, { passive: false });
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(name => canvas.addEventListener(name, stop));
    } else {
      canvas.addEventListener('mousedown', start);
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', stop);
      canvas.addEventListener('touchstart', event => {
        const touch=event.changedTouches[0];
        if(touch) start({clientX:touch.clientX,clientY:touch.clientY,cancelable:true,preventDefault:()=>event.preventDefault()});
      },{passive:false});
      canvas.addEventListener('touchmove', event => {
        const touch=event.changedTouches[0];
        if(touch) move({clientX:touch.clientX,clientY:touch.clientY,cancelable:true,preventDefault:()=>event.preventDefault()});
      },{passive:false});
      canvas.addEventListener('touchend', stop);
      canvas.addEventListener('touchcancel', stop);
    }
    if ('ResizeObserver' in window) {
      const observer = new ResizeObserver(() => resize());
      observer.observe(canvas);
    } else window.addEventListener('resize', resize);
    requestAnimationFrame(resize);

    canvas.dataset.signed = 'false';
    canvas.clearSignature = () => {
      redrawToken++;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      signatureData = null;
      signed = false;
      drawing = false;
      lastPoint = null;
      activePointerId = null;
      canvas.dataset.signed = 'false';
    };
    Object.defineProperty(canvas, 'hasSignature', { get: () => signed });
    canvas.loadSignature = dataUrl => {
      redrawToken++;
      signatureData = dataUrl || null;
      signed = !!dataUrl;
      drawing = false;
      lastPoint = null;
      activePointerId = null;
      canvas.dataset.signed = String(signed);
      if (!dataUrl) { ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
      requestAnimationFrame(() => {
        resize();
        const token = ++redrawToken;
        drawSaved(signatureData, token);
      });
    };
  }
  let activeSignatureCanvas = null;
  let signatureBackup = null;
  let signatureModal = null;
  let signatureClosing = false;
  let activeSignaturePreview = null;
  function ensureSignatureModal() {
    if (signatureModal) return signatureModal;
    signatureModal = document.createElement('section');
    signatureModal.className = 'signature-fullscreen';
    signatureModal.setAttribute('role','dialog');
    signatureModal.setAttribute('aria-modal','true');
    signatureModal.setAttribute('aria-label','Assinatura digital do trabalhador');
    signatureModal.innerHTML = '<header class="signature-fullscreen-head"><div><strong>Assinatura digital</strong><small>Assine dentro do espaço abaixo</small></div><button type="button" class="signature-close" aria-label="Fechar">×</button></header><div class="signature-fullscreen-canvas"></div><footer class="signature-fullscreen-actions"><button type="button" class="signature-cancel">Cancelar</button><button type="button" class="signature-reset">Limpar</button><button type="button" class="signature-confirm">Confirmar assinatura</button></footer>';
    document.body.appendChild(signatureModal);
    signatureModal.querySelector('.signature-close').addEventListener('click',()=>closeSignature(false));
    signatureModal.querySelector('.signature-cancel').addEventListener('click',()=>closeSignature(false));
    signatureModal.querySelector('.signature-reset').addEventListener('click',()=>activeSignatureCanvas?.clearSignature());
    signatureModal.querySelector('.signature-confirm').addEventListener('click',()=>closeSignature(true));
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&activeSignatureCanvas)closeSignature(false);});
    return signatureModal;
  }
  async function openSignature(canvas) {
    if (signatureClosing) return;
    if (activeSignatureCanvas) return;
    const modal=ensureSignatureModal();
    activeSignatureCanvas=canvas;
    // Guarda a referência antes de mover o canvas para fora do cartão do trabalhador.
    activeSignaturePreview=canvas.closest('.signature-wrap')?.querySelector('.signature-preview') || null;
    signatureBackup=canvas.hasSignature?canvas.toDataURL('image/png'):null;
    modal.classList.remove('force-landscape');
    modal.querySelector('.signature-fullscreen-canvas').appendChild(canvas);
    document.body.classList.add('signature-lock-scroll');
    modal.classList.add('is-open');
    // O fallback visual é aplicado imediatamente; não depende de a API de orientação existir.
    if(window.matchMedia('(orientation: portrait)').matches && !screen.orientation?.lock) {
      modal.classList.add('force-landscape');
    }
    requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));
    try {
      if(modal.requestFullscreen && !document.fullscreenElement) await modal.requestFullscreen();
      if(screen.orientation?.lock) await screen.orientation.lock('landscape');
    } catch (_) {
      if(window.matchMedia('(orientation: portrait)').matches) modal.classList.add('force-landscape');
    }
  }
  async function closeSignature(confirm) {
    if(!activeSignatureCanvas || signatureClosing) return;
    signatureClosing=true;
    const canvas=activeSignatureCanvas;
    let finalSignature=null;
    if(confirm && canvas.hasSignature) {
      try { finalSignature=canvas.toDataURL('image/png'); } catch (_) {}
    } else if(!confirm) finalSignature=signatureBackup;
    const preview=activeSignaturePreview;
    activeSignatureCanvas=null;
    activeSignaturePreview=null;
    signatureBackup=null;
    // Devolve o canvas usando a referência salva na abertura; ele já não tem
    // .signature-wrap como ancestral enquanto está dentro do modal.
    if(preview) preview.appendChild(canvas);
    signatureModal.classList.remove('is-open','force-landscape');
    document.body.classList.remove('signature-lock-scroll');
    try { if(screen.orientation?.unlock) screen.orientation.unlock(); } catch (_) {}
    try { if(document.fullscreenElement) await document.exitFullscreen(); } catch (_) {}
    // Aguarda o canvas voltar ao tamanho da prévia e restaura a imagem persistida.
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    if(finalSignature) canvas.loadSignature(finalSignature);
    else canvas.clearSignature();
    signatureClosing=false;
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
  const checklistByEquipment = {
    'PTA': [
      ['pta_inspecao','A PTA passou por inspeção pré-uso e não apresenta danos, vazamentos ou falhas?'],
      ['pta_operador','O operador está capacitado, autorizado e familiarizado com o modelo da plataforma?'],
      ['pta_solo','O piso está firme, nivelado e suporta a carga e as condições de operação?'],
      ['pta_area','Foram avaliados obstáculos, redes elétricas, tráfego e riscos de aprisionamento/esmagamento?'],
      ['pta_cinto','O trabalhador utiliza o sistema de proteção contra quedas no ponto indicado pelo fabricante?'],
      ['pta_capacidade','A capacidade de pessoas, ferramentas e materiais não será ultrapassada?'],
      ['pta_controle','Os comandos de solo e de emergência foram testados e há pessoa preparada para operação de emergência?']
    ],
    'Escadas': [
      ['escada_estado','A escada está íntegra, sem degraus soltos, trincas, deformações ou improvisos?'],
      ['escada_apoio','A escada está apoiada em superfície firme, estável e posicionada corretamente?'],
      ['escada_fixacao','A escada está fixada ou estabilizada contra escorregamento e deslocamento?'],
      ['escada_eletrica','Foi avaliado o risco elétrico e selecionada escada de material compatível quando necessário?'],
      ['escada_uso','A escada é adequada à tarefa, sem sobrealcance ou esforço que comprometa o equilíbrio?'],
      ['escada_inspecao','A escada está identificada, dentro das condições de uso e foi inspecionada antes da atividade?'],
      ['escada_area','A área inferior está protegida contra circulação de pessoas e impacto de portas/veículos?']
    ],
    'Andaimes': [
      ['andaime_montagem','O andaime foi montado, alterado e liberado por trabalhador qualificado/autorizado?'],
      ['andaime_base','A base está firme, nivelada e com sapatas e apoios adequados?'],
      ['andaime_piso','Os pisos de trabalho estão completos, fixados, nivelados e sem aberturas perigosas?'],
      ['andaime_guarda','Há guarda-corpo, rodapé e proteção contra quedas conforme a configuração aplicável?'],
      ['andaime_acesso','O acesso ao andaime é seguro, por meio apropriado e sem escalada pela estrutura?'],
      ['andaime_inspecao','O andaime foi inspecionado, identificado como liberado e está sem alterações não autorizadas?'],
      ['andaime_carga','A carga sobre plataformas respeita os limites previstos e os materiais estão organizados?'],
      ['andaime_estabilidade','A amarração, contraventamento e estabilidade estão adequados à altura e ao local?']
    ]
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
    const equipment=$$('input[name="equipamentos"]:checked').map(el=>el.value);
    const items=[...(epiByWork[work]||epiByWork['Outros'])];
    if(work==='Trabalho em altura'||work==='Telhados'||equipment.includes('PTA')||equipment.includes('Andaimes')){
      if(!items.includes('Capacete com jugular'))items.push('Capacete com jugular');
      if(!items.includes('Sistema individual de proteção contra quedas compatível'))items.push('Sistema individual de proteção contra quedas compatível');
    }
    if(equipment.includes('Escadas')&&!items.includes('Calçado com solado aderente'))items.push('Calçado com solado aderente');
    return [...new Set(items)];
  }
  function renderActivityEpis(){
    const host=$('#activityEpiList');if(!host)return;
    const previous=new Set($$('input[name="episAtividade"]:checked',host).map(el=>el.value));
    const seen=new Set(JSON.parse(host.dataset.seen||'[]'));
    const items=selectedActivityEpis();
    host.innerHTML=items.map(item=>{
      const checked=previous.has(item)||!seen.has(item);
      return '<label class="activity-epi-option"><input type="checkbox" name="episAtividade" value="'+escapeHtml(item)+'" '+(checked?'checked':'')+'><span>'+escapeHtml(item)+'</span></label>';
    }).join('');
    host.dataset.seen=JSON.stringify([...seen,...items]);
    renderWorkersEpis();
  }
  function renderWorkersEpis(){
    const items=$$('input[name="episAtividade"]:checked').map(el=>el.value);
    $$('.worker-card').forEach(card=>{
      const host=$('.worker-epi-list',card);if(!host)return;
      const previous={};$$('input[type="radio"]',host).forEach(el=>{if(el.checked)previous[el.name]=el.value;});
      host.innerHTML=items.map((item,i)=>{const key='worker_epi_'+item.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'_');const value=previous[key]||'';return '<div class="worker-epi-row"><strong>'+escapeHtml(item)+'</strong><div class="worker-epi-status"><label><input type="radio" name="'+key+'" value="adequado" '+(value==='adequado'?'checked':'')+' required> Conferido / adequado</label><label><input type="radio" name="'+key+'" value="pendente" '+(value==='pendente'?'checked':'')+' required> Ausente / inadequado</label></div></div>';}).join('');
    });
  }
  $$('input[name="equipamentos"]').forEach(el=>el.addEventListener('change',()=>{renderChecklist();renderActivityEpis();}));
  $('select[name="tipoTrabalho"]').addEventListener('change',()=>{renderChecklist();renderActivityEpis();});
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
    const activityEpis=$$('input[name="episAtividade"]:checked').map(el=>el.value);
    if(!activityEpis.length){toast('Defina os EPIs necessários para a atividade.');$('#activityEpiList')?.scrollIntoView({behavior:'smooth',block:'center'});return;}
    const epiPending=workerCards.some(card=>activityEpis.some((epi,i)=>{const key='worker_epi_'+epi.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'_');const selected=$('input[name="'+key+'"]:checked',card);return !selected||selected.value!=='adequado';}));
    if(epiPending){toast('Todos os EPIs devem estar conferidos e adequados para cada trabalhador.');$('.worker-epi-section')?.scrollIntoView({behavior:'smooth',block:'center'});return;}
    const unanswered=checklist.filter(item=>!item.status);
    const unjustified=checklist.filter(item=>item.status==='nao_conforme'&&!item.justificativa);
    if(unanswered.length){toast(`Responda todos os itens do checklist (${unanswered.length} pendente(s)).`);$('#safetyChecklist [data-check-item] input:not(:checked)')?.focus();return;}
    if(unjustified.length){toast('Descreva todas as não conformidades antes de salvar.');$('[data-justification]',$('#safetyChecklist [data-check-item="'+unjustified[0].key+'"]'))?.focus();return;}
    const unsigned=workerCards.find(card=>!$('.signature-pad',card).hasSignature);
    if(unsigned){toast('A assinatura de todos os trabalhadores é obrigatória.');$('.signature-pad',unsigned).scrollIntoView({behavior:'smooth',block:'center'});return;}
    const people=workerCards.map(card=>({
      nome:$('.worker-name',card).value.trim(),
      pressaoSistolica:$('.worker-sys',card).value,
      pressaoDiastolica:$('.worker-dia',card).value,
      assinatura:$('.signature-pad',card).hasSignature?$('.signature-pad',card).toDataURL('image/png'):null
    }));
    const data=Object.fromEntries(new FormData(form).entries());
    const record={id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),criadoEm:new Date().toISOString(),status:'Aguardando liberação',...data,equipamentos:$$('input[name="equipamentos"]:checked',form).map(el=>el.value),episAtividade:activityEpis,checklist,trabalhadores:people.map((person,index)=>({...person,episConferidos:activityEpis.map((epi,i)=>({epi,status:$('input[name="worker_epi_'+epi.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'_')+'"]:checked',workerCards[index])?.value||'pendente'}))}))};
    const records=readRecords();records.unshift(record);saveRecords(records);
    form.reset();$('#workersList').innerHTML='';workers=0;addWorker();
    toast('PT cadastrada e enviada para aguardando liberação.');navigate('aguardando');
  });

  function recordCard(record) {
    return `<article class="record-item"><div><strong>${escapeHtml(record.local || 'Local não informado')}</strong><small>${escapeHtml(record.tipoTrabalho || 'Tipo não informado')} · ${escapeHtml(record.responsavelExecucao || 'Responsável não informado')}</small><small>Início: ${formatDate(record.dataInicio)} · ${(record.trabalhadores||[]).length} trabalhador(es)</small></div><div class="record-meta"><span>${escapeHtml(record.status)}</span><div class="record-actions"><button data-view="${escapeHtml(record.id)}">Ver detalhes</button><button class="delete" data-delete="${escapeHtml(record.id)}">Excluir</button></div></div></article>`;
  }
  function renderHistory() {
    const all=readRecords();
    const count=status=>all.filter(r=>r.status===status).length;
    $('#historyTotal').textContent=all.length;
    $('#historyPending').textContent=count('Aguardando liberação');
    $('#historyRunning').textContent=count('Em andamento');
    $('#historyClosed').textContent=count('Encerrada');
    $$('[data-history-filter]').forEach(card=>{
      const selected=card.dataset.historyFilter===historyStatusFilter;
      card.classList.toggle('metric-selected',selected);
      card.setAttribute('aria-pressed',String(selected));
    });
    const term=($('#historySearch')?.value||'').trim().toLocaleLowerCase('pt-BR');
    const filtered=all.filter(r=>{
      const matchesStatus=historyStatusFilter==='todos' ||
        (historyStatusFilter==='andamento' && r.status==='Em andamento') ||
        (historyStatusFilter==='encerradas' && r.status==='Encerrada') ||
        (historyStatusFilter==='aguardando' && r.status==='Aguardando liberação');
      const names=(r.trabalhadores||[]).map(p=>p.nome||'').join(' ');
      const searchable=[r.local,r.servico,r.responsavelExecucao,r.responsavelArea,r.seguranca,r.tipoTrabalho,r.status,names].join(' ').toLocaleLowerCase('pt-BR');
      return matchesStatus && searchable.includes(term);
    }).sort((a,b)=>new Date(b.criadoEm||b.dataInicio||0)-new Date(a.criadoEm||a.dataInicio||0));
    const labels={todos:'todos os status',aguardando:'aguardando liberação',andamento:'em execução',encerradas:'encerradas'};
    $('#historyCount').textContent=filtered.length+' de '+all.length+' PT(s) · '+(labels[historyStatusFilter]||labels.todos);
    $('#historyList').innerHTML=filtered.length?filtered.map(recordCard).join(''):'<div class="empty-state"><strong>Nenhuma PT encontrada.</strong><br>Altere o filtro ou a busca para consultar outros registros.</div>';
  }
  function renderDashboard() {
    const records=readRecords();
    const active=records.filter(r=>r.status==='Em andamento');
    $('#totalPts').textContent=records.length;$('#activePts').textContent=active.length;$('#closedPts').textContent=records.filter(r=>r.status==='Encerrada').length;
    $('#recentList').innerHTML=records.length?records.slice(0,4).map(recordCard).join(''):'<div class="empty-state">Nenhuma PT cadastrada. Comece criando uma nova permissão.</div>';
  }
  function bindRecordCards(containerSelector) {
    $$(containerSelector+' [data-open-record]').forEach(card=>{
      if(card.dataset.clickBound==='true')return;
      card.dataset.clickBound='true';
      const open=()=>{
        const record=readRecords().find(item=>item.id===card.dataset.openRecord);
        if(record)showDetails(record);
      };
      card.addEventListener('click',event=>{
        if(event.target.closest('button,a,input,select,textarea,label'))return;
        open();
      });
      card.addEventListener('keydown',event=>{
        if(event.key==='Enter'||event.key===' '){event.preventDefault();open();}
      });
    });
  }
  function renderPending() {
    $$('[data-metric-filter^="pending:"]').forEach(card=>{const active=card.dataset.metricFilter==='pending:'+pendingMetricFilter;card.classList.toggle('metric-selected',active);card.setAttribute('aria-pressed',String(active));});
    const pending=readRecords().filter(r=>r.status==='Aguardando liberação');
    const term=($('#pendingSearch')?.value||'').trim().toLocaleLowerCase('pt-BR');
    const workers=pending.reduce((total,r)=>total+(r.trabalhadores||[]).length,0);
    const issues=pending.filter(r=>(r.checklist||[]).some(item=>item.status==='nao_conforme')).length;
    $('#pendingTotal').textContent=pending.length;
    $('#pendingIssues').textContent=issues;
    $('#pendingWorkers').textContent=workers;
    const metricFiltered=pending.filter(r=>pendingMetricFilter==='issues'?(r.checklist||[]).some(item=>item.status==='nao_conforme'):pendingMetricFilter==='workers'?(r.trabalhadores||[]).length>0:true);
    const filtered=metricFiltered.filter(r=>[r.local,r.servico,r.tipoTrabalho,r.responsavelExecucao,r.responsavelArea,r.seguranca,...(r.trabalhadores||[]).map(p=>p.nome)].join(' ').toLocaleLowerCase('pt-BR').includes(term));
    const pendingFilterLabel=pendingMetricFilter==='issues'?'com não conformidades':pendingMetricFilter==='workers'?'com trabalhadores':'';
    $('#pendingCount').innerHTML=filtered.length+' de '+metricFiltered.length+' permissão(ões)'+(pendingMetricFilter!=='all'?' · '+pendingFilterLabel+' <button type="button" class="metric-clear" data-clear-metric="pending">Limpar filtro</button>':'');
    $('#pendingList').innerHTML=filtered.length?filtered.map(r=>{
      const nonconformities=(r.checklist||[]).filter(item=>item.status==='nao_conforme');
      const unanswered=(r.checklist||[]).filter(item=>!item.status);
      return `<article class="record-item pending-record record-clickable" data-open-record="${escapeHtml(r.id)}" tabindex="0" role="button" aria-label="Abrir detalhes da permissão">
        <div class="pending-record-main">
          <div class="pending-record-top"><span class="pending-status"><i></i> Aguardando liberação</span>${nonconformities.length?'<span class="pending-alert">'+nonconformities.length+' não conformidade(s)</span>':''}</div>
          <strong>${escapeHtml(r.local||'Local não informado')}</strong>
          <small>${escapeHtml(r.tipoTrabalho||'Atividade não informada')} · ${escapeHtml(r.responsavelExecucao||'Responsável não informado')}</small>
          <div class="pending-details"><span><b>Solicitada em</b>${formatDate(r.criadoEm)}</span><span><b>Início previsto</b>${formatDate(r.dataInicio)}</span><span><b>Equipe</b>${(r.trabalhadores||[]).length} trabalhador(es)</span></div>
          <small class="pending-service">${escapeHtml(r.servico||'Descrição do serviço não informada')}</small>
          ${nonconformities.length?'<div class="pending-warning">Atenção: há itens do checklist marcados como não conformes. Avalie as justificativas e as medidas corretivas antes de liberar.</div>':''}
          ${unanswered.length?'<div class="pending-warning">Há '+unanswered.length+' item(ns) do checklist sem resposta. Revise os dados antes da liberação.</div>':''}
        </div>
        <div class="pending-actions"><button class="pending-view" type="button" data-view="${escapeHtml(r.id)}">Analisar PT</button><button class="pending-release" type="button" data-release="${escapeHtml(r.id)}">Liberar PT <span>→</span></button></div>
      </article>`;
    }).join(''):'<div class="empty-state">'+(pending.length?'Nenhuma PT corresponde à sua busca.':'Nenhuma PT aguardando liberação. As novas permissões cadastradas aparecerão aqui para análise.')+'</div>';
    bindRecordCards('#pendingList');
  }
  function renderRunning() {
    $$('[data-metric-filter^="running:"]').forEach(card=>{const selected=card.dataset.metricFilter==='running:'+runningMetricFilter;card.classList.toggle('metric-selected',selected);card.setAttribute('aria-pressed',String(selected));});
    const active=readRecords().filter(r=>r.status==='Em andamento');
    const term=($('#runningSearch')?.value||'').trim().toLocaleLowerCase('pt-BR');
    const now=new Date();
    const overdue=active.filter(r=>r.dataFim && new Date(r.dataFim)<now);
    const workers=active.reduce((total,r)=>total+(r.trabalhadores||[]).length,0);
    $('#runningTotal').textContent=active.length;
    $('#runningOverdue').textContent=overdue.length;
    $('#runningWorkers').textContent=workers;
    const metricFiltered=active.filter(r=>runningMetricFilter==='overdue'?(r.dataFim && new Date(r.dataFim)<now):runningMetricFilter==='workers'?(r.trabalhadores||[]).length>0:true);
    const filtered=metricFiltered.filter(r=>[r.local,r.servico,r.tipoTrabalho,r.responsavelExecucao,r.responsavelArea,r.seguranca,...(r.trabalhadores||[]).map(p=>p.nome)].join(' ').toLocaleLowerCase('pt-BR').includes(term));
    const runningFilterLabel=runningMetricFilter==='overdue'?'com prazo vencido':runningMetricFilter==='workers'?'com trabalhadores':'';
    $('#runningCount').innerHTML=filtered.length+' de '+metricFiltered.length+' permissão(ões)'+(runningMetricFilter!=='all'?' · '+runningFilterLabel+' <button type="button" class="metric-clear" data-clear-metric="running">Limpar filtro</button>':'');
    $('#runningList').innerHTML=filtered.length?filtered.map(r=>{
      const isOverdue=r.dataFim && new Date(r.dataFim)<now;
      const start=formatDate(r.dataInicio);
      const end=formatDate(r.dataFim);
      return `<article class="record-item running-record record-clickable" data-open-record="${escapeHtml(r.id)}" tabindex="0" role="button" aria-label="Abrir detalhes da permissão">
        <div class="running-record-main"><div class="running-record-top"><span class="running-status"><i></i> Em andamento</span>${isOverdue?'<span class="running-alert">Prazo previsto vencido</span>':''}</div>
          <strong>${escapeHtml(r.local||'Local não informado')}</strong>
          <small>${escapeHtml(r.tipoTrabalho||'Atividade não informada')} · ${escapeHtml(r.responsavelExecucao||'Responsável não informado')}</small>
          <div class="running-details"><span><b>Início</b>${start}</span><span><b>Término previsto</b>${end}</span><span><b>Equipe</b>${(r.trabalhadores||[]).length} trabalhador(es)</span></div>
          <small class="running-service">${escapeHtml(r.servico||'Descrição do serviço não informada')}</small>
        </div><div class="record-meta running-actions"><button class="running-view" type="button" data-view="${escapeHtml(r.id)}">Ver detalhes <span>→</span></button><button class="running-close" type="button" data-close="${escapeHtml(r.id)}">Encerrar PT</button></div>
      </article>`;
    }).join(''):'<div class="empty-state">'+(active.length?'Nenhuma PT corresponde à sua busca.':'Nenhuma PT em andamento no momento. As permissões salvas como em andamento aparecerão aqui.')+'</div>';
    bindRecordCards('#runningList');
  }
  document.addEventListener('click',event=>{
    const historyMetric=event.target.closest('[data-history-filter]');
    if(historyMetric){historyStatusFilter=historyMetric.dataset.historyFilter;renderHistory();return;}
    const metric=event.target.closest('[data-metric-filter]');
    if(metric){
      if(metric.dataset.metricFilter.startsWith('running:')){runningMetricFilter=metric.dataset.metricFilter.split(':')[1];$('#runningSearch').value='';renderRunning();}
      if(metric.dataset.metricFilter.startsWith('pending:')){pendingMetricFilter=metric.dataset.metricFilter.split(':')[1];$('#pendingSearch').value='';renderPending();}
      return;
    }
    const clear=event.target.closest('[data-clear-metric]');
    if(clear){if(clear.dataset.clearMetric==='running'){runningMetricFilter='all';renderRunning();}else{pendingMetricFilter='all';renderPending();}}
  });
  $('#historySearch').addEventListener('input',renderHistory);
  $('#historyPrint')?.addEventListener('click',()=>window.print());
  $('#runningSearch').addEventListener('input',renderRunning);
  $('#pendingSearch').addEventListener('input',renderPending);
  document.addEventListener('click',event=>{
    const view=event.target.closest('[data-view]');
    if(view){const record=readRecords().find(r=>r.id===view.dataset.view);if(record)showDetails(record);}
    const release=event.target.closest('[data-release]');
    if(release){
      const records=readRecords();
      const record=records.find(r=>r.id===release.dataset.release);
      if(!record || record.status!=='Aguardando liberação')return;
      const issues=(record.checklist||[]).filter(item=>item.status==='nao_conforme');
      const unanswered=(record.checklist||[]).filter(item=>!item.status);
      const warning=issues.length?'\\n\\nAtenção: existem '+issues.length+' não conformidade(s) no checklist. Confirme que as medidas corretivas foram avaliadas e controladas.':'';
      const pending=unanswered.length?'\\n\\nExistem '+unanswered.length+' item(ns) sem resposta no checklist.':'';
      if(!confirm('Confirma a liberação desta Permissão de Trabalho para início da atividade?'+warning+pending+'\\n\\nA PT será movida para “Em andamento”.'))return;
      record.status='Em andamento';record.liberadoEm=new Date().toISOString();
      saveRecords(records);renderPending();renderRunning();renderDashboard();
      toast('PT liberada e movida para Em andamento.');
    }
    const close=event.target.closest('[data-close]');
    if(close){
      const records=readRecords();
      const record=records.find(r=>r.id===close.dataset.close);
      if(!record || record.status!=='Em andamento')return;
      if(!confirm('Confirma o encerramento desta Permissão de Trabalho? Ela será registrada no Histórico de PTs.'))return;
      record.status='Encerrada';record.encerradaEm=new Date().toISOString();
      saveRecords(records);renderRunning();renderHistory();renderDashboard();
      toast('PT encerrada e registrada no histórico.');return;
    }
    const del=event.target.closest('[data-delete]');
    if(del){if(!confirm('Deseja realmente excluir esta Permissão de Trabalho?'))return;saveRecords(readRecords().filter(r=>r.id!==del.dataset.delete));renderHistory();renderDashboard();toast('Registro excluído.');return;}
  });
  function showDetails(r) {
    const people=(r.trabalhadores||[]).map(p=>`• ${escapeHtml(p.nome)} — PA: ${escapeHtml(p.pressaoSistolica||'—')}/${escapeHtml(p.pressaoDiastolica||'—')} mmHg`).join('\n');
    const details=[`PT — ${r.local}`,`Tipo: ${r.tipoTrabalho}`,`Serviço: ${r.servico}`,`Início: ${formatDate(r.dataInicio)}`,`Término: ${formatDate(r.dataFim)}`,`Equipamentos: ${(r.equipamentos||[]).join(', ')||'Não informado'}`,`Responsável execução: ${r.responsavelExecucao}`,`Responsável área: ${r.responsavelArea}`,`Segurança do Trabalho: ${r.seguranca}`,`Trabalhadores:\n${people||'Não informado'}`,`EPIs necessários:\n${(r.episAtividade||[]).join(', ')||'Não registrado'}`,`EPIs por trabalhador:\n${(r.trabalhadores||[]).map(p=>p.nome+': '+(p.episConferidos||[]).map(e=>e.epi+' — '+(e.status==='adequado'?'Conferido':'Pendente')).join('; ')).join('\n')}`,`Checklist de segurança:\n${(r.checklist||[]).map((item,i)=>`${i+1}. ${item.pergunta} — ${item.status==='conforme'?'Conforme':item.status==='nao_conforme'?'Não conforme':'Não se aplica'}${item.justificativa?' | Pendência: '+item.justificativa:''}`).join('\n')||'Não registrado'}`,`Observações: ${r.observacoes||'—'}`].join('\n\n');
    alert(details);
  }

  const APR_KEY='tatiSafe.aprs.v1';
  const readAprs=()=>{try{return JSON.parse(localStorage.getItem(APR_KEY)||'[]');}catch{return [];}};
  const saveAprs=a=>localStorage.setItem(APR_KEY,JSON.stringify(a));
  function renderAprPtOptions(selected=''){
    const el=$('#aprPtSelect');el.innerHTML='<option value="">Sem vínculo com uma PT</option>'+readRecords().map(p=>'<option value="'+escapeHtml(p.id)+'">'+escapeHtml((p.local||'Local não informado')+' · '+(p.tipoTrabalho||'PT'))+'</option>').join('');el.value=selected;
  }
  function riskRow(r={}){
    const levels=v=>[1,2,3,4,5].map(n=>'<option value="'+n+'" '+(String(v)===String(n)?'selected':'')+'>'+n+'</option>').join('');
    const field=(key,label,val,required=false)=>'<label class="field">'+label+'<input data-risk="'+key+'" value="'+escapeHtml(val||'')+'" '+(required?'required':'')+'></label>';
    const select=(key,label,val)=>'<label class="field">'+label+'<select data-risk="'+key+'" '+(key==='probabilidade'||key==='severidade'?'required':'')+'><option value="">Selecione</option>'+levels(val)+'</select></label>';
    return '<article class="apr-risk-card"><div class="apr-risk-card-head"><strong>Etapa de risco</strong><button type="button" data-remove-risk class="apr-risk-remove">Remover</button></div><div class="form-grid">'+field('etapa','Etapa da atividade',r.etapa,true)+field('perigo','Perigo identificado',r.perigo,true)+field('risco','Risco / evento indesejado',r.risco,true)+field('consequencia','Possíveis consequências',r.consequencia)+field('controle','Medidas de prevenção / controle',r.controle,true)+select('probabilidade','Probabilidade inicial',r.probabilidade)+select('severidade','Severidade inicial',r.severidade)+select('probResidual','Probabilidade residual',r.probResidual)+select('sevResidual','Severidade residual',r.sevResidual)+'<div class="apr-risk-score"><span>Risco inicial</span><strong data-score>—</strong><small>Probabilidade × severidade</small></div><div class="apr-risk-score residual"><span>Risco residual</span><strong data-residual>—</strong><small>Após controles</small></div></div></article>';
  }
  function updateRiskScores(){
    $$('#aprRiskList .apr-risk-card').forEach((card,i)=>{
      card.querySelector('.apr-risk-card-head strong').textContent='Etapa '+(i+1);
      const v=k=>Number($('[data-risk="'+k+'"]',card)?.value||0),label=n=>!n?'—':n<=4?'Baixo':n<=9?'Moderado':n<=16?'Alto':'Crítico';
      const a=v('probabilidade')*v('severidade'),b=v('probResidual')*v('sevResidual');
      $('[data-score]',card).textContent=a?a+' · '+label(a):'—';$('[data-residual]',card).textContent=b?b+' · '+label(b):'—';
    });
  }
  function addRisk(r){$('#aprRiskList').insertAdjacentHTML('beforeend',riskRow(r||{}));updateRiskScores();}
  function renderAprs(){
    const all=readAprs(),term=$('#aprSearch').value.trim().toLocaleLowerCase('pt-BR'),status=$('#aprStatusFilter').value;
    $('#aprTotal').textContent=all.length;$('#aprDraft').textContent=all.filter(a=>a.status==='Em elaboração').length;$('#aprDone').textContent=all.filter(a=>a.status==='Concluída').length;
    const list=all.filter(a=>(status==='todas'||a.status===status)&&[a.atividade,a.local,a.responsavel,a.descricao].join(' ').toLocaleLowerCase('pt-BR').includes(term)).sort((a,b)=>(b.atualizadoEm||'').localeCompare(a.atualizadoEm||''));
    $('#aprCount').textContent=list.length+' de '+all.length+' APR(s)';
    $('#aprList').innerHTML=list.length?list.map(a=>'<article class="record-item apr-record"><div class="apr-record-main"><strong>'+escapeHtml(a.atividade)+'</strong><small>'+escapeHtml(a.local)+' · '+escapeHtml(a.responsavel)+'</small><div class="apr-record-meta"><span>Data: '+escapeHtml(a.data)+'</span><span>'+(a.riscos||[]).length+' etapa(s) de risco</span></div></div><div class="record-meta"><span class="apr-status '+(a.status==='Concluída'?'done':'draft')+'">'+escapeHtml(a.status)+'</span><div class="record-actions"><button type="button" data-apr-view="'+escapeHtml(a.id)+'">Detalhes</button><button type="button" data-apr-edit="'+escapeHtml(a.id)+'">Editar</button><button type="button" class="delete" data-apr-delete="'+escapeHtml(a.id)+'">Excluir</button></div></div></article>').join(''):'<div class="empty-state">Nenhuma APR encontrada. Altere a busca ou cadastre uma nova análise.</div>';
  }
  function openApr(a=null){
    const form=$('#aprForm');form.reset();$('#aprRiskList').innerHTML='';
    $('#aprEditorTitle').textContent=a?'Editar Análise Preliminar de Risco':'Nova Análise Preliminar de Risco';
    if(a){Object.entries(a).forEach(([k,v])=>{if(form.elements.namedItem(k)&&typeof v==='string')form.elements.namedItem(k).value=v;});renderAprPtOptions(a.ptId||'');(a.riscos||[]).forEach(addRisk);}
    else{renderAprPtOptions();form.elements.namedItem('data').value=new Date().toISOString().slice(0,10);form.elements.namedItem('status').value='Em elaboração';addRisk();}
    if(!$('#aprRiskList').children.length)addRisk();
    $('#aprEditor').hidden=false;$('#aprEditor').scrollIntoView({behavior:'smooth',block:'start'});
  }
  function closeApr(){$('#aprEditor').hidden=true;$('#aprForm').reset();$('#aprRiskList').innerHTML='';}
  function showApr(a){
    const risks=(a.riscos||[]).map((r,i)=>(i+1)+'. '+r.etapa+'\nPerigo: '+r.perigo+'\nRisco: '+r.risco+'\nConsequência: '+(r.consequencia||'—')+'\nAvaliação inicial: '+r.probabilidade+' × '+r.severidade+'\nControles: '+r.controle+'\nAvaliação residual: '+(r.probResidual||'—')+' × '+(r.sevResidual||'—')).join('\n\n');
    alert('ANÁLISE PRELIMINAR DE RISCO\n\nAtividade: '+a.atividade+'\nLocal: '+a.local+'\nData: '+a.data+'\nResponsável: '+a.responsavel+'\nSituação: '+a.status+'\n\nDescrição:\n'+a.descricao+'\n\nETAPAS E CONTROLES\n'+risks+'\n\nEPIs / EPCs: '+(a.protecao||'—')+'\nPlano de emergência: '+(a.emergencia||'—')+'\nObservações: '+(a.observacoes||'—'));
  }
  $('#newAprButton').addEventListener('click',()=>openApr());
  $('#cancelApr').addEventListener('click',closeApr);
  $('#addAprRisk').addEventListener('click',()=>addRisk());
  $('#aprRiskList').addEventListener('click',e=>{if(e.target.closest('[data-remove-risk]')){e.target.closest('.apr-risk-card').remove();if(!$('#aprRiskList').children.length)addRisk();updateRiskScores();}});
  $('#aprRiskList').addEventListener('input',e=>{if(e.target.matches('[data-risk]'))updateRiskScores();});
  $('#aprRiskList').addEventListener('change',e=>{if(e.target.matches('[data-risk]'))updateRiskScores();});
  $('#aprForm').addEventListener('submit',e=>{
    e.preventDefault();const form=e.currentTarget;if(!form.reportValidity())return;
    const riscos=$$('#aprRiskList .apr-risk-card').map(card=>Object.fromEntries($$('[data-risk]',card).map(el=>[el.dataset.risk,el.value.trim()])));
    if(!riscos.length||riscos.some(r=>!r.etapa||!r.perigo||!r.risco||!r.controle||!r.probabilidade||!r.severidade)){toast('Complete os campos obrigatórios das etapas de risco.');return;}
    const data=Object.fromEntries(new FormData(form).entries()),all=readAprs(),id=data.id||((crypto.randomUUID&&crypto.randomUUID())||String(Date.now()));
    const old=all.find(a=>a.id===id),record={...data,id,riscos,criadoEm:old?.criadoEm||new Date().toISOString(),atualizadoEm:new Date().toISOString()};
    const i=all.findIndex(a=>a.id===id);if(i>=0)all[i]=record;else all.unshift(record);saveAprs(all);closeApr();renderAprs();toast(i>=0?'APR atualizada.':'APR cadastrada com sucesso.');
  });
  $('#aprSearch').addEventListener('input',renderAprs);$('#aprStatusFilter').addEventListener('change',renderAprs);
  $('#aprList').addEventListener('click',e=>{
    const v=e.target.closest('[data-apr-view]');if(v){const a=readAprs().find(x=>x.id===v.dataset.aprView);if(a)showApr(a);return;}
    const ed=e.target.closest('[data-apr-edit]');if(ed){const a=readAprs().find(x=>x.id===ed.dataset.aprEdit);if(a)openApr(a);return;}
    const d=e.target.closest('[data-apr-delete]');if(d){if(!confirm('Deseja excluir esta APR?'))return;saveAprs(readAprs().filter(x=>x.id!==d.dataset.aprDelete));renderAprs();toast('APR excluída.');}
  });

  const SAFETY_CHECK_KEY='tatiSafe.checklists.v1';
  const readSafetyChecks=()=>{try{return JSON.parse(localStorage.getItem(SAFETY_CHECK_KEY)||'[]');}catch{return [];}};
  const saveSafetyChecks=list=>localStorage.setItem(SAFETY_CHECK_KEY,JSON.stringify(list));
  function safetyCheckItems(){
    const work=$('#safetyCheckWork').value, equipment=$('input[name="equipamentos"]:checked',$('#safetyCheckForm')).map(x=>x.value);
    const all=[...checklistBase,...(checklistByWork[work]||[]),...equipment.flatMap(x=>checklistByEquipment[x]||[])], seen=new Set();
    return all.filter(item=>{if(seen.has(item[0]))return false;seen.add(item[0]);return true;});
  }
  function renderSafetyCheckItems(previous=[]){
    const host=$('#safetyCheckItems'), work=$('#safetyCheckWork').value;
    if(!work){host.innerHTML='<div class="empty-state">Selecione o tipo de trabalho para visualizar os itens de verificação.</div>';updateSafetyCheckSummary();return;}
    const old=new Map(previous.map(x=>[x.key,x]));
    host.innerHTML=safetyCheckItems().map((item,index)=>{const v=old.get(item[0])||{}, opts=[['conforme','Conforme','ok'],['nao_conforme','Não conforme','no'],['na','Não se aplica','na']];return '<article class="check-item" data-safety-check-item="'+escapeHtml(item[0])+'"><div class="check-question"><span class="check-number">'+String(index+1).padStart(2,'0')+'</span><strong>'+escapeHtml(item[1])+'</strong></div><div class="check-options">'+opts.map(o=>'<label class="check-option '+o[2]+'"><input type="radio" name="safety_'+escapeHtml(item[0])+'" value="'+o[0]+'" '+(v.status===o[0]?'checked':'')+'><span>'+o[1]+'</span></label>').join('')+'</div><label class="check-justification" '+(v.status==='nao_conforme'?'':'hidden')+'>Descreva a não conformidade e a ação necessária<textarea rows="2" data-safety-justification="'+escapeHtml(item[0])+'" placeholder="Descreva a pendência encontrada e a ação corretiva...">'+escapeHtml(v.justificativa||'')+'</textarea></label></article>';}).join('');
    updateSafetyCheckSummary();
  }
  function collectSafetyCheckItems(){return $('#safetyCheckItems [data-safety-check-item]').map(card=>({key:card.dataset.safetyCheckItem,pergunta:$('.check-question strong',card)?.textContent||'',status:$('input[type="radio"]:checked',card)?.value||'',justificativa:$('[data-safety-justification]',card)?.value.trim()||''}));}
  function updateSafetyCheckSummary(){const host=$('#safetyCheckSummary');if(!host)return;const items=collectSafetyCheckItems(),answered=items.filter(x=>x.status).length,issues=items.filter(x=>x.status==='nao_conforme').length;host.textContent=items.length?answered+' de '+items.length+' itens respondidos · '+issues+' não conformidade(s) · '+(items.length-answered)+' pendente(s)':'Selecione o tipo de trabalho para carregar os itens.';}
  function renderSafetyCheckPtOptions(selected=''){const el=$('#safetyCheckPt');el.innerHTML='<option value="">Sem vínculo com uma PT</option>'+readRecords().map(p=>'<option value="'+escapeHtml(p.id)+'">'+escapeHtml((p.local||'Local não informado')+' · '+(p.tipoTrabalho||'PT'))+'</option>').join('');el.value=selected;}
  function renderSafetyChecks(){const all=readSafetyChecks(),term=$('#safetyCheckSearch').value.trim().toLocaleLowerCase('pt-BR'),status=$('#safetyCheckStatus').value;$('#safetyCheckTotal').textContent=all.length;$('#safetyCheckDraft').textContent=all.filter(x=>x.status==='Em preenchimento').length;$('#safetyCheckDone').textContent=all.filter(x=>x.status==='Concluído').length;$('#safetyCheckIssues').textContent=all.filter(x=>(x.itens||[]).some(i=>i.status==='nao_conforme')).length;const list=all.filter(x=>(status==='todos'||x.status===status)&&[x.tipoTrabalho,x.local,x.responsavel].join(' ').toLocaleLowerCase('pt-BR').includes(term)).sort((a,b)=>(b.atualizadoEm||'').localeCompare(a.atualizadoEm||''));$('#safetyCheckCount').textContent=list.length+' de '+all.length+' checklist(s)';$('#safetyCheckList').innerHTML=list.length?list.map(x=>'<article class="record-item safety-check-record"><div class="safety-check-record-main"><strong>'+escapeHtml(x.tipoTrabalho)+'</strong><small>'+escapeHtml(x.local)+' · '+escapeHtml(x.responsavel)+'</small><div class="apr-record-meta"><span>Data: '+escapeHtml(x.data)+'</span><span>'+(x.itens||[]).filter(i=>i.status==='nao_conforme').length+' não conformidade(s)</span><span>'+(x.itens||[]).length+' itens</span></div></div><div class="record-meta"><span class="apr-status '+(x.status==='Concluído'?'done':'draft')+'">'+escapeHtml(x.status)+'</span><div class="record-actions"><button type="button" data-safety-view="'+escapeHtml(x.id)+'">Detalhes</button><button type="button" data-safety-edit="'+escapeHtml(x.id)+'">Editar</button><button type="button" class="delete" data-safety-delete="'+escapeHtml(x.id)+'">Excluir</button></div></div></article>').join(''):'<div class="empty-state">Nenhum checklist encontrado. Altere a busca ou cadastre uma nova inspeção.</div>';}
  function openSafetyCheck(record=null){const form=$('#safetyCheckForm');form.reset();form.elements.id.value=record?.id||'';form.elements.tipoTrabalho.value=record?.tipoTrabalho||'';form.elements.data.value=record?.data||new Date().toISOString().slice(0,10);form.elements.local.value=record?.local||'';form.elements.responsavel.value=record?.responsavel||'';form.elements.observacoes.value=record?.observacoes||'';$('input[name="equipamentos"]',form).forEach(el=>el.checked=(record?.equipamentos||[]).includes(el.value));renderSafetyCheckPtOptions(record?.ptId||'');$('#safetyCheckEditorTitle').textContent=record?'Editar checklist de segurança':'Novo checklist de segurança';renderSafetyCheckItems(record?.itens||[]);$('#safetyCheckEditor').hidden=false;$('#safetyCheckEditor').scrollIntoView({behavior:'smooth',block:'start'});}
  function closeSafetyCheck(){$('#safetyCheckEditor').hidden=true;$('#safetyCheckForm').reset();$('#safetyCheckItems').innerHTML='';}
  function persistSafetyCheck(finalize){const form=$('#safetyCheckForm');if(!form.reportValidity())return;const items=collectSafetyCheckItems();if(!items.length){toast('Selecione o tipo de trabalho para carregar os itens.');return;}if(finalize&&items.some(x=>!x.status)){toast('Responda a todos os itens antes de concluir.');return;}if(items.some(x=>x.status==='nao_conforme'&&!x.justificativa)){toast('Descreva todas as não conformidades e as ações necessárias.');return;}const data=Object.fromEntries(new FormData(form).entries()),equipamentos=$('input[name="equipamentos"]:checked',form).map(x=>x.value),all=readSafetyChecks(),id=data.id||((crypto.randomUUID&&crypto.randomUUID())||String(Date.now())),old=all.find(x=>x.id===id),record={...data,id,equipamentos,itens,status:finalize?'Concluído':'Em preenchimento',criadoEm:old?.criadoEm||new Date().toISOString(),atualizadoEm:new Date().toISOString()};const index=all.findIndex(x=>x.id===id);if(index>=0)all[index]=record;else all.unshift(record);saveSafetyChecks(all);closeSafetyCheck();renderSafetyChecks();toast(finalize?'Checklist concluído e salvo.':'Preenchimento salvo.');}
  $('#newSafetyChecklist').addEventListener('click',()=>openSafetyCheck());
  $('#cancelSafetyCheck').addEventListener('click',closeSafetyCheck);
  $('#saveSafetyCheckDraft').addEventListener('click',()=>persistSafetyCheck(false));
  $('#safetyCheckForm').addEventListener('submit',e=>{e.preventDefault();persistSafetyCheck(true);});
  $('#safetyCheckWork').addEventListener('change',()=>renderSafetyCheckItems());
  $('#safetyCheckForm').addEventListener('change',e=>{if(e.target.matches('input[name="equipamentos"]'))renderSafetyCheckItems(collectSafetyCheckItems());const card=e.target.closest('[data-safety-check-item]');if(card&&e.target.matches('input[type="radio"]')){const label=$('[data-safety-justification]',card)?.closest('.check-justification');if(label){label.hidden=e.target.value!=='nao_conforme';if(e.target.value!=='nao_conforme')$('[data-safety-justification]',card).value='';}updateSafetyCheckSummary();}});
  $('#safetyCheckForm').addEventListener('input',e=>{if(e.target.matches('[data-safety-justification]'))updateSafetyCheckSummary();});
  $('#safetyCheckSearch').addEventListener('input',renderSafetyChecks);$('#safetyCheckStatus').addEventListener('change',renderSafetyChecks);
  $('#safetyCheckList').addEventListener('click',e=>{const view=e.target.closest('[data-safety-view]');if(view){const x=readSafetyChecks().find(v=>v.id===view.dataset.safetyView);if(x){const lines=(x.itens||[]).map((i,n)=>(n+1)+'. '+i.pergunta+'\nResposta: '+(i.status==='conforme'?'Conforme':i.status==='nao_conforme'?'Não conforme':'Não se aplica')+(i.justificativa?'\nAção/justificativa: '+i.justificativa:'')).join('\n\n');alert('CHECKLIST DE SEGURANÇA\n\nAtividade: '+x.tipoTrabalho+'\nLocal: '+x.local+'\nData: '+x.data+'\nResponsável: '+x.responsavel+'\nSituação: '+x.status+'\nEquipamentos: '+(x.equipamentos||[]).join(', ')+'\n\n'+lines+'\n\nObservações: '+(x.observacoes||'—'));}return;}const edit=e.target.closest('[data-safety-edit]');if(edit){const x=readSafetyChecks().find(v=>v.id===edit.dataset.safetyEdit);if(x)openSafetyCheck(x);return;}const del=e.target.closest('[data-safety-delete]');if(del){if(!confirm('Deseja excluir este checklist?'))return;saveSafetyChecks(readSafetyChecks().filter(x=>x.id!==del.dataset.safetyDelete));renderSafetyChecks();toast('Checklist excluído.');}});

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