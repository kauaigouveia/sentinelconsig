const backend = require('../dist/server.cjs');

// Vercel espera um handler (Express app ou function)
// Extraímos o default ou a propriedade app dependendo de como o esbuild empacotou
module.exports = backend.default || backend.app || backend;
