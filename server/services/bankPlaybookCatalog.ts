import type { Express, Request } from 'express';
import type { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { hasPermission } from '../../src/lib/permissions.js';
import { BANK_PLAYBOOKS, PORTABILITY_PLAYBOOKS } from '../../src/lib/bankPlaybooks.js';
const prefix = 'BANK_PLAYBOOK_CUSTOM_';
export async function customPlaybooks(db: PrismaClient, tenantId: string) {
 const rows = await db.systemConfig.findMany({ where: { tenantId, configKey: { startsWith: prefix } } });
 return rows.flatMap(row => { try { const value = JSON.parse(row.configValue); return !value || value.active === false || !['id','name','version','text','source','receivedAt'].every(key => typeof value[key] === 'string') ? [] : [value]; } catch { return []; } });
}
export function registerBankPlaybookCatalog(app: Express, db: PrismaClient, getSession: (req: Request) => Promise<any>) {
 async function access(req: Request, write = false) {
  const session = await getSession(req);
  if (!session?.user || !session.effectiveTenantId) return null;
  const role = session.activeRole || session.user.role;
  if (write ? !['MASTER','PLATFORM_MASTER','ADMIN'].includes(role) : !hasPermission(role, session.activePermissions || session.user.customPermissions, 'simulations.view')) return null;
  return session;
 }
 app.get('/api/bank-playbooks', async (req,res) => {
  res.setHeader('Cache-Control','no-store');
  try { const session = await access(req); if (!session) return res.status(403).json({error:'Sem acesso aos roteiros.'});
   return res.json({ rows: [...BANK_PLAYBOOKS, ...PORTABILITY_PLAYBOOKS, ...await customPlaybooks(db, session.effectiveTenantId)], canEdit: ['MASTER','PLATFORM_MASTER','ADMIN'].includes(session.activeRole || session.user.role) });
  } catch { return res.status(500).json({error:'Não foi possível carregar os roteiros.'}); }
 });
 app.post('/api/bank-playbooks', async (req,res) => {
  res.setHeader('Cache-Control','no-store');
  try { const session = await access(req,true); if (!session) return res.status(403).json({error:'Somente administradores podem cadastrar roteiros.'});
   const raw = req.body || {};
   if (typeof raw.name !== 'string' || !raw.name.trim() || raw.name.length > 150 || typeof raw.version !== 'string' || !raw.version.trim() || raw.version.length > 100 || typeof raw.text !== 'string' || !raw.text.trim() || raw.text.length > 100000) return res.status(400).json({error:'Informe banco/título, versão e conteúdo (até 100.000 caracteres).'});
   const id = typeof raw.id === 'string' && /^custom-[a-f0-9-]{36}$/.test(raw.id) ? raw.id : `custom-${randomUUID()}`;
   const bankId = typeof raw.bankId==='string' && /^[a-z0-9-]{1,100}$/.test(raw.bankId) ? raw.bankId : undefined;
   const row = { id, ...(bankId?{bankId}:{}), name: raw.name.trim(), version: raw.version.trim(), text: raw.text.trim(), source: String(raw.source || 'Cadastro interno').slice(0,250), sourceFile: String(raw.sourceFile || '').slice(0,250), receivedAt: new Date().toISOString().slice(0,10), active: true };
   await db.systemConfig.upsert({where:{tenantId_configKey:{tenantId:session.effectiveTenantId,configKey:prefix+id}},create:{tenantId:session.effectiveTenantId,configKey:prefix+id,configValue:JSON.stringify(row)},update:{configValue:JSON.stringify(row)}});
   return res.json({row});
  } catch { return res.status(500).json({error:'Não foi possível salvar o roteiro.'}); }
 });
}
