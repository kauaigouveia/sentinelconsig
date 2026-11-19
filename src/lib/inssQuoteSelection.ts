/**
 * Mantém seleções independentes de portabilidade por contrato de origem.
 *
 * Uma unificação é uma única cotação que ocupa de 2 a 3 contratos. Selecionar
 * outra oferta só substitui as cotações que compartilham algum contrato; nunca
 * remove propostas de contratos que não participam daquele grupo.
 */
type QuoteContract = { originLenderCode?:string; originContractNumber?:string };
export type SelectableInssQuote = {
  contractLabel?:string; unified?:boolean;
  sourceContracts?:readonly QuoteContract[];
  sourceForm?:QuoteContract;
};
const key=(contract:QuoteContract|undefined):string =>
  contract?.originLenderCode && contract.originContractNumber
    ? String(contract.originLenderCode).trim()+':'+String(contract.originContractNumber).trim() : '';
export function inssQuoteCoveredContracts(row:SelectableInssQuote):string[]{
  const contracts=(row.sourceContracts?.length ? row.sourceContracts : row.sourceForm ? [row.sourceForm] : []);
  const explicit=[...new Set(contracts.map(key).filter(Boolean))];
  if(explicit.length)return explicit;
  // Compatibilidade com cotações antigas que só possuem "Contrato 1" no rótulo.
  const label=String(row.contractLabel||'');
  if(row.unified) {
    const groups=label.match(/contratos?\s+([0-9]+(?:\s*\+\s*[0-9]+)*)/i)
      || label.match(/unifica(?:ção|cao)\s+([0-9]+(?:\s*\+\s*[0-9]+)*)/i);
    return groups ? groups[1].split('+').map(n=>'#'+n.trim()) : [];
  }
  const individual=label.match(/^Contrato\s+(\d+)/i);
  return individual?['#'+individual[1]]:[];
}
function collides(a:SelectableInssQuote,b:SelectableInssQuote):boolean{
  const left=inssQuoteCoveredContracts(a),right=inssQuoteCoveredContracts(b);
  // A origem pode estar ausente em cotações antigas; usa o grupo de tela como fallback.
  if(!left.length || !right.length) return Boolean(a.unified || b.unified)
    ? a.contractLabel===b.contractLabel
    : Boolean(a.contractLabel && a.contractLabel===b.contractLabel);
  return left.some(contract=>right.includes(contract));
}
export function toggleInssQuoteSelection<T extends SelectableInssQuote>(
  selected:readonly T[],row:T,
):T[]{
  // Desmarcar exatamente a mesma cotação não altera as outras.
  if(selected.includes(row))return selected.filter(item=>item!==row);
  // Unificações não se somam às ofertas dos contratos que já cobrem.
  // Contratos de outros bancos / outros grupos permanecem selecionados.
  return [...selected.filter(item=>!collides(item,row)),row];
}
