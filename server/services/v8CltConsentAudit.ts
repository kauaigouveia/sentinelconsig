import { CltJourneyStore, journeyFingerprint, type JourneyRecord } from './cltJourneyStore.js';

export class V8CltConsentAudit {
  static id(promoter: string, cpf: string, consult: string) { return journeyFingerprint(['v8-consent-evidence', promoter, cpf, consult]); }
  static async recorded(db: any, tenant: string, promoter: string, cpf: string, consult: string) {
    const saved = await new CltJourneyStore(db, tenant, 'bank:v8-consent-evidence').read(this.id(promoter, cpf, consult));
    return saved?.record.phase === 'DONE';
  }
  static async record(db: any, tenant: string, promoter: string, cpf: string, consult: string, evidence: unknown) {
    const id = this.id(promoter, cpf, consult), store = new CltJourneyStore(db, tenant, 'bank:v8-consent-evidence');
    const record: JourneyRecord = { fingerprint: id, phase: 'DONE', deadline: Date.now(), snapshot: { executionId: id, running: false, banks: [], results: { v8: { status: 'RETURNED', rows: [{ provider: 'V8 DIGITAL', institution: 'V8', state: 'PENDING', data: { consentRecorded: true } }] } } } };
    (record as JourneyRecord & { audit: unknown }).audit = evidence;
    await store.create(id, record);
  }
}
