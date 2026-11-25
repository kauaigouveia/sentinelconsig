import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import {createTenantLogoStore,LogoStorageLimitError} from '../server/services/tenantLogoStore';
import type {PrismaClient} from '@prisma/client';
import request from 'supertest';
import { classifyLogoUploadFailure, parseTenantLogoUpload, registerTenantLogoRoutes } from '../server/services/tenantLogoRoutes';

const PNG = (() => {
  const buffer = Buffer.alloc(33);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(buffer);
  buffer.writeUInt32BE(13, 8);
  buffer.write('IHDR', 12, 4, 'ascii');
  buffer.writeUInt32BE(1, 16);
  buffer.writeUInt32BE(1, 20);
  return buffer;
})();
const IMAGE = `data:image/png;base64,${PNG.toString('base64')}`;
const UPLOAD = { fileBase64: IMAGE, mimeType: 'image/png', fileName: '../../malicious.svg', targetTenantId: 'tenant-a' };

function fixture(user: null | { role: string; tenantId?: string | null; effectiveTenantId?: string | null } = { role: 'MASTER', tenantId: 'tenant-a' }) {
  const upload = vi.fn().mockResolvedValue(undefined);
  const download = vi.fn().mockResolvedValue({ buffer: PNG, contentType: 'image/png' });
  const tenantExists = vi.fn().mockResolvedValue(true);
  const app = express();
  app.use(express.json({ limit: '4mb' }));
  registerTenantLogoRoutes(app, {
    getAuthSession: async () => user ? {
      user: { id: 'user-a', role: user.role, tenantId: user.tenantId },
      effectiveTenantId: user.effectiveTenantId,
    } : null,
    tenantExists, upload, download,
  });
  return { app, upload, download, tenantExists };
}

