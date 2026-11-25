export type ExternalRow={id:string;partner:string;bank:string;created:string;category:string;gross:number|null;net:number|null;commission:number|null};
export type LocalRow={proposalNumber:string;partner:{code:string}|null;bank:{name:string}|null;standardCategory:string;contractValue:unknown};
const normalize=(v:unknown)=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase().replace(/\s+/g,' ');
const key=(id:unknown,partner:unknown,bank:unknown)=>{const i=normalize(id),p=normalize(partner),b=normalize(bank);return i&&p&&b?JSON.stringify([i,p,b]):null;};
const cents=(v:unknown)=>Number.isFinite(Number(v))?Math.round(Number(v)*100):0;
const localStatus=(v:string)=>({PAGO:'paid',PENDENTE:'pending',ANDAMENTO:'progress',ESTEIRA:'progress',CANCELADO:'cancel',RECUSADO:'cancel'} as Record<string,string>)[v]||'other';
export function validMonth(v:unknown):v is string{return typeof v==='string'&&/^20\d{2}-(0[1-9]|1[0-2])$/.test(v);}
export function monthRange(month:string){if(!validMonth(month))throw Error('Mês inválido');const start=new Date(month+'-01T00:00:00-03:00');const [y,m]=month.split('-').map(Number);const next=new Date(Date.UTC(y,m,1,3));return {start,next};}
export function allowedBridge(session:any,tenantId:string|undefined,managerIds:string|undefined,actor:{tenantId:string|null;role:string;active:boolean;deletedAt:unknown}|null){
 if(!tenantId||!session?.user||session.effectiveTenantId!==tenantId||session.user.mustChangePassword||!actor?.active||actor.deletedAt)return false;
 if(actor.role==='PLATFORM_MASTER')return session.activeRole==='PLATFORM_MASTER'&&session.adminContext?.targetTenantId===tenantId;
 const membership=session.activeMembership;
 const role=membership?.active&&membership.tenantId===tenantId?membership.role:actor.tenantId===tenantId?actor.role:null;
 if(role!==session.activeRole||role!==session.user.role)return false;
 return role==='MASTER'||(role==='GESTOR'&&(managerIds||'').split(',').map(v=>v.trim()).includes(session.user.id));
}
export function reconcile(rows:ExternalRow[],local:LocalRow[]){
 const groups:Record<string,{count:number;gross:number;commission:number;known:number}>={};for(const k of ['paid','pending','progress','cancel','reversed','other'])groups[k]={count:0,gross:0,commission:0,known:0};
 const banks=new Map<string,{name:string;count:number;paid:number;gross:number}>();
 const ext=new Map<string,ExternalRow[]>(),inside=new Map<string,LocalRow[]>();
 let gross=0,paidGross=0,commission=0,paidKnown=0,paidCommission=0,commissionKnown=0;
 for(const r of rows){const cat=Object.prototype.hasOwnProperty.call(groups,r.category)?r.category:'other',g=groups[cat],v=cents(r.gross);g.count++;g.gross+=v;gross+=v;if(r.commission!==null&&Number.isFinite(r.commission)){const c=cents(r.commission);g.commission+=c;g.known++;commission+=c;commissionKnown++;if(cat==='paid'){paidCommission+=c;paidKnown++;}}if(cat==='paid')paidGross+=v;const name=r.bank||'Não informado',b=banks.get(name)||{name,count:0,paid:0,gross:0};b.count++;if(cat==='paid'){b.paid++;b.gross+=v;}banks.set(name,b);const k=key(r.id,r.partner,r.bank);if(k)ext.set(k,[...(ext.get(k)||[]),r]);}
 for(const r of local){const k=key(r.proposalNumber,r.partner?.code,r.bank?.name);if(k)inside.set(k,[...(inside.get(k)||[]),r]);}
 let matched=0,statusDifferences=0,valueDifferences=0,ambiguous=0;
 for(const [k,rs] of ext){const ls=inside.get(k);if(!ls)continue;if(rs.length!==1||ls.length!==1){ambiguous+=rs.length;continue;}matched++;if(rs[0].category!==localStatus(ls[0].standardCategory))statusDifferences++;if(rs[0].gross!==null&&cents(rs[0].gross)!==cents(ls[0].contractValue))valueDifferences++;}
 for(const g of Object.values(groups)){g.gross/=100;g.commission/=100;}
 return {total:rows.length,gross:gross/100,paid:groups.paid.count,paidGross:paidGross/100,conversion:rows.length?groups.paid.count*100/rows.length:0,commission:commissionKnown?commission/100:null,paidCommission:paidKnown?paidCommission/100:null,lostCommission:groups.cancel.known?groups.cancel.commission:null,groups,banks:[...banks.values()].sort((a,b)=>b.gross-a.gross).slice(0,10).map(b=>({...b,gross:b.gross/100})),reconciliation:{matched,statusDifferences,valueDifferences,ambiguous,externalUnmatched:rows.length-matched-ambiguous,localTotal:local.length}};
}
