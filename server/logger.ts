import pino from 'pino';

// Extend Express Request interface to include typed requestId and startTime
declare global {
  namespace Express {
    interface Request {
      requestId: string;
      startTime?: number;
    }
  }
}

// Pino Logger with automatic PII and secret redaction
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
  base: {
    service: 'sentinel-consig',
  },
  redact: {
    paths: [
      'password',
      'passwd',
      'token',
      'accessToken',
      'refreshToken',
      'authorization',
      'cookie',
      'set-cookie',
      'DATABASE_URL',
      'DIRECT_URL',
      'connectionString',
      'secret',
      'apiKey',
      'cpf',
      'telefone',
      'email',
      '*.password',
      '*.token',
      '*.authorization',
      '*.cookie',
      '*.DATABASE_URL',
      '*.secret',
      '*.cpf',
      'req.headers.authorization',
      'req.headers.cookie',
    ],
    censor: '[REDACTED]',
  },
});

export default logger;