describe('White-Label tenant logo upload and public serving', () => {
  it('classifies storage failures without logging keys or raw provider messages', () => {
    expect(classifyLogoUploadFailure({ statusCode: 403, code: 'AuthorizationPermissionMismatch', message: 'secret-key' }))
      .toEqual({ category: 'credentials_or_permissions', status: 403, providerCode: 'AuthorizationPermissionMismatch' });
    expect(classifyLogoUploadFailure({ statusCode: 404, details: { errorCode: 'ContainerNotFound' } }).category)
      .toBe('storage_resource_missing');
    expect(classifyLogoUploadFailure({ code: 'ETIMEDOUT', message: 'Authorization: secret-key' }).category)
      .toBe('network');
    expect(JSON.stringify(classifyLogoUploadFailure({ message: 'Authorization: secret-key' })))
      .not.toContain('secret-key');
  });
  it('rejects uploads from visitors and unauthorized operators', async () => {
    const unauthed = fixture(null);
    const res = await request(unauthed.app).post('/api/upload/logo').send(UPLOAD);
    expect(res.status).toBe(401);
    expect(unauthed.upload).not.toHaveBeenCalled();

    const operator = fixture({ role: 'DIGITADOR', tenantId: 'tenant-a' });
    const forbidden = await request(operator.app).post('/api/upload/logo').send(UPLOAD);
    expect(forbidden.status).toBe(403);
    expect(operator.upload).not.toHaveBeenCalled();
  });

  it('fails closed for tenant spoofing or deleted/unknown tenants', async () => {
    const fixtureA = fixture();
    expect((await request(fixtureA.app).post('/api/upload/logo').send({ ...UPLOAD, targetTenantId: 'tenant-b' })).status).toBe(403);
    expect(fixtureA.tenantExists).not.toHaveBeenCalled();
    expect(fixtureA.upload).not.toHaveBeenCalled();

    fixtureA.tenantExists.mockResolvedValue(false);
    const notFound = await request(fixtureA.app).post('/api/upload/logo').send(UPLOAD);
    expect(notFound.status).toBe(404);
    expect(fixtureA.upload).not.toHaveBeenCalled();
  });

  it('supports active-tenant sessions for administrators, and explicit selection by PLATFORM_MASTER only', async () => {
    const master = fixture({ role: 'MASTER', tenantId: 'tenant-b', effectiveTenantId: 'tenant-a' });
    expect((await request(master.app).post('/api/upload/logo').send(UPLOAD)).status).toBe(201);
    const platform = fixture({ role: 'PLATFORM_MASTER', tenantId: null });
    expect((await request(platform.app).post('/api/upload/logo').send({ ...UPLOAD, targetTenantId: 'tenant-a' })).status).toBe(201);
    expect(platform.tenantExists).toHaveBeenCalledWith('tenant-a');
  });

  it('uploads PNG into a tenant-scoped Azure path and serves the exact stored path', async () => {
    const { app, upload, download } = fixture();
    const uploaded = await request(app).post('/api/upload/logo').send(UPLOAD);
    expect(uploaded.status).toBe(201);
    expect(uploaded.body.logoUrl).toMatch(/^\/api\/public\/logos\/tenant-a\/\d{13}_[0-9a-f-]{36}\.png$/);
    expect(upload).toHaveBeenCalledTimes(1);
    const [blobPath, data, mime] = upload.mock.calls[0];
    expect(blobPath).toBe(uploaded.body.logoUrl.replace('/api/public/', ''));
    expect(blobPath).not.toContain('malicious.svg');
    expect(data).toEqual(PNG);
    expect(mime).toBe('image/png');
    const image = await request(app).get(uploaded.body.logoUrl);
    expect(image.status).toBe(200);
    expect(image.headers['content-type']).toContain('image/png');
    expect(image.headers['cache-control']).toContain('immutable');
    expect(download).toHaveBeenCalledWith(blobPath);
  });

  it('rejects invalid content type, HTML renamed to PNG, malformed Base64 and files over 2 MB', async () => {
    const bad = [
      { ...UPLOAD, mimeType: 'image/svg+xml' },
      { ...UPLOAD, fileBase64: `data:image/png;base64,${Buffer.from('<svg/>').toString('base64')}` },
      { ...UPLOAD, fileBase64: 'data:image/png;base64,%%%%' },
      { ...UPLOAD, fileBase64: `data:image/png;base64,${Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64')}` },
    ];
    for (const payload of bad) {
      const f = fixture();
      const response = await request(f.app).post('/api/upload/logo').send(payload);
      expect(response.status).toBe(400);
      expect(f.upload).not.toHaveBeenCalled();
    }
  });

  it('rejects traversal and unknown filenames on public logo routes', async () => {
    const f = fixture();
    const badPaths = [
      '/api/public/logos/tenant-a/arbitrary.svg',
      '/api/public/logos/tenant-a/logo.png',
      '/api/public/logos/tenant-b/../../secret',
    ];
    for (const url of badPaths) {
      const res = await request(f.app).get(url);
      expect(res.status).toBe(404);
    }
    expect(f.download).not.toHaveBeenCalled();
  });

  it('does not reveal storage-provider errors to the browser', async () => {
    const f = fixture();
    f.upload.mockRejectedValue(new Error('secret Azure connection string'));
    const res = await request(f.app).post('/api/upload/logo').send(UPLOAD);
    expect(res.status).toBe(503);
    expect(JSON.stringify(res.body)).not.toContain('Azure');
    expect(JSON.stringify(res.body)).not.toContain('connection string');
  });

  it('parses supported signatures and rejects header MIME conflicts', () => {
    const p = parseTenantLogoUpload(UPLOAD);
    expect(p.ok).toBe(true);
    expect(parseTenantLogoUpload({ fileBase64: IMAGE, mimeType: 'image/jpeg' }).ok).toBe(false);
    const webp = Buffer.from('RIFF1234WEBPVP8 ', 'ascii');
    expect(parseTenantLogoUpload({ fileBase64: `data:image/webp;base64,${webp.toString('base64')}`, mimeType: 'image/webp' }).ok).toBe(true);
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a]);
    expect(parseTenantLogoUpload({ fileBase64: `data:image/jpeg;base64,${jpeg.toString('base64')}`, mimeType: 'image/jpeg' }).ok).toBe(true);
  });
});

