
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { app } = require('./dist/server.cjs');

async function test() {
  const req = {
    method: 'GET',
    url: '/api/health',
    headers: { host: 'localhost' },
    on: () => {},
    resume: () => {},
    socket: { remoteAddress: '127.0.0.1' }
  };
  
  const res = {
    statusCode: 0,
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(d) { 
      console.log('RESPONSE STATUS:', this.statusCode);
      console.log('RESPONSE DATA:', JSON.stringify(d, null, 2));
    },
    end: () => {}
  };

  try {
    await app(req, res);
  } catch (err) {
    console.error('HANDLER CRASHED:', err);
  }
}

test();
