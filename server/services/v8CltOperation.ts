import { CltJourneyStore, journeyFingerprint, type JourneyRecord } from './cltJourneyStore.js';
import type { ProductSimulationRow } from './productSimulationService.js';

// The stable intent, not a request UUID, is the authority for every bank write.
export async function v8CltOperation(db: any, tenant: string, promoter: string, intent: unknown, execute: () => Promise<ProductSimulationRow[]>, audit?: unknown) {
  const fingerprint = journeyFingerprint(['v8-operation', promoter, intent]), id = `v8-operation:${fingerprint}`;
  const store = new CltJourneyStore(db, tenant, `bank:v8:${promoter}`);
  const prior = await store.read(id);
  if (prior?.record.phase === 'DONE') return prior.record.snapshot.results.v8.rows.map(row => row.state === 'OFFER' ? { ...row, message: 'Resultado recuperado, sem novo POST. Confira a validade da oferta com o banco.', data: { ...(row.data as any), v8: { ...(row.data as any)?.v8, cached: true } } } : row);
  if (prior) throw Object.assign(Error('V8_OPERATION_UNCERTAIN'),{writeUncertain:true});
  const record: JourneyRecord = { fingerprint, phase: 'READY', deadline: Date.now() + 50000, snapshot: { executionId: id, running: true, banks: [], results: { v8: { status: 'QUERYING', rows: [] } } } };
  // Evidence remains encrypted and is committed before the provider write.
  if (audit) (record as JourneyRecord & { audit: unknown }).audit = audit;
  await store.create(id, record);
  const saved = await store.read(id);
  if (!saved || saved.record.phase !== 'READY') throw Object.assign(Error('V8_OPERATION_UNCERTAIN'),{writeUncertain:true});
  record.phase = 'RUNNING';
  const raw = await store.compareAndSet(id, saved.raw, record);
  try {
    const rows = await execute();
    record.phase = 'DONE'; record.snapshot.running = false; record.snapshot.results.v8 = { status: 'RETURNED', rows };
    await store.compareAndSet(id, raw, record);
    return rows;
  } catch (error) {
    record.phase = 'UNKNOWN'; record.snapshot.running = false;
    await store.compareAndSet(id, raw, record).catch(() => {});
    throw Object.assign(error instanceof Error?error:Error('V8_OPERATION_UNCERTAIN'),{writeUncertain:true});
  }
}