describe('Persistent PostgreSQL branding storage',()=>{
  function database(){
    const rows=new Map<string,{id:string;tenantId:string;configKey:string;configValue:string;updatedAt:Date}>();
    const labels=new Map<string,{logoUrl:string|null;faviconUrl:string|null}>();
    const index=(tenantId:string,configKey:string)=>tenantId+'|'+configKey;
    const db:any={
      tenant:{findFirst:vi.fn(async ({where}:any)=>({id:where.id,whiteLabel:labels.get(where.id)||null}))},
      systemConfig:{
        findUnique:vi.fn(async ({where}:any)=>rows.get(index(where.tenantId_configKey.tenantId,where.tenantId_configKey.configKey))||null),
        findFirst:vi.fn(async ({where}:any)=>rows.get(index(where.tenantId,where.configKey))||null),
        count:vi.fn(async ({where}:any)=>[...rows.values()].filter(r=>r.tenantId===where.tenantId&&r.configKey.startsWith(where.configKey.startsWith)).length),
        deleteMany:vi.fn(async ({where}:any)=>{for(const [k,r] of rows)if(r.tenantId===where.tenantId&&r.configKey.startsWith(where.configKey.startsWith)&&!where.configKey.notIn.includes(r.configKey)&&r.updatedAt<where.updatedAt.lt)rows.delete(k);}),
        upsert:vi.fn(async ({create}:any)=>rows.set(index(create.tenantId,create.configKey),{...create,id:index(create.tenantId,create.configKey),updatedAt:new Date()})),
      },
    };
    db.$transaction=vi.fn(async (fn:any)=>fn(db));
    return {db:db as PrismaClient,rows,labels};
  }
  it('persists and serves logos without Azure, validates hash and isolates tenants',async()=>{
    const {db,rows}=database();
    const store=createTenantLogoStore(db);
    const legacyUpload=vi.fn().mockRejectedValue(Object.assign(Error('DNS failure'),{code:'ENOTFOUND'}));
    const legacyDownload=vi.fn().mockResolvedValue({buffer:PNG,contentType:'image/png'});
    const app=express();app.use(express.json({limit:'4mb'}));
    registerTenantLogoRoutes(app,{getAuthSession:async()=>({user:{role:'PLATFORM_MASTER'}}),tenantExists:async()=>true,logoStore:store,upload:legacyUpload,download:legacyDownload});
    const uploaded=await request(app).post('/api/upload/logo').send(UPLOAD);
    expect(uploaded.status).toBe(201);
    expect(uploaded.body.logoUrl).toMatch(/^\/api\/public\/logos\/tenant-a\/db_[a-f0-9]{64}\.png$/);
    const image=await request(app).get(uploaded.body.logoUrl);
    expect(image.status).toBe(200);expect(image.body).toEqual(PNG);
    expect(legacyUpload).not.toHaveBeenCalled();expect(legacyDownload).not.toHaveBeenCalled();
    expect((await request(app).get(uploaded.body.logoUrl.replace('tenant-a','tenant-b'))).status).toBe(404);
    expect((await request(app).post('/api/upload/logo').send(UPLOAD)).body.logoUrl).toBe(uploaded.body.logoUrl);
    expect(rows.size).toBe(1);
    const stored=[...rows.values()][0];stored.configValue=Buffer.from('corrupt').toString('base64');
    expect((await request(app).get(uploaded.body.logoUrl)).status).toBe(404);
    expect((await request(app).get('/api/public/logos/tenant-a/1795629100000_12345678-1234-1234-1234-123456789012.png')).status).toBe(200);
    expect(legacyDownload).toHaveBeenCalledTimes(1);
  });
  it('preserves the saved logo, expires abandoned drafts, and bounds storage',async()=>{
    const {db,rows,labels}=database();const store=createTenantLogoStore(db);
    const first=await store.upload('tenant-a',PNG,'image/png');
    labels.set('tenant-a',{logoUrl:'/api/public/logos/tenant-a/'+first,faviconUrl:null});
    const draft=await store.upload('tenant-a',Buffer.concat([PNG,Buffer.from('draft')]),'image/png');
    for(const row of rows.values())row.updatedAt=new Date(0);
    await store.upload('tenant-a',Buffer.concat([PNG,Buffer.from('new')]),'image/png');
    expect(await store.download('tenant-a',first)).not.toBeNull();
    expect(await store.download('tenant-a',draft)).toBeNull();
    for(let i=0;i<18;i++)await store.upload('tenant-a',Buffer.concat([PNG,Buffer.from('test'+i)]),'image/png');
    await expect(store.upload('tenant-a',Buffer.concat([PNG,Buffer.from('limit')]),'image/png')).rejects.toBeInstanceOf(LogoStorageLimitError);
    expect(rows.size).toBe(20);
  });
});
