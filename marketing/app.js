
(() => {
  "use strict";
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const modules = {
    propostas: {
      eyebrow:"Controle operacional",title:"Cada proposta no seu devido lugar.",
      description:"Registre, consulte e acompanhe a evolução das propostas com filtros, histórico de movimentações e organização por etapas do processo.",
      points:["Visão centralizada da produção","Filtros por status e dados da operação","Esteira de pendências e acompanhamento"],
      visualTitle:"Esteira de propostas",
      rows:[["Operação 001 • Nova proposta","Entrada registrada para acompanhamento","Análise"],["Operação 002 • Portabilidade","Etapa de consulta e validação","Em andamento"],["Operação 003 • Refinanciamento","Andamento acompanhado pela equipe","Acompanhamento"]]
    },
    simulacoes: {
      eyebrow:"Alternativas em um só lugar",title:"Simulações alinhadas às regras da operação.",
      description:"Apoie decisões com fluxos de simulação por instituição, convênio e modalidade, conforme integrações, credenciamentos e condições habilitados.",
      points:["Consultas e condições por contexto","Modalidades como novo e portabilidade","Retornos organizados para análise operacional"],
      visualTitle:"Painel de simulações",rows:[["Simulação • Novo","Condições conforme canal habilitado","Consulta"],["Simulação • Portabilidade","Comparação e consulta de contratos","Análise"],["Instituição integrada","Disponibilidade sujeita à habilitação","Configuração"]]
    },
    parceiros: {
      eyebrow:"Trabalho em equipe",title:"Cada profissional com seu contexto de acesso.",
      description:"Organize equipes, parceiros e responsáveis para simplificar a distribuição de demandas e o acesso às informações necessárias.",
      points:["Papéis distintos para cada função","Acompanhamento de demandas e pendências","Organização de canais e parceiros"],
      visualTitle:"Gestão de equipe",rows:[["Gestor operacional","Visão de equipe e acompanhamento","Gestão"],["Digitador / Simulação","Fluxo operacional conforme perfil","Operação"],["Parceiro autorizado","Acesso aos próprios fluxos habilitados","Parceiro"]]
    },
    indicadores: {
      eyebrow:"Gestão orientada por dados",title:"Transforme o movimento em visão gerencial.",
      description:"Consolide produção, status, rankings e indicadores para acompanhar o desempenho e identificar onde a operação merece atenção.",
      points:["Visão consolidada das propostas","Indicadores de avanço e desempenho","Filtros para explorar os resultados"],
      visualTitle:"Relatórios e indicadores",rows:[["Produção operacional","Evolução de propostas por período","Relatório"],["Ranking de atuação","Acompanhamento por equipe ou parceiro","Indicador"],["Etapas do funil","Leitura de aprovações e pendências","BI"]]
    },
    administracao: {
      eyebrow:"Governança e configuração",title:"Uma base organizada para vários fluxos.",
      description:"Configure empresas, usuários, bancos, convênios e produtos dentro da estrutura de permissões da plataforma.",
      points:["Empresas e usuários por contexto","Catálogos e parâmetros por operação","Acessos conforme perfil e autorização"],
      visualTitle:"Administração da plataforma",rows:[["Empresas e equipes","Estrutura de ambientes e acessos","Configuração"],["Bancos e convênios","Catálogos operacionais por contexto","Catálogo"],["Usuários e permissões","Responsabilidades e acessos","Controle"]]
    }
  };
  const tabs = $$('[data-module]');
  const modulePanel = $('#modulePanel');
  function showModule(key) {
    const data = modules[key]; if (!data) return;
    tabs.forEach(tab => {
      const selected = tab.dataset.module === key;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    modulePanel.setAttribute('aria-labelledby','tab-' + key);
    $('#moduleEyebrow').textContent = data.eyebrow;
    $('#moduleTitle').textContent = data.title;
    $('#moduleDescription').textContent = data.description;
    $('#moduleList').replaceChildren(...data.points.map(point => {
      const li=document.createElement('li');li.textContent=point;return li;
    }));
    $('#visualHeading').textContent = data.visualTitle;
    const body=$('#visualBody');body.replaceChildren();
    data.rows.forEach((item,i)=>{
      const row=document.createElement('div');row.className='visual-row';
      const info=document.createElement('div');
      const strong=document.createElement('strong');strong.textContent=item[0];
      const small=document.createElement('small');small.textContent=item[1];
      info.append(strong,small);
      const badge=document.createElement('span');badge.className='visual-badge'+(i===1?' other':'');badge.textContent=item[2];
      row.append(info,badge);body.append(row);
    });
    const meter=document.createElement('div');meter.className='visual-meter';
    const inner=document.createElement('span');inner.style.width=key==='indicadores'?'82%':key==='administracao'?'67%':'73%';
    meter.append(inner);body.append(meter);
  }
  tabs.forEach((tab,index)=>{
    tab.addEventListener('click',()=>showModule(tab.dataset.module));
    tab.addEventListener('keydown',(e)=>{
      let next;
      if(e.key==='ArrowRight')next=(index+1)%tabs.length;
      else if(e.key==='ArrowLeft')next=(index-1+tabs.length)%tabs.length;
      else if(e.key==='Home')next=0;
      else if(e.key==='End')next=tabs.length-1;
      if(next!==undefined){e.preventDefault();showModule(tabs[next].dataset.module);tabs[next].focus();}
    });
  });
  const menu=$('#mainNav'),menuBtn=$('#menuBtn');
  function closeMenu(){menu.classList.remove('open');menuBtn.setAttribute('aria-expanded','false');menuBtn.setAttribute('aria-label','Abrir menu');menuBtn.textContent='☰';}
  menuBtn.addEventListener('click',()=>{
    const open=menu.classList.toggle('open');
    menuBtn.setAttribute('aria-expanded',String(open));
    menuBtn.setAttribute('aria-label',open?'Fechar menu':'Abrir menu');menuBtn.textContent=open?'×':'☰';
  });
  $$('.main-nav a').forEach(a=>a.addEventListener('click',closeMenu));
  window.addEventListener('resize',()=>{if(window.innerWidth>970)closeMenu();},{passive:true});
  const modal=$('#leadModal'),form=$('#leadForm'),submit=$('#submitLead'),message=$('#formMessage');
  const kind=$('#leadKind'),plan=$('#leadPlan'),date=$('#leadDate'),time=$('#leadTime');
  let lastFocus=null;
  function localDate(){
    const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Maceio',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const part=type=>parts.find(x=>x.type===type)?.value||'';
    return part('year')+'-'+part('month')+'-'+part('day');
  }
  date.min=localDate();
  function showModal(type,selectedPlan){
    lastFocus=document.activeElement;form.reset();message.textContent='';message.classList.remove('success');
    submit.disabled=false;submit.textContent='Enviar solicitação ↗';
    const demo=type==='demo';kind.value=type;plan.value=selectedPlan||'A definir';
    $('#modalTitle').textContent=demo?'Solicitar demonstração':'Solicitar contratação';
    $('#modalDescription').textContent=demo?'Selecione uma data e horário de preferência. Uma reserva só será confirmada após integração e verificação da agenda.':'Solicite uma proposta sob medida. Não há cobrança ou contratação automática pelo formulário.';
    $$('.demo-field').forEach(el=>el.classList.toggle('hidden',!demo));
    date.required=demo;time.required=demo;
    date.min=localDate();
    modal.classList.add('open');modal.setAttribute('aria-hidden','false');document.body.classList.add('locked');
    $('#leadName').focus();
  }
  function closeModal(){
    modal.classList.remove('open');modal.setAttribute('aria-hidden','true');document.body.classList.remove('locked');
    if(lastFocus && typeof lastFocus.focus==='function')lastFocus.focus();
  }
  $$('[data-open]').forEach(button=>button.addEventListener('click',()=>showModal(button.dataset.open,button.dataset.plan)));
  $('#closeModal').addEventListener('click',closeModal);
  modal.addEventListener('click',e=>{if(e.target===modal)closeModal();});
  document.addEventListener('keydown',e=>{
    if(!modal.classList.contains('open')){if(e.key==='Escape')closeMenu();return;}
    if(e.key==='Escape'){closeModal();return;}
    if(e.key==='Tab'){
      const els=Array.from(modal.querySelectorAll('a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)'))
      .filter(el=>el.offsetParent!==null && el.tabIndex!==-1);
      if(!els.length)return;
      if(e.shiftKey && document.activeElement===els[0]){els[els.length-1].focus();e.preventDefault();}
      else if(!e.shiftKey && document.activeElement===els[els.length-1]){els[0].focus();e.preventDefault();}
    }
  });
  function validateDateAndTime() {
    if(kind.value!=='demo')return '';
    if(!date.value || !time.value)return 'Escolha uma data e um horário para a demonstração.';
    const iso=date.value,dd=new Date(iso+'T12:00:00-03:00'),day=dd.getUTCDay();
    if(day===0 || day===6)return 'Escolha um dia útil, de segunda a sexta-feira.';
    const selected=new Date(iso+'T'+time.value+':00-03:00');
    if(selected.getTime()<=Date.now()+5*60*1000)return 'Escolha um horário futuro para a demonstração.';
    return '';
  }
  form.addEventListener('submit',async e=>{
    e.preventDefault();message.classList.remove('success');message.textContent='';
    if(!form.reportValidity())return;
    const validation=validateDateAndTime();if(validation){message.textContent=validation;return;}
    const data=Object.fromEntries(new FormData(form).entries());data.consent=$('#leadConsent').checked;
    if(data.kind==='demo'){data.period=Number(data.time.slice(0,2))<12?'Manhã':'Tarde';}
    else{data.date='';data.time='';data.period='';}
    submit.disabled=true;submit.textContent='Enviando...';
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await fetch('/api/lead',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:controller.signal});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok || !payload.ok)throw new Error(payload.message||'Não foi possível enviar sua solicitação.');
      message.classList.add('success');
      const confirmed=payload.calendarConfirmed===true;
      message.textContent=confirmed?
        'Demonstração confirmada! O evento foi criado na agenda Google e o convite foi enviado para o e-mail informado.':
        (payload.message||'Solicitação recebida. A equipe comercial entrará em contato para confirmar.');
      submit.textContent=confirmed?'Reunião confirmada ✓':'Solicitação recebida ✓';
      form.reset();submit.disabled=true;
    }catch(err){
      message.textContent=err.name==='AbortError'?'O envio demorou além do esperado. Verifique antes de tentar novamente.':(err.message||'Erro ao enviar. Escreva para comercial@sentinelconsig.com.br.');
      submit.disabled=false;submit.textContent='Enviar solicitação ↗';
    }finally{clearTimeout(timer);}
  });
  $('#year').textContent=String(new Date().getFullYear());
  const reveal=$$('.reveal');
  if('IntersectionObserver'in window&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
    const obs=new IntersectionObserver(entries=>entries.forEach(entry=>{
      if(entry.isIntersecting){entry.target.classList.add('in');obs.unobserve(entry.target);}
    }),{threshold:.07,rootMargin:'0px 0px 30px 0px'});
    reveal.forEach(el=>obs.observe(el));
  }else reveal.forEach(el=>el.classList.add('in'));
  const navLinks=$$('.main-nav a');
  if('IntersectionObserver'in window){
    const ids=navLinks.map(a=>a.hash?.slice(1)).filter(Boolean);
    const io=new IntersectionObserver(entries=>{
      for(const item of entries){if(item.isIntersecting){navLinks.forEach(a=>a.classList.toggle('active',a.hash==='#'+item.target.id));}}
    },{rootMargin:'-110px 0px -68% 0px',threshold:0});
    ids.map(id=>document.getElementById(id)).filter(Boolean).forEach(el=>io.observe(el));
  }
})();