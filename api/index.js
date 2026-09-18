import 'dotenv/config';
import 'express';
import 'cookie-parser';
import 'express-rate-limit';
import 'helmet';
import '@prisma/client';
import 'argon2';
import 'pusher';
import 'pino';
import '@azure/identity';
import '@azure/storage-blob';
import 'exceljs';
import '@google/genai';

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const backend = require('../dist/server.cjs');

// Vercel espera um handler (Express app ou function)
// Extraímos o default ou a propriedade app dependendo de como o esbuild empacotou
export default backend.default || backend.app || backend;
