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
    const term=($('#historySearch')?.value||'').toLocaleLowerCase('pt-BR');
    const records=readRecords().filter(r=>{
      const matchesText=[r.local,r.servico,r.responsavelExecucao,r.tipoTrabalho].join(' ').toLocaleLowerCase('pt-BR').includes(term);
      const matchesStatus=historyStatusFilter==='todos' || (historyStatusFilter==='andamento' ? r.status==='Em andamento' : historyStatusFilter==='encerradas' ? r.status==='Encerrada' : r.status==='Aguardando liberação');
      return matchesText && matchesStatus;
    });
    const filterLabel=historyStatusFilter==='andamento'?' em andamento':historyStatusFilter==='encerradas'?' encerrada(s)':'';
    $('#historyCount').textContent=`${records.length} registro(s)${filterLabel}`;
    $('#historyList').innerHTML=records.length?records.map(recordCard).join(''):'<div class="empty-state">Nenhuma permissão encontrada.</div>';
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
        </div><div class="record-meta"><button class="running-view" type="button" data-view="${escapeHtml(r.id)}">Ver detalhes <span>→</span></button></div>
      </article>`;
    }).join(''):'<div class="empty-state">'+(active.length?'Nenhuma PT corresponde à sua busca.':'Nenhuma PT em andamento no momento. As permissões salvas como em andamento aparecerão aqui.')+'</div>';
    bindRecordCards('#runningList');
  }
  document.addEventListener('click',event=>{
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
    const del=event.target.closest('[data-delete]');
    if(del){if(!confirm('Deseja realmente excluir esta Permissão de Trabalho?'))return;saveRecords(readRecords().filter(r=>r.id!==del.dataset.delete));renderHistory();renderDashboard();toast('Registro excluído.');return;}
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