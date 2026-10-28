import { cltOutcome, cltOutcomeLabels } from './cltSimulationOutcome';
import type { JourneySnapshot } from '../../server/services/cltJourneyService';
export type { JourneySnapshot, JourneyBank, JourneyProvider } from '../../server/services/cltJourneyService';

export function journeyStatus(result: JourneySnapshot['results'][string]) {
  const offers = result.rows.filter(row => row.state === 'OFFER');
  if (offers.length) return 'Ofertas disponíveis';
  if (result.status === 'UNKNOWN') return 'Resultado incerto · conferir no banco';
  if (result.status === 'QUERYING') return result.stage === 'SIMULATION' ? 'Simulando condições' : result.stage === 'MARGIN' ? 'Consultando margem' : result.stage==='CONSENT'?'Solicitando autorização':'Consultando autorização';
  if (result.rows.some(row=>(row.data as any)?.authorization?.status==='WAITING_OTP')) return 'Aguardando SMS/OTP';
  if (result.rows.some(row=>(row.data as any)?.authorization?.status==='REQUESTED')) return 'Solicitação enviada';
  if(result.rows.some(row=>(row.data as any)?.authorization?.status==='UNCONFIRMED'))return 'Estado não confirmado';
  if(result.rows.some(row=>(row.data as any)?.authorization?.status==='EXPIRED'))return 'Autorização expirada';
  if (result.status === 'ERROR') return 'Erro na consulta';
  if (result.status === 'CONTEXTUAL') return 'Ação específica necessária';
  if(result.rows.length&&result.rows.every(row=>(row.data as any)?.authorization?.status==='REJECTED'))return 'Autorização recusada';
  if(result.rows.length&&result.rows.every(row=>row.outcome==='INELIGIBLE'))return 'Cliente não elegível';
  if(result.rows.some(row=>row.state==='DATA'&&((row.data as any)?.margin?.can_continue===true||(row.data as any)?.authorization?.ready===true)))return 'Autorizado · margem disponível';
  if (result.rows.some(row => row.state === 'DATA')) return 'Dados disponíveis';
  if (result.rows.length) return cltOutcomeLabels[cltOutcome(result.rows[0])];
  if (result.contractPending) return 'Pendência contratual';
  return 'Sem ofertas';
}
export function cltInstitutionProgress(row:any){const a=row.data?.authorization;if(row.data?.writeUncertain)return 'Resultado incerto · atualizar estado';if(row.state==='OFFER')return 'Ofertas disponíveis';if(a?.status==='UNCONFIRMED')return 'Estado não confirmado';if(a?.status==='EXPIRED')return 'Autorização expirada';if(a?.status==='WAITING_OTP')return 'Aguardando SMS/OTP';if(a?.status==='REQUESTED')return 'Solicitação enviada · aguardando aceite';if(row.outcome==='INELIGIBLE')return 'Cliente não elegível';if(row.state==='DATA'&&row.data?.margin?.can_continue===true)return 'Autorizado · margem disponível';if(a?.status==='APPROVED'||a?.status==='AUTHORIZED')return 'Autorização aprovada';if(a?.status==='REJECTED')return 'Autorização recusada';return cltOutcomeLabels[cltOutcome(row)];}

export async function readJourneyStream(response: Response, update: (snapshot: JourneySnapshot) => void) {
  if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || 'Não foi possível iniciar a consulta.'); }
  if (!response.body) throw new Error('Acompanhamento indisponível. Confira a execução antes de repetir.');
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = '', received = false;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      if (buffer.length > 4000000) throw new Error('Resposta excedeu o limite de acompanhamento. Confira o estado antes de repetir.');
      const lines = buffer.split('\n'); buffer = lines.pop() || '';
      for (const line of lines) if (line.trim()) { update(JSON.parse(line)); received = true; }
      if (done) break;
    }
    if (buffer.trim()) { update(JSON.parse(buffer)); received = true; }
    if (!received) throw new Error('Nenhum retorno recebido. Confira o estado antes de repetir.');
  } finally { reader.releaseLock(); }
}
