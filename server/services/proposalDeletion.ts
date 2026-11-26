import { Prisma, type PrismaClient } from '@prisma/client';
import type { Request } from 'express';
import { AuditLogService } from './auditLogService.js';

export const MAX_PROPOSAL_DELETE_BATCH = 250;
export function parseProposalDeleteIds(input: unknown): string[] | null {
  if (!Array.isArray(input) || !input.length || input.length > MAX_PROPOSAL_DELETE_BATCH) return null;
  if (input.some(id => typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,150}$/.test(id))) return null;
  return [...new Set(input as string[])];
}

export async function deleteTenantProposals(prisma: PrismaClient, tenantId: string, ids: string[], actor: {id: string; name: string}, req?: Request) {
  return prisma.$transaction(async tx => {
    // The database returns exactly the records deleted; repeated or stale IDs are harmless.
    // Never resolve by ADE or proposal number, which may identify an unrelated proposal.
    const deleted = await tx.$queryRaw<Array<{id:string; proposalNumber:string; contractValue:string}>>(Prisma.sql`
      DELETE FROM proposals WHERE tenant_id = ${tenantId} AND id IN (${Prisma.join(ids)})
      RETURNING id, proposal_number AS "proposalNumber", contract_value::text AS "contractValue"
    `);
    const deletedIds = deleted.map(row => row.id);
    if (deletedIds.length) {
      await tx.proposal.updateMany({
        where:{tenantId,relatedPortabilityId:{in:deletedIds}},
        data:{relatedPortabilityId:null},
      });
      await AuditLogService.recordBatch(tx, deleted.map(row=>({
        tenantId,userId:actor.id,userName:actor.name,action:'PROPOSAL_DELETED',
        entity:'Proposal',entityId:row.id,oldData:row,req
      })));
    }
    const confirmed = new Set(deletedIds);
    return {deletedIds, absentIds:ids.filter(id=>!confirmed.has(id)), deletedCount:deletedIds.length};
  }, {timeout:30000});
}
