/** Product-first Telegram navigation. No banking API or customer documents are handled in this module. */
export type TelegramProductSection = 'ROOT'|'CLT'|'FGTS'|'INSS'|'PORT';
export type TelegramMenuAction =
  |'HOME'|'CLT'|'FGTS'|'INSS'|'PORT'|'NEW'|'REFIN'|'PORT_ONLY'|'PORT_REFIN'
  |'SIMULATE'|'CLIENT'|'EXTRACT'|'QUERY'|'SWITCH'|null;

export function normalizeTelegramMenuInput(value:unknown):string {
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^\p{L}\p{N}]+/gu,' ').toLowerCase().trim().replace(/\s+/g,' ');
}

export function telegramMainMenu(label:string){
  return {
    response:'✅ Olá! Bem-vindo ao Sentinel Conecta.\n'+(label?'\nCadastro selecionado: '+label+'\n':'')+
      '\n📋 Menu principal — escolha o produto:\n\n1️⃣ 💼 Consignado CLT\n2️⃣ 💰 FGTS (Saque-Aniversário)\n3️⃣ 🏛️ INSS — Novo e Refinanciamento\n4️⃣ 🔄 Portabilidade INSS\n5️⃣ 🔍 Consultar proposta\n6️⃣ 👤 Trocar parceiro/empresa\n\nSelecione uma opção abaixo.',
    keyboard:[['💼 CLT','💰 FGTS'],['🏛️ INSS','🔄 Portabilidade INSS'],['🔍 Consultar proposta','👤 Trocar parceiro']],
  };
}
export function telegramSectionMenu(section:Exclude<TelegramProductSection,'ROOT'>){
  switch(section){
    case 'CLT': return {
      response:'💼 CLT · Menu Principal\n\n1️⃣ Simular todos os bancos\n2️⃣ Consultar proposta\n3️⃣ Consultar dados do cliente\n\nAs simulações são feitas nesta conversa com os bancos habilitados. A autorização do titular é obrigatória; alguns bancos podem exigir confirmação adicional.',
      keyboard:[['💰 Simular todos os bancos'],['🔍 Consultar proposta','🪪 Dados do cliente'],['🏠 Menu principal','👤 Trocar parceiro']],
    };
    case 'FGTS':return {
      response:'💰 FGTS (Saque-Aniversário)\n\n1️⃣ Simular antecipação\n2️⃣ Consultar proposta\n\nO bot consulta as condições disponíveis e apresenta os valores aqui, sem contratação.',
      keyboard:[['💰 Simular FGTS'],['🔍 Consultar proposta'],['🏠 Menu principal','👤 Trocar parceiro']],
    };
    case 'INSS':return {
      response:'🏛️ INSS · Novo e Refinanciamento\n\n1️⃣ Simular empréstimo novo\n2️⃣ Simular refinanciamento\n3️⃣ Consultar proposta\n\nO bot solicitará os dados do benefício e mostrará as ofertas retornadas pelas instituições habilitadas. O resultado não é aprovação bancária.',
      keyboard:[['💰 Novo INSS','🔁 Refinanciamento INSS'],['🔍 Consultar proposta'],['🏠 Menu principal','👤 Trocar parceiro']],
    };
    case 'PORT':return {
      response:'🔄 INSS · Portabilidade\n\n1️⃣ Portabilidade pura\n2️⃣ Portabilidade + Refinanciamento\n3️⃣ Enviar extrato INSS em PDF para simular\n4️⃣ Consultar proposta\n\nVocê também pode informar os dados de um contrato manualmente e simular aqui no bot. Pelo extrato PDF, o bot identifica os contratos e consulta as planilhas habilitadas.',
      keyboard:[['🔄 Portabilidade pura'],['🔁 Portabilidade + refinanciamento'],['📄 Enviar extrato INSS'],['🔍 Consultar proposta'],['🏠 Menu principal','👤 Trocar parceiro']],
    };
  }
}

/**
 * Numeric shortcuts are restricted to visible product menus. They must never
 * intercept numeric proposal selections in the existing results workflow.
 */
export function telegramMenuAction(input:string,section:TelegramProductSection,allowNumbers=true):TelegramMenuAction{
  const key=normalizeTelegramMenuInput(input);
  if(['menu','menu principal','voltar ao menu','voltar'].includes(key))return 'HOME';
  if(['trocar empresa','trocar parceiro','trocar parceiro empresa'].includes(key))return 'SWITCH';
  if(['consultar proposta','consultar propostas','consulta proposta'].includes(key))return 'QUERY';
  if(key==='clt'||key==='consignado clt')return 'CLT';
  if(key==='fgts'||key==='saque aniversario'||key==='fgts saque aniversario')return 'FGTS';
  if(key==='inss'||key==='inss novo e refinanciamento')return 'INSS';
  if(key==='portabilidade inss')return 'PORT';
  if(key==='novo inss'||key==='simular novo inss')return 'NEW';
  if(key==='refinanciamento inss')return 'REFIN';
  if(key==='portabilidade pura')return 'PORT_ONLY';
  if(key==='portabilidade refinanciamento'||key==='portabilidade e refinanciamento')return 'PORT_REFIN';
  if(key==='simular todos os bancos'||key==='simular fgts'||key==='simular antecipacao')return 'SIMULATE';
  if(key==='dados do cliente'||key==='consultar dados do cliente')return 'CLIENT';
  if(key==='simular pelo extrato'||key==='enviar extrato'||key==='extrato inss'||key==='enviar extrato inss')return 'EXTRACT';
  if(!allowNumbers)return null;
  const shortcuts:Record<TelegramProductSection,Record<string,TelegramMenuAction>>={
    ROOT:{'1':'CLT','2':'FGTS','3':'INSS','4':'PORT','5':'QUERY','6':'SWITCH'},
    CLT:{'1':'SIMULATE','2':'QUERY','3':'CLIENT'},
    FGTS:{'1':'SIMULATE','2':'QUERY'},
    INSS:{'1':'NEW','2':'REFIN','3':'QUERY'},
    PORT:{'1':'PORT_ONLY','2':'PORT_REFIN','3':'EXTRACT','4':'QUERY'},
  };
  return shortcuts[section][key]||null;
}

export type TelegramSimulationTarget={product:'CLT'|'FGTS'|'INSS';operation?:'NEW'|'REFIN'|'PORT'|'PORT_REFIN'};
export function telegramSimulationTarget(section:TelegramProductSection,action:TelegramMenuAction):TelegramSimulationTarget|null{
  if(action==='NEW')return {product:'INSS',operation:'NEW'};
  if(action==='REFIN')return {product:'INSS',operation:'REFIN'};
  if(action==='PORT_ONLY')return {product:'INSS',operation:'PORT'};
  if(action==='PORT_REFIN')return {product:'INSS',operation:'PORT_REFIN'};
  if(action!=='SIMULATE')return null;
  if(section==='CLT')return {product:'CLT'};
  if(section==='FGTS')return {product:'FGTS'};
  return null;
}
export function telegramPortalLink(target:TelegramSimulationTarget|'PROFILE',rawOrigin:string):string {
  const origin=new URL(rawOrigin);
  if(origin.protocol!=='https:'||origin.username||origin.password||!origin.hostname)throw Error('APP_URL deve ser HTTPS sem credenciais.');
  const url=new URL('/parceiro',origin.origin);
  if(target==='PROFILE'){url.searchParams.set('tab','perfil');}
  else {
    url.searchParams.set('tab','simulacoes');
    url.searchParams.set('product',target.product);
    if(target.operation)url.searchParams.set('operation',target.operation);
  }
  return url.toString();
}
