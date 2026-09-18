const http = require('http');

const data = JSON.stringify({
  rows: [
    { name: 'TESTE LOTE 1', type: 'CONSIGNADO', action: 'CREATE' },
    { name: 'TESTE LOTE PORT', type: 'PORTABILIDADE', action: 'CREATE' }
  ]
});

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/import/products',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Body:', body);
  });
});

req.on('error', (e) => {
  console.error(e);
});

req.write(data);
req.end();
