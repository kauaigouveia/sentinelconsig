const fs = require('fs');

const code = `
  // -------------------------------------------------------------
  // LOGO UPLOAD & SERVING ROUTES
  // -------------------------------------------------------------

  app.post('/api/upload/logo', authRateLimiter, async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session) return res.status(401).json({ error: 'Não autenticado.' });

      const userRole = session.user?.role;
      if (userRole !== 'PLATFORM_MASTER' && userRole !== 'TENANT_ADMIN') {
        return res.status(403).json({ error: 'Sem permissão para upload de logo.' });
      }

      const { fileBase64, mimeType, fileName, targetTenantId } = req.body;
      if (!fileBase64) return res.status(400).json({ error: 'fileBase64 é obrigatório.' });

      const tenantId = (userRole === 'PLATFORM_MASTER' && targetTenantId) ? targetTenantId : session.user?.tenantId;
      if (!tenantId) return res.status(400).json({ error: 'Tenant ID não identificado.' });

      const base64Data = fileBase64.replace(/^data:.*,/, '');
      const fileBuffer = Buffer.from(base64Data, 'base64');

      if (fileBuffer.length > 2 * 1024 * 1024) {
        return res.status(400).json({ error: 'Tamanho do arquivo excede o limite de 2MB.' });
      }

      const { buildLogoBlobPath, uploadBlob } = await import('./server/services/azureBlobStorage.ts').catch(() => require('./server/services/azureBlobStorage'));
      
      const { blobPath, safeFileName } = buildLogoBlobPath(tenantId, fileName || 'logo.png');
      const detectedMime = mimeType || 'image/png';
      
      await uploadBlob(blobPath, fileBuffer, detectedMime);

      const fileUrl = \`/api/public/logos/\${tenantId}/\${safeFileName}\`;

      return res.json({ logoUrl: fileUrl, message: 'Upload concluído com sucesso.' });
    } catch (err: any) {
      console.error('[API /api/upload/logo] Error:', err);
      return res.status(500).json({ error: err.message || 'Erro ao realizar upload.' });
    }
  });

  app.get('/api/public/logos/:tenantId/:fileName', publicBrandingRateLimiter, async (req, res) => {
    try {
      const { tenantId, fileName } = req.params;
      if (!tenantId || !fileName) return res.status(400).send('Parâmetros inválidos.');

      if (tenantId.includes('/') || tenantId.includes('\\\\') || tenantId.includes('..')) {
        return res.status(403).send('Acesso negado.');
      }

      const { sanitizeFileName, downloadBlob } = await import('./server/services/azureBlobStorage.ts').catch(() => require('./server/services/azureBlobStorage'));
      const safeFileName = sanitizeFileName(fileName);
      const blobPath = \`logos/\${tenantId}/\${safeFileName}\`;

      const { buffer, contentType } = await downloadBlob(blobPath);
      
      const mime = contentType || 'image/png';
      res.setHeader('Content-Type', mime);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Content-Length', buffer.length);
      return res.send(buffer);
    } catch (err) {
      console.error('[API /api/public/logos] Error fetching logo:', err);
      return res.redirect('/branding/sentinel-consig-symbol.png');
    }
  });
`;

let content = fs.readFileSync('server.ts', 'utf8');
content = content.replace('  // -------------------------------------------------------------\n  // BACKUPS', code + '\n  // -------------------------------------------------------------\n  // BACKUPS');

fs.writeFileSync('server.ts', content);
