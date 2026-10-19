import rules from '../data/portabilityRules20261019.json';

export const PORTABILITY_SECTIONS = rules.flatMap(rule => {
 const groups: Record<string,string[][]> = { 'Idade, benefício e formalização':[], 'Bancos de origem e parcelas pagas':[], 'Valores e taxas':[], 'Operação e restrições':[] };
 let group='Operação e restrições';
 for(const row of rule.fields){
  const label=row[0].normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if(/formalizacao|limite de idade|regra especie|^regra \d|^exemplo/.test(label))group='Idade, benefício e formalização';
  else if(/regra bancos|bancos nao permitidos|bancos correspondentes|bancos de rede|demais bancos|parcelas pagas|^pan|^agibank|^facta|^bmg|^c6|^ole|^outros|^daycoval|^nbc|^bancos especificos/.test(label))group='Bancos de origem e parcelas pagas';
  else if(/taxa|parcela minima|saldo minimo|minimo liberado|^r\$|^portabilidade pura|^portabilidade \+ refin/.test(label))group='Valores e taxas';
  else if(/ordem de pagamento|faz portabilidade|reducao|margem|unificar|consulta srcc/.test(label))group='Operação e restrições';
  groups[group].push(row);
 }
 return Object.entries(groups).filter(([,rows])=>rows.length).map(([category,rows],index)=>({
 id: `${rule.id}-portability-20261019-${index}`, bankId: rule.id,
 title: `Portabilidade · ${category}`, page: 0,
 topics: ['Portabilidade', 'Idade e benefício', 'Valores e prazos', 'Restrições e exceções'],
 paragraphs: [
  'Atualização fornecida pela empresa em 19/10/2026. Para portabilidade, esta transcrição substitui critérios conflitantes dos resumos anteriores; regras de outras modalidades permanecem separadas.',
  ...(rule.id === 'finanto' ? ['Atenção: o trecho termina na taxa da portabilidade. Taxa do refin e mínimos financeiros não foram informados.'] : []),
  ...(rule.id === 'happy' ? ['Atenção: as tabelas de saldo a 1,75% e 1,71% divergem da faixa geral do refin (1,77% a 1,85%). Confirme o enquadramento comercial.'] : []),
  ...(rule.id === 'digio' ? ['Atenção: a transcrição informa espécies 32 e 93. A espécie 93 foi preservada como recebida, sem substituição por 92.'] : []),
 ],
 tables: [{ kind: 'table', rows: [['Critério', 'Regra e exceções'], ...rows] }],
 partnerSafe: true, isGuide: true,
}));
});

export const PORTABILITY_BOOKS = rules.map(rule => ({
 id: rule.id, bankId: rule.id, name: rule.name, version: rule.version, receivedAt: rule.receivedAt,
 source: rule.source, sourceFile: rule.sourceFile, text: rule.fields.map(([label,value])=>`${label}: ${value.replace(/\n/g,' ')}`).join('\n'),
}));
