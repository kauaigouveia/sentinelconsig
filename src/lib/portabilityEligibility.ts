import { normalizeInstitutionCode } from './strParticipants';
import { evaluatePortabilityPolicy, type PortabilityContext } from './portabilityPolicy';

// Creditor agreements from the company portability summary, 10/09/2026.
// Missing or conflicting agreements require review, never automatic approval.
const rules: Record<string, { blocked: string[]; paid: Record<string, number> }> = {
 daycoval: { blocked: ['336','626','422','025'], paid: {'149':24,'935':24,'121':15,'012':13,'623':12,'341':12,'070':12,'925':12,'643':6,'329':6,'306':6} },
 c6: { blocked: ['707','121','012','070','925','422'], paid: {'623':37,'254':25} },
 facta: { blocked: ['260','753','012','359','611','643'], paid: {'623':30,'707':24,'121':15,'254':15,'318':12,'033':12,'955':12} },
 happy: { blocked: ['643','012','329','306','070','925'], paid: {'336':18,'626':18,'149':12,'935':12,'623':12} },
 finanto: { blocked: ['012','329','306','422','752','380','336','626','149','935','025','643'], paid: {'033':12,'326':12,'389':12,'707':12,'254':12,'121':12,'041':1} },
 icred: { blocked: ['012','643','329','306'], paid: {'623':25,'029':25} },
 inter: { blocked: ['149','935','243','654'], paid: {} },
 diga: { blocked: ['149','935','306','012','925','643'], paid: {'336':12,'626':12,'623':12} },
 digio: { blocked: ['237','041','001'], paid: {} },
 banrisul: { blocked: [], paid: {} },
};
export function portabilityEligibility(destination: string, origin: unknown, paid: unknown, input: PortabilityContext = {}) {
 if(input.product&&input.product!=='INSS'||input.operation&&!['PORT','PORT_REFIN','PORTABILIDADE'].includes(input.operation))return {blocked:false,review:false,status:'NÃO APLICÁVEL',reason:'Política de portabilidade INSS fora do escopo da operação.'};
 const current = evaluatePortabilityPolicy(destination, origin, paid, input);
 if (current) return current;
 const key = destination.toLowerCase().replace(/[^a-z0-9]/g, '');
 const rule = rules[key];
 if (!rule) return { blocked: false, review: true, status:'PENDENTE DE DADOS', reason: 'Acordo de origem exige conferência no roteiro do banco.' };
 const code = normalizeInstitutionCode(String(origin ?? ''));
 if (!code) return { blocked: false, review: true, status:'PENDENTE DE DADOS', reason: 'Informe o banco de origem para conferir a portabilidade.' };
 if (rule.blocked.includes(code)) return { blocked: true, review: false, status:'NÃO ELEGÍVEL', reason: `${destination}: não aceita portabilidade do banco ${code} (resumo 10/09/2026).` };
 if (paid === '' || paid == null || !Number.isInteger(Number(paid)) || Number(paid) < 0) return { blocked: false, review: true, status:'PENDENTE DE DADOS', reason: 'Informe uma quantidade válida de parcelas pagas.' };
 const minimum = rule.paid[code];
 if (minimum != null && Number(paid) < minimum) return { blocked: true, review: false, status:'NÃO ELEGÍVEL', reason: `${destination}: origem ${code} exige ${minimum} parcelas pagas; informadas ${paid} (resumo 10/09/2026).` };
 return { blocked: false, review: true, status:'PENDENTE DE DADOS', reason: minimum == null ? 'Acordo não individualizado: conferir origem e pagas no roteiro antes de contratar.' : `Mínimo de ${minimum} parcelas pagas atendido. Demais condições dependem do roteiro e do banco.` };
}
export function paidFromTerms(original: unknown, remaining: unknown): number | undefined {
 if (original === '' || remaining === '' || original == null || remaining == null) return undefined;
 const total = Number(original), open = Number(remaining);
 return Number.isInteger(total) && Number.isInteger(open) && total > 0 && open > 0 && open <= total ? total - open : undefined;
}
