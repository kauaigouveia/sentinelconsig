import participants from '../data/strParticipants.json';
export const STR_PARTICIPANTS = participants;
const clean = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
export function searchInstitutions(query: string) {
  const term = clean(query.trim()); return participants.filter(bank => clean(`${bank.code} ${bank.name}`).includes(term));
}
export function normalizeInstitutionCode(value: string) {
  const code = value.trim(); return /^\d{1,3}$/.test(code) && Number(code) > 0 ? code.padStart(3, '0') : '';
}
export function resolveInstitutionCode(value: string) {
  const normalized = value.trim().toLocaleLowerCase('pt-BR');
  const match = participants.find(bank => `${bank.code} - ${bank.name}`.toLocaleLowerCase('pt-BR') === normalized || bank.name.toLocaleLowerCase('pt-BR') === normalized);
  return match?.code || normalizeInstitutionCode(value);
}
export function institutionLabel(code: string) {
  const bank = participants.find(bank => bank.code === normalizeInstitutionCode(code));
  return bank ? `${bank.code} - ${bank.name}` : code;
}
