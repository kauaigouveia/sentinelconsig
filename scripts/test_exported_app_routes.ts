process.env.NODE_ENV = 'test';
import request from 'supertest';
import app from '../server.js';

async function testExportedAppRoutes() {
  console.log('=== TESTE DE REGISTRO DE ROTAS NO OBJETO APP EXPORTADO ===\n');

  console.log('[1/4] Testando GET /api/health no app exportado...');
  const healthRes = await request(app).get('/api/health');
  console.log('  -> Status:', healthRes.status);
  console.log('  -> Body:', healthRes.body);
  if (healthRes.status !== 200 || healthRes.body.status !== 'ok') {
    throw new Error('Falha no GET /api/health');
  }

  console.log('\n[2/4] Testando GET /api/integrations/c6/config (Sem autenticação)...');
  const c6ConfigRes = await request(app).get('/api/integrations/c6/config');
  console.log('  -> Status:', c6ConfigRes.status);
  console.log('  -> Body:', c6ConfigRes.body);
  // Deve retornar 401 (Não autenticado) e NÃO 404!
  if (c6ConfigRes.status === 401 && c6ConfigRes.body.error === 'Não autenticado.') {
    console.log('  -> SUCESSO: Rota GET /api/integrations/c6/config EXISTE e responde 401 para requisições não autenticadas!');
  } else {
    throw new Error(`Rota /api/integrations/c6/config retornou status inesperado: ${c6ConfigRes.status}`);
  }

  console.log('\n[3/4] Testando POST /api/integrations/c6/test-connection (Sem autenticação)...');
  const c6TestRes = await request(app).post('/api/integrations/c6/test-connection');
  console.log('  -> Status:', c6TestRes.status);
  console.log('  -> Body:', c6TestRes.body);
  // Deve retornar 401 (Não autenticado) e NÃO 404!
  if (c6TestRes.status === 401 && c6TestRes.body.error === 'Não autenticado.') {
    console.log('  -> SUCESSO: Rota POST /api/integrations/c6/test-connection EXISTE e responde 401!');
  } else {
    throw new Error(`Rota /api/integrations/c6/test-connection retornou status inesperado: ${c6TestRes.status}`);
  }

  console.log('\n[4/4] Testando rota inexistente /api/rota-inventada-12345 (Deve retornar 404 JSON)...');
  const notFoundRes = await request(app).get('/api/rota-inventada-12345');
  console.log('  -> Status:', notFoundRes.status);
  console.log('  -> Body:', notFoundRes.body);
  if (notFoundRes.status === 404 && notFoundRes.body.statusCode === 404 && typeof notFoundRes.body === 'object') {
    console.log('  -> SUCESSO: Rotas inexistentes retornam 404 JSON estruturado.');
  } else {
    throw new Error('Falha no tratamento de 404 JSON para rotas inexistentes');
  }

  console.log('\nTODOS OS TESTES DO OBJETO APP EXPORTADO FORAM APROVADOS COM SUCESSO!');
}

testExportedAppRoutes().catch((err) => {
  console.error('ERRO FATAL:', err);
  process.exit(1);
});
