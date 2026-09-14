import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const backend = require('../dist/server.cjs');

// Vercel espera um handler (Express app ou function)
// Extraímos o default ou a propriedade app dependendo de como o esbuild empacotou
export default backend.default || backend.app || backend;
