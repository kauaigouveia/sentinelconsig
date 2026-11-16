import type {DaycovalWorkbook} from './daycovalWorkbook.js';
const FORMULA_SHEETS=['SIMULADOR COM SALDO','Batalha Naval (2)'] as const;
const REQUIRED_COLUMNS:Record<number,string>={0:'EMPREGADOR',5:'TAXA',6:'PRAZO',19:'minport_%'};

/** Read-only metadata diff: neither approves nor activates an unreviewed bank spreadsheet. */
export function compareDaycovalWorkbook(newBook:DaycovalWorkbook,oldBook:DaycovalWorkbook|null,approvedHashes:readonly string[]){
  const currentColumns=newBook.tables.Consulta1?.columns||[];
  const columnErrors=Object.entries(REQUIRED_COLUMNS).filter(([index,column])=>currentColumns[Number(index)]!==column)
    .map(([index,column])=>'Coluna '+(Number(index)+1)+' esperada: '+column);
  const changedFormulas:string[]=[];
  let newCount=0,oldCount=0,changedCount=0,addedCount=0,removedCount=0;
  for(const name of FORMULA_SHEETS){
    const current=newBook.sheets[name]?.cells||{};
    const previous=oldBook?.sheets?.[name]?.cells||{};
    const nowFormulas=Object.fromEntries(Object.entries(current).filter(([,cell])=>cell&&typeof cell==='object'&&'formula'in cell));
    const wasFormulas=Object.fromEntries(Object.entries(previous).filter(([,cell])=>cell&&typeof cell==='object'&&'formula'in cell));
    newCount+=Object.keys(nowFormulas).length;
    oldCount+=Object.keys(wasFormulas).length;
    if(!oldBook)continue;
    for(const address of new Set([...Object.keys(nowFormulas),...Object.keys(wasFormulas)])){
      if(!(address in wasFormulas)){addedCount++;if(changedFormulas.length<24)changedFormulas.push(name+'!'+address+' · adicionada');}
      else if(!(address in nowFormulas)){removedCount++;if(changedFormulas.length<24)changedFormulas.push(name+'!'+address+' · removida');}
      else if((wasFormulas[address] as {formula:string}).formula!==(nowFormulas[address] as {formula:string}).formula){
        changedCount++;if(changedFormulas.length<24)changedFormulas.push(name+'!'+address+' · alterada');
      }
    }
  }
  const approved=approvedHashes.includes(newBook.formulaHash);
  return {
    currentVersion:{fileName:oldBook?.fileName||null,formulaHash:oldBook?.formulaHash||null},
    uploadedVersion:{fileName:newBook.fileName,formulaHash:newBook.formulaHash},
    reviewedModel:approved,
    requiredStructureValid:columnErrors.length===0,
    columnErrors,
    comparisonAvailable:!!oldBook,
    formulaComparison:oldBook?{currentFormulaCells:oldCount,newFormulaCells:newCount,changed:changedCount,added:addedCount,removed:removedCount,sample:changedFormulas}:null,
    canActivateWithCurrentReviewedModels:approved&&columnErrors.length===0,
    warning:approved&&columnErrors.length===0
      ? 'Modelo estrutural reconhecido. Ainda é necessário confirmar as condições comerciais e a vigência.'
      : 'Modelo ainda não homologado. A comparação não ativa nem altera a planilha vigente.',
  };
}
