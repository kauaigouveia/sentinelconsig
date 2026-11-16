/** At most one selected condition per origin contract; unified Daycoval quotes stand alone. */
export function toggleInssQuoteSelection<T extends {contractLabel?:string;unified?:boolean}>(
  selected:readonly T[],row:T,
):T[]{
  if(selected.includes(row))return selected.filter(item=>item!==row);
  if(row.unified)return [row];
  return [
    ...selected.filter(item=>!item.unified && item.contractLabel!==row.contractLabel),
    row,
  ];
}
