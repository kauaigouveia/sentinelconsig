export type MonitoringStatus='ONLINE'|'ATTENTION'|'OFFLINE'|'DISABLED'|'UNKNOWN';
type Evidence={unavailable:boolean;active:boolean;enabledCount:number;missingCredentials:boolean;incident:boolean;lastCheck?:{timestamp:Date;success:boolean;httpStatus?:number|null;rayId?:string|null};errors:number;successRate?:number;now?:number};
/** Passive classification only. No credentials, provider calls or product enablement decisions. */
export function classifyIntegrationMonitoring(e:Evidence):{status:MonitoringStatus;reason:string}{
 if(e.unavailable)return{status:'ATTENTION',reason:'Não foi possível ler toda a configuração.'};
 if(e.active&&e.missingCredentials)return{status:'ATTENTION',reason:'Há conexão habilitada com credenciais incompletas.'};
 if(!e.active)return{status:'DISABLED',reason:'Integração desabilitada na configuração.'};
 if(e.incident)return{status:'OFFLINE',reason:'Incidente ativo registrado para a instituição.'};
 if(e.enabledCount>1)return{status:'UNKNOWN',reason:'Há várias conexões; o histórico disponível não identifica a promotora de cada verificação.'};
 if(!e.lastCheck)return{status:'UNKNOWN',reason:'Nenhuma verificação registrada. Configuração não comprova conectividade.'};
 const age=(e.now??Date.now())-e.lastCheck.timestamp.getTime();
 if(!Number.isFinite(age)||age>86400000||age< -300000)return{status:'UNKNOWN',reason:'O registro disponível não comprova o estado atual; última verificação há mais de 24 horas ou com data inválida.'};
 if(!e.lastCheck.success)return{status:e.lastCheck.httpStatus===403||e.lastCheck.rayId||e.errors>=5?'OFFLINE':'ATTENTION',reason:'A última verificação registrada falhou.'};
 if(e.errors>0&&e.successRate!==undefined&&e.successRate<90)return{status:'ATTENTION',reason:'Última verificação OK, mas há falhas relevantes registradas nas últimas 24 horas.'};
 return{status:'ONLINE',reason:'Última verificação registrada concluída com sucesso.'};
}
export function integrationOverallStatus(s:{offline:number;attention:number;unknown?:number;online:number}){return s.offline>0?'DEGRADED':s.attention>0?'ATTENTION':(s.unknown??0)>0||s.online===0?'UNKNOWN':'OPERATIONAL';}
