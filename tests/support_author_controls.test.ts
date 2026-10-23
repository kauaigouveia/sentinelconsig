import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../server/services/eventBus.js',()=>({eventBus:{publish:vi.fn()}}));
vi.mock('../server/services/evolutionService.js',()=>({EvolutionService:{}}));
vi.mock('../server/services/telegramNotificationService.js',()=>({TelegramNotificationService:{}}));
import { SupportService } from '../server/services/supportService';
let db:any,events:any;
beforeEach(()=>{
  events={publish:vi.fn()};
  db={supportConversation:{findFirst:vi.fn(async()=>({id:'c',partnerId:'p',tenantId:'t',channel:'PORTAL',department:'SUPPORT',status:'OPEN'})),update:vi.fn(async({data}:any)=>data)},
    partnerPortalAccess:{findFirst:vi.fn(async()=>({id:'portal-access',name:'Trusted portal author'}))},
    supportMessage:{create:vi.fn(async({data}:any)=>({id:'m',...data}))},user:{findFirst:vi.fn(async()=>null)}};
});
describe('Support author and assignee invariants',()=>{
  it('stores portal authors without using the internal user FK and snapshots the trusted access name',async()=>{
    const result=await SupportService.sendPartnerMessage('c','p','t','portal-access','Untrusted name','Synthetic',db,events);
    expect(db.partnerPortalAccess.findFirst).toHaveBeenCalledWith({where:{id:'portal-access',tenantId:'t',partnerId:'p',active:true},select:{id:true,name:true}});
    expect(result).toMatchObject({senderId:null,senderType:'PARTNER',senderName:'Trusted portal author'});
  });
  it('rejects an invalid portal author before business writes or events',async()=>{
    db.partnerPortalAccess.findFirst.mockResolvedValue(null);
    await expect(SupportService.sendPartnerMessage('c','p','t','wrong','Fake','Synthetic',db,events)).rejects.toThrow('autor');
    expect(db.supportMessage.create).not.toHaveBeenCalled();expect(db.supportConversation.update).not.toHaveBeenCalled();expect(events.publish).not.toHaveBeenCalled();
  });
  it.each(['PORTAL','WHATSAPP','TELEGRAM'])('rejects invalid assignees in %s before a simultaneous status update',async channel=>{
    db.supportConversation.findFirst.mockResolvedValue({channel,department:'SUPPORT'});
    await expect(SupportService.updateConversation('c','t',{assignedUserId:'foreign',status:'RESOLVED'},db,events,'MASTER')).rejects.toThrow('mesma empresa');
    expect(db.user.findFirst).toHaveBeenCalledWith({where:{id:'foreign',tenantId:'t',active:true},select:{role:true}});
    expect(db.supportConversation.update).not.toHaveBeenCalled();expect(events.publish).not.toHaveBeenCalled();
  });
  it('allows explicit unassignment without resolving a user',async()=>{
    await SupportService.updateConversation('c','t',{assignedUserId:null},db,events,'MASTER');
    expect(db.user.findFirst).not.toHaveBeenCalled();expect(db.supportConversation.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({assignedUserId:null})}));
  });
});
