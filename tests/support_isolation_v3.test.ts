import { describe, expect, it, vi } from 'vitest';
vi.mock('../server/services/eventBus.js', () => ({eventBus:{publish:vi.fn()}}));
vi.mock('../server/services/telegramNotificationService.js', () => ({TelegramNotificationService:{}}));
vi.mock('../server/services/evolutionService.js', () => ({EvolutionService:{}}));
import { SupportService } from '../server/services/supportService';

function syntheticDatabase() {
  const row = {id:'conversation-a',tenantId:'tenant-a',partnerId:'partner-a',department:'SIMULATION',channel:'PORTAL'};
  return {
    supportConversation: {
      findFirst: vi.fn(async({where}:any)=>{
        if (where.id!==row.id || where.tenantId!==row.tenantId || (where.partnerId && where.partnerId!==row.partnerId)) return null;
        if(where.department?.not===row.department || where.channel?.not===row.channel)return null;
        return row;
      }),
      update: vi.fn(),
    },
    supportMessage:{create:vi.fn(),updateMany:vi.fn(),findMany:vi.fn()},
  };
}
describe('Actual support service with injected synthetic database',()=>{
  it.each([
    ['different tenant',{tenantId:'tenant-b',isPartner:false,adminRole:'MASTER'}],
    ['different partner',{tenantId:'tenant-a',isPartner:true,partnerId:'partner-b'}],
    ['restricted simulation role',{tenantId:'tenant-a',isPartner:false,adminRole:'SUPORTE'}],
  ])('rejects %s before reading or marking any messages',async(_,options)=>{
    const db=syntheticDatabase();
    expect(await SupportService.getMessages('conversation-a',options,db as any)).toBeNull();
    expect(db.supportMessage.updateMany).not.toHaveBeenCalled();
    expect(db.supportMessage.findMany).not.toHaveBeenCalled();
  });
  it('rejects a foreign partner send before any write or event',async()=>{
    const db=syntheticDatabase(),events={publish:vi.fn()};
    await expect(SupportService.sendPartnerMessage('conversation-a','partner-b','tenant-a','synthetic-user','Synthetic','Synthetic message',db as any,events as any)).rejects.toThrow('sem permissão');
    expect(db.supportMessage.create).not.toHaveBeenCalled();
    expect(db.supportConversation.update).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });
  it('keeps the partner routing ID when publishing status and assignment changes',async()=>{
    const db=syntheticDatabase(),events={publish:vi.fn()};
    db.supportConversation.update.mockResolvedValue({status:'RESOLVED',assignedUserId:null});
    await SupportService.updateConversation('conversation-a','tenant-a',{status:'RESOLVED'},db as any,events as any,'MASTER');
    expect(events.publish).toHaveBeenCalledWith(expect.objectContaining({tenantId:'tenant-a',entityId:'conversation-a',data:expect.objectContaining({partnerId:'partner-a'})}));
  });

});
