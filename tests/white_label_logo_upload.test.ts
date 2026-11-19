import { describe, expect, it, vi } from 'vitest';
import express from 'express';
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
