const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

const importProductsEndpoint = `
  // 2.5 POST /api/import/products - Bulk products imports (Synchronous)
  app.post('/api/import/products', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      const tenantId = session?.effectiveTenantId || session?.user?.tenantId;
      if (!session || !session.user || !tenantId) {
        return res.status(401).json({ error: 'Autenticação necessária para importar produtos.' });
      }

      if (session.user.role !== 'PLATFORM_MASTER' && session.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Você não tem permissão para gerenciar produtos.' });
      }

      const { rows } = req.body || {};
      if (!rows || !Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: 'Nenhum registro fornecido.' });
      }

      let createdCount = 0;
      let updatedCount = 0;
      let ignoredCount = 0;
      let errorCount = 0;
      let errors = [];

      // Execute within a transaction for safety if possible, or sequentially to handle duplicates gracefully
      for (const row of rows) {
        try {
          const { name, type, action } = row;
          if (!name) {
            errorCount++;
            errors.push({ name: 'Desconhecido', error: 'Nome não fornecido' });
            continue;
          }

          const code = \`prod-\${name.replace(/\\s+/g, '-').toLowerCase()}\`;

          const existingProduct = await prisma.product.findFirst({
            where: { tenantId, name }
          });

          if (existingProduct) {
            if (action === 'UPDATE') {
              await prisma.product.update({
                where: { id: existingProduct.id },
                data: { type: type || existingProduct.type }
              });
              updatedCount++;
            } else {
              ignoredCount++;
            }
          } else {
            await prisma.product.create({
              data: {
                tenantId,
                name,
                code,
                type: type || 'NOVO',
                active: true,
              }
            });
            createdCount++;
          }
        } catch (err: any) {
          errorCount++;
          errors.push({ name: row.name, error: err.message });
        }
      }

      return res.json({
        success: true,
        summary: {
          total: rows.length,
          created: createdCount,
          updated: updatedCount,
          ignored: ignoredCount,
          errors: errorCount,
          errorDetails: errors
        }
      });

    } catch (error: any) {
      console.error('[IMPORT PRODUCTS ERROR]', error);
      return res.status(500).json({ error: 'Erro interno ao importar produtos.' });
    }
  });
`;

content = content.replace(
  `// 3. POST /api/import/partners - Bulk partner imports`,
  importProductsEndpoint + `\n  // 3. POST /api/import/partners - Bulk partner imports`
);

fs.writeFileSync('server.ts', content);
