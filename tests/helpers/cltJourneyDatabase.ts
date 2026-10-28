// A serialized transactional mock; real PostgreSQL validation is reported separately.
export function journeyDatabase() {
  const rows: any[] = [];
  const systemConfig = {
    findMany: async ({where,take}:any) => rows.filter(r=>r.tenantId===where.tenantId&&(!where.configKey?.startsWith||r.configKey.startsWith(where.configKey.startsWith))).slice(0,take||rows.length),
    upsert: async ({where,create,update}:any) => {const found=rows.find(r=>r.tenantId===where.tenantId_configKey.tenantId&&r.configKey===where.tenantId_configKey.configKey);if(found){Object.assign(found,update);return found;}const row={...create};rows.push(row);return row;},
    findUnique: async ({ where }: any) => rows.find(r => r.tenantId === where.tenantId_configKey.tenantId && r.configKey === where.tenantId_configKey.configKey) || null,
    create: async ({ data }: any) => {
      if (rows.some(r => r.tenantId === data.tenantId && r.configKey === data.configKey)) throw Object.assign(Error('unique'), { code: 'P2002' });
      rows.push({ ...data }); return { ...data };
    },
    updateMany: async ({ where, data }: any) => {
      const row = rows.find(r => r.tenantId === where.tenantId && r.configKey === where.configKey && r.configValue === where.configValue);
      if (!row) return { count: 0 }; Object.assign(row, data); return { count: 1 };
    },
  };
  let queue = Promise.resolve();
  const db = { rows, systemConfig, tenant: { findUnique: async () => ({ simulationAccessEnabled: true }) }, $transaction: (run: any) => {
    const result = queue.then(async () => {
      const before = structuredClone(rows);
      try { return await run({ systemConfig }); } catch (e) { rows.splice(0, rows.length, ...before); throw e; }
    }); queue = result.catch(() => {}); return result;
  } };
  return db;
}
