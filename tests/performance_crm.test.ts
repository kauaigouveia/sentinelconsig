// @vitest-environment node
import {it,expect,vi} from 'vitest';
vi.mock('../server/services/eventBus.js',()=>({centralEventBus:{publish:vi.fn()}}));
vi.mock('../server/services/auditLogService.js',()=>({AuditLogService:{}}));
vi.mock('../server/logger.js',()=>({logger:{info:vi.fn(),error:vi.fn()}}));
import {PartnerCrmService} from '../server/services/partnerCrmService';
it('returns equivalent latest activity using tenant scoped database maxima without reading histories',async()=>{
 const date=new Date('2026-01-01');const proposal=vi.fn(async(q:any)=>q._max?[{partnerId:'synthetic-partner',_max:{createdAt:new Date('2026-02-01')}}]:[]);
 const simulation=vi.fn(async()=>[{partnerId:'synthetic-partner',_max:{createdAt:new Date('2026-03-01')}}]);const interaction=vi.fn(async()=>[{partnerId:'synthetic-partner',_max:{date:new Date('2026-04-01')}}]);
 const db:any={partner:{count:vi.fn(async()=>1),findMany:vi.fn(async()=>[{id:'synthetic-partner',name:'Fictício',status:'ATIVO',updatedAt:date,createdAt:date,portalAccesses:[],_count:{}}])},proposal:{groupBy:proposal},simulationRequest:{groupBy:simulation},partnerInteraction:{groupBy:interaction},pendency:{groupBy:vi.fn(async()=>[])},partnerTask:{groupBy:vi.fn(async()=>[])}};
 const result=await PartnerCrmService.listPartners(db,'synthetic-tenant');
 expect(JSON.stringify(result)).toContain('2026-04-01');for(const mock of [proposal,simulation,interaction])for(const [query] of mock.mock.calls as any)expect(query.where).toMatchObject({tenantId:'synthetic-tenant',partnerId:{in:['synthetic-partner']}});
 expect(db.partner.findMany.mock.calls[0][0]).toMatchObject({take:20,skip:0,where:{tenantId:'synthetic-tenant'}});
});
