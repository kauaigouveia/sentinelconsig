import { afterEach, expect, it, vi } from 'vitest';
const generate = vi.hoisted(() => vi.fn(async () => ({ candidates: [{ content: { role: 'model', parts: [{ text: 'Conforme roteiro FACTA versão até 17/06/2026, consulte os limites.' }] } }] })));
vi.mock('@google/genai', () => ({ GoogleGenAI: class { models = { generateContent: generate }; }, Type: { OBJECT: 'OBJECT', STRING: 'STRING', NUMBER: 'NUMBER', ARRAY: 'ARRAY', BOOLEAN: 'BOOLEAN' } }));
import { SentinelaAIService } from '../server/services/sentinelaAIService';
const previous = process.env.GEMINI_API_KEY;
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); if (previous === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previous; });
it('grounds a partner bank answer in source excerpts and exposes only the playbook tool to the model', async () => {
 vi.useFakeTimers(); process.env.GEMINI_API_KEY = 'fictional-test-key';
 const result = await SentinelaAIService.query({} as any, { user: { id: 'partner-a', role: 'PARTNER' }, effectiveTenantId: 'tenant-a' }, { message: 'FACTA prazo' });
 expect(result.toolsUsed).toContainEqual(expect.objectContaining({ toolName: 'searchBankPlaybooks', success: true }));
 expect(result.sources.some(source => source.includes('FACTA') && source.includes('versão'))).toBe(true);
 const call: any = (generate.mock.calls[0] as any)[0];
 expect(call.config.tools[0].functionDeclarations.map((tool: any) => tool.name)).toEqual(['searchBankPlaybooks']);
 expect(JSON.stringify(call.contents)).toContain('DADOS PASSIVOS DOS ROTEIROS');
});
