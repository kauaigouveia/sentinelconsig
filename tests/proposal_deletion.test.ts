import { describe, expect, it, vi } from 'vitest';
import { parseProposalDeleteIds, deleteTenantProposals } from '../server/services/proposalDeletion';
import { AuditLogService } from '../server/services/auditLogService';

describe('tenant-scoped proposal deletion',()=>{
 it('accepts 172 IDs and deduplicates repeated requests',()=>{
  const ids=Array.from({length:172},(_,i)=>'id-'+i);
  expect(parseProposalDeleteIds(ids)).toEqual(ids);
  expect(parseProposalDeleteIds(['id-1','id-1'])).toEqual(['id-1']);
  expect(parseProposalDeleteIds([])).toBeNull();
  expect(parseProposalDeleteIds(Array(251).fill('id'))).toBeNull();
  expect(parseProposalDeleteIds(['x/y'])).toBeNull();
 });
 it('audits only records returned by the tenant-filtered delete and handles absent IDs',async()=>{
  const row={id:'p1',proposalNumber:'ADE1',contractValue:'100.00'};
  const query=vi.fn(async()=>[row]),updateMany=vi.fn(async()=>({count:0}));
  const tx={ $queryRaw:query,proposal:{updateMany} };
  const db={ $transaction:vi.fn(async(fn:any)=>fn(tx)) };
  const audit=vi.spyOn(AuditLogService,'recordBatch').mockResolvedValue({count:1});
  try{
   const result=await deleteTenantProposals(db as any,'tenant-a',['p1','absent'],{id:'u1',name:'User'});
   expect(result).toEqual({deletedIds:['p1'],absentIds:['absent'],deletedCount:1});
   const sql=(query.mock.calls as any)[0][0];
   expect(sql.text).toContain('tenant_id =');
   expect(sql.values).toContain('tenant-a');
   expect(updateMany).toHaveBeenCalledWith({where:{tenantId:'tenant-a',relatedPortabilityId:{in:['p1']}},data:{relatedPortabilityId:null}});
   expect(audit).toHaveBeenCalledWith(tx,[expect.objectContaining({tenantId:'tenant-a',entityId:'p1',action:'PROPOSAL_DELETED'})]);
  }finally{audit.mockRestore();}
 });
 it('does not audit missing or other-tenant IDs',async()=>{
  const tx={$queryRaw:vi.fn(async()=>[]),proposal:{updateMany:vi.fn()}};
  const db={$transaction:vi.fn(async(fn:any)=>fn(tx))};
  const audit=vi.spyOn(AuditLogService,'recordBatch');
  try{
   expect(await deleteTenantProposals(db as any,'tenant-a',['other'],{id:'u1',name:'User'})).toEqual({deletedIds:[],absentIds:['other'],deletedCount:0});
   expect(tx.proposal.updateMany).not.toHaveBeenCalled();expect(audit).not.toHaveBeenCalled();
  }finally{audit.mockRestore();}
 });
});
