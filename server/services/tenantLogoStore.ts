import {createHash} from 'node:crypto';
import type {PrismaClient} from '@prisma/client';

const PREFIX='branding:logo:v1:';
const MAX_BYTES=2*1024*1024;
const MAX_VERSIONS=20;
const DRAFT_TTL_MS=24*60*60*1000;
export const DB_LOGO_FILE=/^db_[a-f0-9]{64}\.(png|jpg|webp)$/;
const extensions:Record<string,string>={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'};
const mimeTypes:Record<string,string>={png:'image/png',jpg:'image/jpeg',webp:'image/webp'};
export class LogoStorageLimitError extends Error {}

export interface TenantLogoStore {
  upload(tenantId:string,data:Buffer,mime:string):Promise<string>;
  download(tenantId:string,fileName:string):Promise<{buffer:Buffer;contentType:string}|null>;
}

function referencedLogoKey(tenantId:string,url:string|null|undefined):string|null {
  if(!url)return null;
  try{
    const path=new URL(url,'https://app.sentinelconsig.com.br').pathname;
    const prefix='/api/public/logos/'+tenantId+'/';
    if(!path.startsWith(prefix))return null;
    const name=path.slice(prefix.length);
    return DB_LOGO_FILE.test(name)?PREFIX+name:null;
  }catch{return null;}
}

/** Public branding assets only; no customer documents or credentials.
 * Uses the existing tenant-scoped PostgreSQL config table, without migrations.
 * Content-addressed names are immutable; current logos and favicons are retained.
 */
export function createTenantLogoStore(db:PrismaClient):TenantLogoStore {
  return {
    async upload(tenantId,data,mime){
      const ext=extensions[mime];
      if(!ext||!data.length||data.length>MAX_BYTES)throw Error('Invalid logo');
      const name='db_'+createHash('sha256').update(data).digest('hex')+'.'+ext;
      const key=PREFIX+name;
      const configValue=data.toString('base64');
      for(let attempt=0;attempt<3;attempt++){
        try{
          await db.$transaction(async tx=>{
            const active=await tx.tenant.findFirst({where:{id:tenantId,deletedAt:null},select:{id:true,whiteLabel:{select:{logoUrl:true,faviconUrl:true}}}});
            if(!active)throw Error('Tenant unavailable');
            const protectedKeys=[key,referencedLogoKey(tenantId,active.whiteLabel?.logoUrl),referencedLogoKey(tenantId,active.whiteLabel?.faviconUrl)].filter((k):k is string=>!!k);
            const cutoff=new Date(Date.now()-DRAFT_TTL_MS);
            await tx.systemConfig.deleteMany({where:{tenantId,configKey:{startsWith:PREFIX,notIn:protectedKeys},updatedAt:{lt:cutoff}}});
            const existing=await tx.systemConfig.findUnique({where:{tenantId_configKey:{tenantId,configKey:key}},select:{id:true}});
            if(!existing&&await tx.systemConfig.count({where:{tenantId,configKey:{startsWith:PREFIX}}})>=MAX_VERSIONS)throw new LogoStorageLimitError('Logo version limit');
            await tx.systemConfig.upsert({where:{tenantId_configKey:{tenantId,configKey:key}},create:{tenantId,configKey:key,configValue,isSecret:false},update:{configValue}});
          },{isolationLevel:'Serializable'});
          return name;
        }catch(err){if((err as {code?:string})?.code==='P2034'&&attempt<2)continue;throw err;}
      }
      throw Error('Logo transaction conflict');
    },
    async download(tenantId,fileName){
      if(!DB_LOGO_FILE.test(fileName))return null;
      const row=await db.systemConfig.findFirst({where:{tenantId,configKey:PREFIX+fileName,tenant:{deletedAt:null}},select:{configValue:true}});
      if(!row||row.configValue.length>Math.ceil(MAX_BYTES/3)*4)return null;
      const buffer=Buffer.from(row.configValue,'base64');
      const hash=fileName.slice(3,67);
      if(!buffer.length||buffer.length>MAX_BYTES||buffer.toString('base64')!==row.configValue||createHash('sha256').update(buffer).digest('hex')!==hash)return null;
      return {buffer,contentType:mimeTypes[fileName.split('.').pop()!]};
    },
  };
}
